import 'server-only'

import { requireUserId } from '@/lib/studies/data'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Server data layer for the employee roster.
 *
 * The roster owns people (the shared `workers` table from 0004); the floor
 * builder and the Time Study Tool consume them. Reads aggregate an employee's
 * attributed timings (observations + master runs) across every study, which is
 * the foundation future labor-planning features build on. Shared data — every
 * signed-in leadership user can see it.
 */

export type RosterRow = {
  id: string
  fullName: string
  active: boolean
  stationName: string | null
  observationCount: number
  masterRunCount: number
  lastTimedAt: string | null
}

export type WorkerStudyPerformance = {
  studyId: string
  studyTitle: string
  steps: { stepId: string; stepName: string; obsCount: number; avgMs: number; minMs: number; maxMs: number }[]
  masterRuns: { count: number; avgMs: number } | null
}

export type WorkerProfile = {
  id: string
  fullName: string
  active: boolean
  stationName: string | null
  totals: { studies: number; observations: number; masterRuns: number }
  studies: WorkerStudyPerformance[]
}

/** Everyone on the roster (including inactive), with timing activity counts. */
export async function listRoster(): Promise<RosterRow[]> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  // Parallel selects + in-code joins (hand-written types don't model relationships).
  const [workersRes, obsRes, runsRes, assignRes, stationsRes, gcRes] = await Promise.all([
    supabase.from('workers').select('id, full_name, active').order('full_name', { ascending: true }),
    supabase.from('observations').select('worker_id, study_id, recorded_at').not('worker_id', 'is', null),
    supabase.from('master_runs').select('worker_id, study_id, recorded_at').not('worker_id', 'is', null),
    supabase.from('station_assignments').select('worker_id, station_id'),
    supabase.from('stations').select('id, name'),
    supabase.from('studies').select('id').eq('is_group_check', true),
  ])
  for (const r of [workersRes, obsRes, runsRes, assignRes, stationsRes, gcRes]) {
    if (r.error) throw r.error
  }
  // Group / process checks label who did what but never roll up to roster stats.
  const excludedStudies = new Set((gcRes.data ?? []).map((s) => s.id))

  const obsCount = new Map<string, number>()
  const lastTimed = new Map<string, string>()
  for (const row of obsRes.data ?? []) {
    if (!row.worker_id || excludedStudies.has(row.study_id)) continue
    obsCount.set(row.worker_id, (obsCount.get(row.worker_id) ?? 0) + 1)
    const prev = lastTimed.get(row.worker_id)
    if (!prev || row.recorded_at > prev) lastTimed.set(row.worker_id, row.recorded_at)
  }
  const runCount = new Map<string, number>()
  for (const row of runsRes.data ?? []) {
    if (!row.worker_id || excludedStudies.has(row.study_id)) continue
    runCount.set(row.worker_id, (runCount.get(row.worker_id) ?? 0) + 1)
    const prev = lastTimed.get(row.worker_id)
    if (!prev || row.recorded_at > prev) lastTimed.set(row.worker_id, row.recorded_at)
  }

  const stationName = new Map((stationsRes.data ?? []).map((s) => [s.id, s.name]))
  const stationOf = new Map<string, string | null>()
  for (const a of assignRes.data ?? []) {
    stationOf.set(a.worker_id, stationName.get(a.station_id) ?? null)
  }

  return (workersRes.data ?? []).map((w) => ({
    id: w.id,
    fullName: w.full_name,
    active: w.active,
    stationName: stationOf.get(w.id) ?? null,
    observationCount: obsCount.get(w.id) ?? 0,
    masterRunCount: runCount.get(w.id) ?? 0,
    lastTimedAt: lastTimed.get(w.id) ?? null,
  }))
}

/** One employee's measured performance across every study. Null if missing. */
export async function getWorkerProfile(workerId: string): Promise<WorkerProfile | null> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const { data: worker, error } = await supabase
    .from('workers')
    .select('id, full_name, active')
    .eq('id', workerId)
    .maybeSingle()
  if (error) throw error
  if (!worker) return null

  const [obsRes, runsRes, assignRes, gcRes] = await Promise.all([
    supabase.from('observations').select('step_id, study_id, duration_ms').eq('worker_id', workerId),
    supabase.from('master_runs').select('study_id, duration_ms').eq('worker_id', workerId),
    supabase.from('station_assignments').select('station_id').eq('worker_id', workerId).maybeSingle(),
    supabase.from('studies').select('id').eq('is_group_check', true),
  ])
  if (obsRes.error) throw obsRes.error
  if (runsRes.error) throw runsRes.error
  if (assignRes.error) throw assignRes.error
  if (gcRes.error) throw gcRes.error

  // Group / process checks label who did what but are excluded from individual
  // performance, so they never appear on a roster profile.
  const excludedStudies = new Set((gcRes.data ?? []).map((s) => s.id))
  const obs = (obsRes.data ?? []).filter((o) => !excludedStudies.has(o.study_id))
  const runs = (runsRes.data ?? []).filter((r) => !excludedStudies.has(r.study_id))

  let stationName: string | null = null
  if (assignRes.data) {
    const { data: station } = await supabase
      .from('stations')
      .select('name')
      .eq('id', assignRes.data.station_id)
      .maybeSingle()
    stationName = station?.name ?? null
  }

  const studyIds = [...new Set([...obs.map((o) => o.study_id), ...runs.map((r) => r.study_id)])]
  const stepIds = [...new Set(obs.map((o) => o.step_id))]

  const [studiesRes, stepsRes] = await Promise.all([
    studyIds.length
      ? supabase.from('studies').select('id, title, updated_at').in('id', studyIds)
      : Promise.resolve({ data: [], error: null }),
    stepIds.length
      ? supabase.from('steps').select('id, name').in('id', stepIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (studiesRes.error) throw studiesRes.error
  if (stepsRes.error) throw stepsRes.error

  const stepName = new Map((stepsRes.data ?? []).map((s) => [s.id, s.name]))

  // durations per study per step, then aggregate.
  const perStudyStep = new Map<string, Map<string, number[]>>()
  for (const o of obs) {
    const steps = perStudyStep.get(o.study_id) ?? new Map<string, number[]>()
    const list = steps.get(o.step_id) ?? []
    list.push(o.duration_ms)
    steps.set(o.step_id, list)
    perStudyStep.set(o.study_id, steps)
  }
  const perStudyRuns = new Map<string, number[]>()
  for (const r of runs) {
    const list = perStudyRuns.get(r.study_id) ?? []
    list.push(r.duration_ms)
    perStudyRuns.set(r.study_id, list)
  }

  const studies: WorkerStudyPerformance[] = (studiesRes.data ?? [])
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((s) => {
      const stepDurations = perStudyStep.get(s.id) ?? new Map<string, number[]>()
      const runDurations = perStudyRuns.get(s.id) ?? []
      return {
        studyId: s.id,
        studyTitle: s.title,
        steps: [...stepDurations.entries()].map(([stepId, durations]) => ({
          stepId,
          stepName: stepName.get(stepId) ?? 'Deleted step',
          obsCount: durations.length,
          avgMs: durations.reduce((a, v) => a + v, 0) / durations.length,
          minMs: Math.min(...durations),
          maxMs: Math.max(...durations),
        })),
        masterRuns: runDurations.length
          ? { count: runDurations.length, avgMs: runDurations.reduce((a, v) => a + v, 0) / runDurations.length }
          : null,
      }
    })

  return {
    id: worker.id,
    fullName: worker.full_name,
    active: worker.active,
    stationName,
    totals: { studies: studyIds.length, observations: obs.length, masterRuns: runs.length },
    studies,
  }
}

/** id → full name for every worker (incl. inactive), to label attributed timings. */
export async function workerNameMap(): Promise<Map<string, string>> {
  await requireUserId()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('workers').select('id, full_name')
  if (error) throw error
  return new Map((data ?? []).map((w) => [w.id, w.full_name]))
}

/** Active workers for pickers (timer "Timing:" selector, etc.). */
export async function listWorkerOptions(): Promise<{ id: string; fullName: string }[]> {
  await requireUserId()
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((w) => ({ id: w.id, fullName: w.full_name }))
}
