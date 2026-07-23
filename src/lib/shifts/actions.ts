'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import {
  calculateStaffingPlan,
  describeFlexTarget,
  formatClock24,
  MATERIAL_HANDLING_WORKERS,
  MAX_HEADCOUNT,
  parseClockToMinutes,
  REPLENISHMENT_WORKERS,
  type KitType,
} from '@/lib/staffing-model'
import { requireUserId } from '@/lib/studies/data'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { StoredFlexRecommendation } from './data'

/**
 * Mutations for Shift Planning. The plan is recomputed here from the raw
 * inputs — the client's rendered plan is display-only, so a tampered payload
 * can never write inconsistent numbers. Saving is explicit (the "Save Plan"
 * button); generation alone never writes.
 *
 * TODO(role-access): add assertRole('supervisor') once role wiring is on.
 */

export type SaveShiftPlanInput = {
  shiftDate: string // YYYY-MM-DD
  shiftStartTime: string // HH:MM
  availableHeadcount: number
  fakQty: number
  rakQty: number
  uyakQty: number
}

function validate(input: SaveShiftPlanInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.shiftDate)) return 'Enter a valid shift date.'
  if (!/^\d{2}:\d{2}$/.test(input.shiftStartTime)) return 'Enter a valid shift start time.'
  const counts = [input.availableHeadcount, input.fakQty, input.rakQty, input.uyakQty]
  if (!counts.every((n) => Number.isInteger(n) && n >= 0)) return 'Counts must be whole numbers of zero or more.'
  if (input.availableHeadcount < 1 || input.availableHeadcount > MAX_HEADCOUNT)
    return `Headcount must be between 1 and ${MAX_HEADCOUNT}.`
  return null
}

export async function saveShiftPlan(input: SaveShiftPlanInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId()
  const err = validate(input)
  if (err) return { ok: false, error: err }

  const plan = calculateStaffingPlan({
    availableHeadcount: input.availableHeadcount,
    fakQty: input.fakQty,
    rakQty: input.rakQty,
    uyakQty: input.uyakQty,
  })
  if (!plan.ok) return { ok: false, error: plan.errors[0] ?? 'Plan inputs are invalid.' }

  const startMin = parseClockToMinutes(input.shiftStartTime)
  const flexJson: StoredFlexRecommendation[] = plan.flex.map((e) => ({
    kind: e.kind,
    trigger_min: Math.round(e.triggerMin),
    trigger_time: formatClock24(startMin + e.triggerMin),
    from_area: e.fromArea,
    workers: e.workers,
    to_area: describeFlexTarget(e),
    new_completion_min: e.newCompletionMin === null ? null : Math.round(e.newCompletionMin),
  }))

  const kit = (k: KitType) => plan.kits.find((o) => o.kit === k)
  const roundMin = (n: number | null | undefined) => (n == null ? null : Math.round(n))

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('shift_plans')
    .insert({
      created_by: userId,
      shift_date: input.shiftDate,
      shift_start_time: input.shiftStartTime,
      available_headcount: input.availableHeadcount,
      fak_qty: input.fakQty,
      rak_qty: input.rakQty,
      uyak_qty: input.uyakQty,
      rec_fak_rak_workers: plan.areas.fakRak?.workers ?? null,
      rec_uyak_stations: plan.areas.uyak?.stations ?? null,
      rec_tape_scan_workers: plan.areas.uyak?.tapeScanWorkers ?? null,
      rec_assembly_workers: plan.areas.assembly?.workers ?? null,
      rec_assembly_lines: plan.areas.assembly?.lines ?? null,
      rec_material_handling: MATERIAL_HANDLING_WORKERS,
      rec_replenishment: REPLENISHMENT_WORKERS,
      est_fak_completion_min: roundMin(kit('FAK')?.completionMin),
      est_rak_completion_min: roundMin(kit('RAK')?.completionMin),
      est_uyak_completion_min: roundMin(kit('UYAK')?.completionMin),
      est_assembly_completion_min: roundMin(plan.areas.assembly?.completionMin),
      flex_recommendations: flexJson,
      fak_status: kit('FAK')?.status ?? null,
      rak_status: kit('RAK')?.status ?? null,
      uyak_status: kit('UYAK')?.status ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/shifts')
  return { ok: true, data: { id: data.id } }
}
