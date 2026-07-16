/**
 * Pure, isomorphic helpers for the Floor Layout Builder.
 *
 * No React, no DB, no `server-only` — safe to import from Server Components,
 * Client Components, and server actions alike. All coordinates are in the
 * plan's image/canvas pixel space.
 */
import type { FloorShapeGeometry, FloorShapeKind } from '@/lib/supabase/types'

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
  stationCount: number
}

export type RollUp = {
  /** Planned headcount across every station on the plan. */
  totalHeadcount: number
  totalStations: number
  perArea: AreaRollUp[]
  /** Stations that fall outside every area. */
  unassigned: { headcount: number; stationCount: number }
}

/** Sum planned headcount per area (by geometric containment) and plan-wide. */
export function rollUp(shapes: FloorShape[]): RollUp {
  const areas = shapes.filter((s) => s.kind === 'area')
  const stations = shapes.filter((s) => s.kind === 'station')

  const perArea = new Map<string, AreaRollUp>(
    areas.map((a) => [a.id, { areaId: a.id, label: a.label, color: a.color, headcount: 0, stationCount: 0 }])
  )
  const unassigned = { headcount: 0, stationCount: 0 }

  let totalHeadcount = 0
  for (const st of stations) {
    totalHeadcount += st.plannedHeadcount
    const areaId = areaOfStation(st, areas)
    const bucket = areaId ? perArea.get(areaId) : null
    if (bucket) {
      bucket.headcount += st.plannedHeadcount
      bucket.stationCount += 1
    } else {
      unassigned.headcount += st.plannedHeadcount
      unassigned.stationCount += 1
    }
  }

  return {
    totalHeadcount,
    totalStations: stations.length,
    perArea: [...perArea.values()],
    unassigned,
  }
}
