import 'server-only'

import { requireUserId } from '@/lib/studies/data'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { ShiftKitStatus } from '@/lib/supabase/types'

/**
 * Server data layer for Shift Planning. Saved plans are shared operational
 * data — any signed-in leadership user can read them; created_by records who
 * saved a plan (attribution, not authorization).
 *
 * TODO(role-access): once role wiring is turned on, gate reads/writes to
 * supervisor+ with assertRole('supervisor') from src/lib/users/data.ts.
 */

export type StoredFlexRecommendation = {
  kind: 'move' | 'pivot'
  trigger_min: number
  trigger_time: string // 'HH:MM' (24h), clock time of the trigger
  from_area: string
  workers: number
  to_area: string
  new_completion_min: number | null
}

export type ShiftPlanRecord = {
  id: string
  createdAt: string
  createdBy: string
  shiftDate: string // YYYY-MM-DD
  shiftStartTime: string // HH:MM
  availableHeadcount: number
  fakQty: number
  rakQty: number
  uyakQty: number
  recFakRakWorkers: number | null
  recUyakStations: number | null
  recTapeScanWorkers: number | null
  recAssemblyWorkers: number | null
  recAssemblyLines: number | null
  recMaterialHandling: number | null
  recReplenishment: number | null
  estFakCompletionMin: number | null
  estRakCompletionMin: number | null
  estUyakCompletionMin: number | null
  estAssemblyCompletionMin: number | null
  flex: StoredFlexRecommendation[]
  fakStatus: ShiftKitStatus | null
  rakStatus: ShiftKitStatus | null
  uyakStatus: ShiftKitStatus | null
  notes: string | null
}

const HISTORY_DAYS = 30

/** Saved plans from the last 30 days, newest shift (then newest save) first. */
export async function listShiftPlans(): Promise<ShiftPlanRecord[]> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const cutoff = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('shift_plans')
    .select(
      'id, created_at, created_by, shift_date, shift_start_time, available_headcount, fak_qty, rak_qty, uyak_qty, rec_fak_rak_workers, rec_uyak_stations, rec_tape_scan_workers, rec_assembly_workers, rec_assembly_lines, rec_material_handling, rec_replenishment, est_fak_completion_min, est_rak_completion_min, est_uyak_completion_min, est_assembly_completion_min, flex_recommendations, fak_status, rak_status, uyak_status, notes'
    )
    .gte('shift_date', cutoff)
    .order('shift_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    // Fail soft so the planner still works before the shift_plans migration
    // has been applied — history just renders empty.
    console.warn('listShiftPlans failed (has the shift_plans migration been run?):', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    shiftDate: row.shift_date,
    shiftStartTime: row.shift_start_time.slice(0, 5),
    availableHeadcount: row.available_headcount,
    fakQty: row.fak_qty,
    rakQty: row.rak_qty,
    uyakQty: row.uyak_qty,
    recFakRakWorkers: row.rec_fak_rak_workers,
    recUyakStations: row.rec_uyak_stations,
    recTapeScanWorkers: row.rec_tape_scan_workers,
    recAssemblyWorkers: row.rec_assembly_workers,
    recAssemblyLines: row.rec_assembly_lines,
    recMaterialHandling: row.rec_material_handling,
    recReplenishment: row.rec_replenishment,
    estFakCompletionMin: row.est_fak_completion_min,
    estRakCompletionMin: row.est_rak_completion_min,
    estUyakCompletionMin: row.est_uyak_completion_min,
    estAssemblyCompletionMin: row.est_assembly_completion_min,
    flex: (row.flex_recommendations as StoredFlexRecommendation[] | null) ?? [],
    fakStatus: row.fak_status,
    rakStatus: row.rak_status,
    uyakStatus: row.uyak_status,
    notes: row.notes,
  }))
}
