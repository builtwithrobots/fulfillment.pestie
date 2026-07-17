'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireUserId } from './data'

/**
 * Mutations for the Time Study Tool. Studies are shared operational data —
 * any signed-in leadership user can edit any study (created_by is attribution,
 * not authorization). Each action validates the Clerk session (requireUserId)
 * before writing through the service-role client. RLS is a second line of
 * defense.
 */

export type StepInput = {
  id?: string // present when editing an existing step
  name: string
  notes: string
  timed: boolean
}

export type StudyInput = {
  title: string
  wageRate: number
  useWholeTimer: boolean
  steps: StepInput[]
}

export type { ActionResult }

function validate(input: StudyInput): string | null {
  if (!input.title.trim()) return 'Please enter a study title.'
  if (input.steps.length === 0) return 'Add at least one step to begin.'
  if (input.steps.some((s) => !s.name.trim())) return 'Every step needs a name.'
  if (!(input.wageRate >= 0)) return 'Wage rate must be zero or more.'
  return null
}

/** Confirm the study exists; returns false if not. */
async function assertExists(supabase: ReturnType<typeof createServiceRoleClient>, studyId: string): Promise<boolean> {
  const { data, error } = await supabase.from('studies').select('id').eq('id', studyId).maybeSingle()
  if (error) throw error
  return !!data
}

export async function createStudy(input: StudyInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId()
  const err = validate(input)
  if (err) return { ok: false, error: err }

  const supabase = createServiceRoleClient()
  const { data: study, error } = await supabase
    .from('studies')
    .insert({
      created_by: userId,
      title: input.title.trim(),
      wage_rate: input.wageRate,
      use_whole_timer: input.useWholeTimer,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  const rows = input.steps.map((s, i) => ({
    study_id: study.id,
    name: s.name.trim(),
    notes: s.notes.trim() || null,
    timed: s.timed,
    position: i,
  }))
  const { error: stepsError } = await supabase.from('steps').insert(rows)
  if (stepsError) return { ok: false, error: stepsError.message }

  revalidatePath('/studies')
  return { ok: true, data: { id: study.id } }
}

export async function updateStudy(studyId: string, input: StudyInput): Promise<ActionResult> {
  await requireUserId()
  const err = validate(input)
  if (err) return { ok: false, error: err }

  const supabase = createServiceRoleClient()
  if (!(await assertExists(supabase, studyId))) return { ok: false, error: 'Study not found.' }

  const { error: studyError } = await supabase
    .from('studies')
    .update({
      title: input.title.trim(),
      wage_rate: input.wageRate,
      use_whole_timer: input.useWholeTimer,
    })
    .eq('id', studyId)
  if (studyError) return { ok: false, error: studyError.message }

  // Reconcile steps by id so observations on kept steps survive an edit:
  // update existing, insert new, delete removed.
  const { data: existing, error: existingError } = await supabase.from('steps').select('id').eq('study_id', studyId)
  if (existingError) return { ok: false, error: existingError.message }

  const existingIds = new Set((existing ?? []).map((s) => s.id))
  const keptIds = new Set(input.steps.filter((s) => s.id).map((s) => s.id as string))

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await supabase.from('steps').delete().in('id', toDelete)
    if (error) return { ok: false, error: error.message }
  }

  for (let i = 0; i < input.steps.length; i++) {
    const s = input.steps[i]
    const payload = {
      name: s.name.trim(),
      notes: s.notes.trim() || null,
      timed: s.timed,
      position: i,
    }
    if (s.id && existingIds.has(s.id)) {
      const { error } = await supabase.from('steps').update(payload).eq('id', s.id)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('steps').insert({ study_id: studyId, ...payload })
      if (error) return { ok: false, error: error.message }
    }
  }

  revalidatePath('/studies')
  revalidatePath(`/studies/${studyId}/setup`)
  revalidatePath(`/studies/${studyId}/timer`)
  revalidatePath(`/studies/${studyId}/results`)
  return { ok: true }
}

export async function deleteStudy(studyId: string): Promise<ActionResult> {
  await requireUserId()
  const supabase = createServiceRoleClient()
  // Steps, observations and master runs cascade.
  const { error } = await supabase.from('studies').delete().eq('id', studyId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/studies')
  return { ok: true }
}

/** Copy the study row + its steps into a fresh study. No observations/runs. */
export async function duplicateStudy(studyId: string): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId()
  const supabase = createServiceRoleClient()

  const { data: source, error } = await supabase
    .from('studies')
    .select('title, wage_rate, use_whole_timer')
    .eq('id', studyId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!source) return { ok: false, error: 'Study not found.' }

  const { data: copy, error: copyError } = await supabase
    .from('studies')
    .insert({
      created_by: userId,
      title: `${source.title} (copy)`,
      wage_rate: source.wage_rate,
      use_whole_timer: source.use_whole_timer,
    })
    .select('id')
    .single()
  if (copyError) return { ok: false, error: copyError.message }

  const { data: steps, error: stepsError } = await supabase
    .from('steps')
    .select('name, notes, timed, position')
    .eq('study_id', studyId)
    .order('position', { ascending: true })
  if (stepsError) return { ok: false, error: stepsError.message }

  if (steps && steps.length > 0) {
    const { error: insertError } = await supabase.from('steps').insert(steps.map((s) => ({ study_id: copy.id, ...s })))
    if (insertError) return { ok: false, error: insertError.message }
  }

  revalidatePath('/studies')
  return { ok: true, data: { id: copy.id } }
}

/**
 * Record ONE observation immediately (called on every Stop click — no batching).
 * Verifies the step belongs to the study before writing. workerId attributes
 * the timing to a roster employee (null = unattributed).
 */
export async function recordObservation(
  studyId: string,
  stepId: string,
  durationMs: number,
  workerId: string | null = null
): Promise<ActionResult<{ id: string }>> {
  await requireUserId()
  if (!Number.isFinite(durationMs) || durationMs < 0) return { ok: false, error: 'Invalid duration.' }

  const supabase = createServiceRoleClient()

  if (!(await assertExists(supabase, studyId))) return { ok: false, error: 'Study not found.' }
  const { data: step, error: stepError } = await supabase
    .from('steps')
    .select('id')
    .eq('id', stepId)
    .eq('study_id', studyId)
    .maybeSingle()
  if (stepError) return { ok: false, error: stepError.message }
  if (!step) return { ok: false, error: 'Step not found.' }

  const { data, error } = await supabase
    .from('observations')
    .insert({ study_id: studyId, step_id: stepId, duration_ms: Math.round(durationMs), worker_id: workerId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { id: data.id } }
}

/** Record one full-process master run immediately. */
export async function recordMasterRun(
  studyId: string,
  durationMs: number,
  workerId: string | null = null
): Promise<ActionResult<{ id: string }>> {
  await requireUserId()
  if (!Number.isFinite(durationMs) || durationMs <= 0) return { ok: false, error: 'Invalid duration.' }

  const supabase = createServiceRoleClient()
  if (!(await assertExists(supabase, studyId))) return { ok: false, error: 'Study not found.' }

  const { data, error } = await supabase
    .from('master_runs')
    .insert({ study_id: studyId, duration_ms: Math.round(durationMs), worker_id: workerId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { id: data.id } }
}
