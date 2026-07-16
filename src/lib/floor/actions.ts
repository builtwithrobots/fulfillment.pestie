'use server'

import { revalidatePath } from 'next/cache'

import type { FloorShapeGeometry, FloorShapeKind } from '@/lib/supabase/types'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/studies/data'

/**
 * Mutations for the Floor Layout Builder. Floor plans are shared config, so
 * there is no per-user scoping, but every action validates the Clerk session
 * first and writes through the service-role client. RLS restricts the anon
 * client to admins as a second line of defense.
 */

const IMAGE_BUCKET = 'floor-plans'
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

export type ShapeInput = {
  kind: FloorShapeKind
  shape: FloorShapeGeometry
  x: number
  y: number
  w: number
  h: number
  label?: string
  color?: string
  stationId?: string | null
  plannedHeadcount?: number
}

export type ShapePatch = Partial<{
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
  color: string
  stationId: string | null
  plannedHeadcount: number
}>

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export async function createPlan(name: string): Promise<ActionResult<{ id: string }>> {
  await requireUserId()
  const clean = name.trim()
  if (!clean) return { ok: false, error: 'Please enter a plan name.' }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('floor_plans').insert({ name: clean }).select('id').single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/floor')
  return { ok: true, data: { id: data.id } }
}

export async function renamePlan(planId: string, name: string): Promise<ActionResult> {
  await requireUserId()
  const clean = name.trim()
  if (!clean) return { ok: false, error: 'Please enter a plan name.' }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('floor_plans').update({ name: clean }).eq('id', planId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/floor')
  revalidatePath(`/floor/${planId}`)
  return { ok: true }
}

export async function setActivePlan(planId: string): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  // Exactly one active plan: clear the current one, then activate the target.
  const { error: clearError } = await supabase.from('floor_plans').update({ is_active: false }).eq('is_active', true)
  if (clearError) return { ok: false, error: clearError.message }
  const { error } = await supabase.from('floor_plans').update({ is_active: true }).eq('id', planId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/floor')
  return { ok: true }
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('floor_plans').delete().eq('id', planId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/floor')
  return { ok: true }
}

/** Upload/replace the plan's background image. Natural dims come from the client. */
export async function uploadPlanImage(planId: string, formData: FormData): Promise<ActionResult> {
  await requireUserId()

  const file = formData.get('file')
  const width = Number(formData.get('width'))
  const height = Number(formData.get('height'))
  if (!(file instanceof File)) return { ok: false, error: 'No image provided.' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'File must be an image.' }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Image is too large (max 15 MB).' }
  if (!(width > 0) || !(height > 0)) return { ok: false, error: 'Could not read image dimensions.' }

  const supabase = createServiceRoleClient()
  const path = `${planId}/background`
  const { error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) return { ok: false, error: uploadError.message }

  const { error } = await supabase
    .from('floor_plans')
    .update({ image_path: path, image_width: Math.round(width), image_height: Math.round(height) })
    .eq('id', planId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/floor/${planId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
export async function createShape(planId: string, input: ShapeInput): Promise<ActionResult<{ id: string }>> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  // New shapes go on top (highest sort_order) so containment picks the latest.
  const { data: top } = await supabase
    .from('floor_shapes')
    .select('sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = (top?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('floor_shapes')
    .insert({
      plan_id: planId,
      kind: input.kind,
      shape: input.shape,
      x: input.x,
      y: input.y,
      w: input.w,
      h: input.h,
      label: input.label ?? '',
      color: input.color ?? '#34d399',
      station_id: input.stationId ?? null,
      planned_headcount: input.plannedHeadcount ?? 0,
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { id: data.id } }
}

export async function updateShape(shapeId: string, patch: ShapePatch): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const payload: Partial<{
    x: number
    y: number
    w: number
    h: number
    rotation: number
    label: string
    color: string
    station_id: string | null
    planned_headcount: number
  }> = {}
  if (patch.x !== undefined) payload.x = patch.x
  if (patch.y !== undefined) payload.y = patch.y
  if (patch.w !== undefined) payload.w = patch.w
  if (patch.h !== undefined) payload.h = patch.h
  if (patch.rotation !== undefined) payload.rotation = patch.rotation
  if (patch.label !== undefined) payload.label = patch.label
  if (patch.color !== undefined) payload.color = patch.color
  if (patch.stationId !== undefined) payload.station_id = patch.stationId
  if (patch.plannedHeadcount !== undefined) payload.planned_headcount = patch.plannedHeadcount
  if (Object.keys(payload).length === 0) return { ok: true }

  const { error } = await supabase.from('floor_shapes').update(payload).eq('id', shapeId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteShape(shapeId: string): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('floor_shapes').delete().eq('id', shapeId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
