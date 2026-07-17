/**
 * Pure, isomorphic helpers for the Floor Layout Builder.
 *
 * No React, no DB, no `server-only` — safe to import from Server Components,
 * Client Components, and server actions alike. All coordinates are in the
 * plan's image/canvas pixel space.
 */
import type { FloorShapeGeometry, FloorShapeKind } from '@/lib/supabase/types'

// Default virtual canvas for plans without a background image. Shared by the
// editor and the print view so both render the same coordinate space.
export const DEFAULT_CANVAS_W = 2400
export const DEFAULT_CANVAS_H = 1500

/** Visual-only annotations: never counted in the labor roll-up. */
export function isAnnotation(kind: FloorShapeKind): boolean {
  return kind === 'label' || kind === 'arrow' || kind === 'figure'
}

/** Normalize an angle in degrees into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Camel-cased shape used throughout the UI (mapped from the DB row in data.ts). */
export type FloorShape = {
  id: string
  kind: FloorShapeKind
  shape: FloorShapeGeometry
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
  color: string
  stationId: string | null
  plannedHeadcount: number
  sortOrder: number
  locked: boolean
}

export type Point = { x: number; y: number }

/** Center of a shape's bounding box. */
export function centerOf(s: Pick<FloorShape, 'x' | 'y' | 'w' | 'h'>): Point {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 }
}

/** Is `p` inside the shape's (axis-aligned) bounding box? */
export function contains(s: Pick<FloorShape, 'x' | 'y' | 'w' | 'h'>, p: Point): boolean {
  return p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h
}

/**
 * The area a station belongs to: the top-most (highest sortOrder) area whose
 * box contains the station's center. Null if it sits outside every area.
 */
export function areaOfStation(station: FloorShape, areas: FloorShape[]): string | null {
  const c = centerOf(station)
  let best: FloorShape | null = null
  for (const a of areas) {
    if (contains(a, c) && (best === null || a.sortOrder > best.sortOrder)) best = a
  }
  return best?.id ?? null
}

/** Group station assignments by real station id. */
export function groupAssignments<T extends { stationId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const list = map.get(r.stationId) ?? []
    list.push(r)
    map.set(r.stationId, list)
  }
  return map
}

/**
 * Names to show on a station shape: the assigned names for a linked station,
 * null for everything else (areas, annotations, unlinked stations).
 */
export function assignedNamesFor(shape: FloorShape, byStation: Map<string, { fullName: string }[]>): string[] | null {
  if (shape.kind !== 'station' || !shape.stationId) return null
  return (byStation.get(shape.stationId) ?? []).map((a) => a.fullName)
}

/**
 * Canvas paint order: areas at the bottom, stations above them (so they stay
 * clickable), annotations on top (arrows/labels overlay both). sortOrder
 * breaks ties within each band.
 */
export function zOrdered(shapes: FloorShape[]): FloorShape[] {
  const band = (s: FloorShape) => (s.kind === 'area' ? 0 : s.kind === 'station' ? 1 : 2)
  return [...shapes].sort((a, b) => band(a) - band(b) || a.sortOrder - b.sortOrder)
}

/** Snap a value to the nearest grid multiple (grid <= 0 disables snapping). */
export function snap(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value
}

/** Clamp a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export type AreaRollUp = {
  areaId: string
  label: string
  color: string
  headcount: number
  assigned: number
  stationCount: number
}

export type RollUp = {
  /** Planned headcount across every station on the plan. */
  totalHeadcount: number
  /** Assigned people across every linked station on the plan. */
  totalAssigned: number
  totalStations: number
  perArea: AreaRollUp[]
  /** Stations that fall outside every area. */
  unassigned: { headcount: number; assigned: number; stationCount: number }
}

/**
 * Sum planned headcount per area (by geometric containment) and plan-wide.
 * Pass `assignedByStationId` (real station id -> assigned count) to also roll up
 * live staffing coverage; omit it and assigned totals are zero.
 */
export function rollUp(shapes: FloorShape[], assignedByStationId?: Map<string, number>): RollUp {
  const areas = shapes.filter((s) => s.kind === 'area')
  const stations = shapes.filter((s) => s.kind === 'station')

  const perArea = new Map<string, AreaRollUp>(
    areas.map((a) => [
      a.id,
      { areaId: a.id, label: a.label, color: a.color, headcount: 0, assigned: 0, stationCount: 0 },
    ])
  )
  const unassigned = { headcount: 0, assigned: 0, stationCount: 0 }

  const assignedOf = (st: FloorShape) => (st.stationId ? (assignedByStationId?.get(st.stationId) ?? 0) : 0)

  let totalHeadcount = 0
  let totalAssigned = 0
  for (const st of stations) {
    const assigned = assignedOf(st)
    totalHeadcount += st.plannedHeadcount
    totalAssigned += assigned
    const areaId = areaOfStation(st, areas)
    const bucket = areaId ? perArea.get(areaId) : null
    if (bucket) {
      bucket.headcount += st.plannedHeadcount
      bucket.assigned += assigned
      bucket.stationCount += 1
    } else {
      unassigned.headcount += st.plannedHeadcount
      unassigned.assigned += assigned
      unassigned.stationCount += 1
    }
  }

  return {
    totalHeadcount,
    totalAssigned,
    totalStations: stations.length,
    perArea: [...perArea.values()],
    unassigned,
  }
}
