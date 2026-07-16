import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/server'
import type { FloorShape } from '@/lib/floor/geometry'
import { requireUserId } from '@/lib/studies/data'

/**
 * Server data layer for the Floor Layout Builder.
 *
 * Floor plans are shared operational config (like lines/stations), not per-user
 * data. Every read still validates the Clerk session (requireUserId) and goes
 * through the service-role client; RLS is defense-in-depth.
 */

const IMAGE_BUCKET = 'floor-plans'
// Long enough that an editor left open all shift keeps its background image.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 12

export type PlanSummary = {
  id: string
  name: string
  isActive: boolean
  hasImage: boolean
  createdAt: string
  updatedAt: string
}

export type PlanDetail = {
  id: string
  name: string
  isActive: boolean
  imageUrl: string | null
  imageWidth: number | null
  imageHeight: number | null
  createdAt: string
  updatedAt: string
}

export type StationOption = {
  id: string
  name: string
  lineName: string | null
}

function mapShape(row: {
  id: string
  kind: FloorShape['kind']
  shape: FloorShape['shape']
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
  color: string
  station_id: string | null
  planned_headcount: number
  sort_order: number
}): FloorShape {
  return {
    id: row.id,
    kind: row.kind,
    shape: row.shape,
    x: Number(row.x),
    y: Number(row.y),
    w: Number(row.w),
    h: Number(row.h),
    rotation: Number(row.rotation),
    label: row.label,
    color: row.color,
    stationId: row.station_id,
    plannedHeadcount: row.planned_headcount,
    sortOrder: row.sort_order,
  }
}

async function signImage(imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null
  const supabase = createServiceRoleClient()
  const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS)
  return data?.signedUrl ?? null
}

/** All floor plans, most recently updated first. */
export async function listPlans(): Promise<PlanSummary[]> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('floor_plans')
    .select('id, name, is_active, image_path, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.is_active,
    hasImage: !!p.image_path,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

/** A single plan with a signed URL for its background image. Null if missing. */
export async function getPlan(planId: string): Promise<PlanDetail | null> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const { data: plan, error } = await supabase
    .from('floor_plans')
    .select('id, name, is_active, image_path, image_width, image_height, created_at, updated_at')
    .eq('id', planId)
    .maybeSingle()
  if (error) throw error
  if (!plan) return null

  return {
    id: plan.id,
    name: plan.name,
    isActive: plan.is_active,
    imageUrl: await signImage(plan.image_path),
    imageWidth: plan.image_width,
    imageHeight: plan.image_height,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }
}

/** Ordered shapes for a plan. */
export async function getShapes(planId: string): Promise<FloorShape[]> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('floor_shapes')
    .select('id, kind, shape, x, y, w, h, rotation, label, color, station_id, planned_headcount, sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true })
  if (error) throw error

  return (data ?? []).map(mapShape)
}

/** Existing stations (with their line name) for the station-link picker. */
export async function listStationOptions(): Promise<StationOption[]> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  // Two plain selects + an in-code join: the hand-written Database types don't
  // model relationships, so an embedded `lines(name)` select won't type.
  const [{ data: stations, error }, { data: lines, error: linesError }] = await Promise.all([
    supabase.from('stations').select('id, name, line_id').order('name', { ascending: true }),
    supabase.from('lines').select('id, name'),
  ])
  if (error) throw error
  if (linesError) throw linesError

  const lineName = new Map((lines ?? []).map((l) => [l.id, l.name]))
  return (stations ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    lineName: s.line_id ? (lineName.get(s.line_id) ?? null) : null,
  }))
}
