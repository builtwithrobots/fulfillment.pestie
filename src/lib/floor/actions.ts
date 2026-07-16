'use server'

import { revalidatePath } from 'next/cache'

import type { AppRole, FloorShapeGeometry, FloorShapeKind } from '@/lib/supabase/types'
import { listAssignments, type StationAssignment } from '@/lib/floor/data'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/studies/data'
import { assertRole } from '@/lib/users/data'

/**
 * Mutations for the Floor Layout Builder. Floor plans are shared config, so
 * there is no per-user scoping, but every action validates the Clerk session
 * and the caller's role first, then writes through the service-role client. RLS
 * restricts the anon client the same way as a second line of defense.
 *
 * Editing the layout (plans, shapes, roster) requires supervisor+; reshuffling
 * assignments on the floor requires floor_lead+.
 */

const IMAGE_BUCKET = 'floor-plans'
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

// Validate the session + require at least `min`. Returns an error string to
// short-circuit on, or null when the caller is allowed.
async function gate(min: AppRole): Promise<string | null> {
  await requireUserId()
  return assertRole(min)
}

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
  shape: FloorShapeGeometry
  label: string
  color: string
  stationId: string | null
  plannedHeadcount: number
}>

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export async function createPlan(name: string): Promise<ActionResult<{ id: string }>> {
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
  const clean = name.trim()
  if (!clean) return { ok: false, error: 'Please enter a plan name.' }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('floor_plans').insert({ name: clean }).select('id').single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/floor')
  return { ok: true, data: { id: data.id } }
}

export async function renamePlan(planId: string, name: string): Promise<ActionResult> {
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
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
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
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
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('floor_plans').delete().eq('id', planId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/floor')
  return { ok: true }
}

/** Copy a plan (name + " (copy)", same image) and all its shapes. Not active. */
export async function duplicatePlan(planId: string): Promise<ActionResult<{ id: string }>> {
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
  const supabase = createServiceRoleClient()

  const { data: source, error } = await supabase
    .from('floor_plans')
    .select('name, image_path, image_width, image_height')
    .eq('id', planId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!source) return { ok: false, error: 'Plan not found.' }

  const { data: copy, error: copyError } = await supabase
    .from('floor_plans')
    .insert({
      name: `${source.name} (copy)`,
      image_path: source.image_path,
      image_width: source.image_width,
      image_height: source.image_height,
      is_active: false,
    })
    .select('id')
    .single()
  if (copyError) return { ok: false, error: copyError.message }

  const { data: shapes, error: shapesError } = await supabase
    .from('floor_shapes')
    .select('kind, shape, x, y, w, h, rotation, label, color, station_id, planned_headcount, sort_order')
    .eq('plan_id', planId)
  if (shapesError) return { ok: false, error: shapesError.message }

  if (shapes && shapes.length > 0) {
    const { error: insertError } = await supabase
      .from('floor_shapes')
      .insert(shapes.map((s) => ({ plan_id: copy.id, ...s })))
    if (insertError) return { ok: false, error: insertError.message }
  }

  revalidatePath('/floor')
  return { ok: true, data: { id: copy.id } }
}

/** Upload/replace the plan's background image. Natural dims come from the client. */
export async function uploadPlanImage(planId: string, formData: FormData): Promise<ActionResult> {
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }

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
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
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
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
  const supabase = createServiceRoleClient()

  const payload: Partial<{
    x: number
    y: number
    w: number
    h: number
    rotation: number
    shape: FloorShapeGeometry
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
  if (patch.shape !== undefined) payload.shape = patch.shape
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
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('floor_shapes').delete().eq('id', shapeId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Workers & assignments (phase 2)
// ---------------------------------------------------------------------------
export async function createWorker(fullName: string): Promise<ActionResult<{ id: string; fullName: string }>> {
  const g = await gate('supervisor')
  if (g) return { ok: false, error: g }
  const clean = fullName.trim()
  if (!clean) return { ok: false, error: 'Please enter a name.' }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('workers').insert({ full_name: clean }).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { id: data.id, fullName: clean } }
}

/**
 * Assign a worker to a station. One station per worker: any existing assignment
 * for this worker is removed first, so this doubles as a "move". The
 * line_status.actual trigger fires for both the old and new station.
 */
export async function assignWorker(stationId: string, workerId: string): Promise<ActionResult> {
  const g = await gate('floor_lead')
  if (g) return { ok: false, error: g }
  const supabase = createServiceRoleClient()

  const { error: clearError } = await supabase.from('station_assignments').delete().eq('worker_id', workerId)
  if (clearError) return { ok: false, error: clearError.message }
  const { error } = await supabase.from('station_assignments').insert({ station_id: stationId, worker_id: workerId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function unassignWorker(workerId: string): Promise<ActionResult> {
  const g = await gate('floor_lead')
  if (g) return { ok: false, error: g }
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('station_assignments').delete().eq('worker_id', workerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Client-callable refresh: fetch all assignments (used after mutations / on Realtime). */
export async function refreshAssignments(): Promise<StationAssignment[]> {
  return listAssignments()
}
