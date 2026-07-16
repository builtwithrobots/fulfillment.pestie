import 'server-only'

import { auth } from '@clerk/nextjs/server'

import { AUTH_ENABLED } from '@/lib/auth-config'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { StepWithObservations } from '@/lib/time-study'

/**
 * Server data layer for the Time Study Tool.
 *
 * Every function validates the Clerk session first (requireUserId), then reads
 * or writes through the service-role client (which bypasses RLS) while scoping
 * every query by user_id in code. This is the pattern the brief asks for:
 * service role on the server, Clerk session validated before touching the DB.
 */

// When auth is disabled for local build-out (NEXT_PUBLIC_ENABLE_AUTH != true)
// there is no Clerk user, so studies are attributed to a stable dev id. With
// auth enabled this branch never runs — middleware redirects anonymice to
// sign-in and requireUserId throws if it somehow doesn't.
const DEV_USER_ID = 'dev-user'

export async function requireUserId(): Promise<string> {
  const { userId } = await auth()
  if (userId) return userId
  if (!AUTH_ENABLED) return DEV_USER_ID
  throw new Error('Unauthorized: no Clerk session')
}

export type StudySummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  stepCount: number
}

export type StudyDetail = {
  id: string
  title: string
  wageRate: number
  useWholeTimer: boolean
  createdAt: string
  updatedAt: string
  steps: {
    id: string
    name: string
    notes: string | null
    timed: boolean
    position: number
  }[]
}

/** Dashboard list — all of the current user's studies, newest activity first. */
export async function listStudies(): Promise<StudySummary[]> {
  const userId = await requireUserId()
  const supabase = createServiceRoleClient()

  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  if (!studies || studies.length === 0) return []

  const { data: steps, error: stepsError } = await supabase
    .from('steps')
    .select('study_id')
    .in(
      'study_id',
      studies.map((s) => s.id)
    )
  if (stepsError) throw stepsError

  const counts = new Map<string, number>()
  for (const row of steps ?? []) {
    counts.set(row.study_id, (counts.get(row.study_id) ?? 0) + 1)
  }

  return studies.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    stepCount: counts.get(s.id) ?? 0,
  }))
}

/** Full study + ordered steps, scoped to the owner. Null if not found/owned. */
export async function getStudy(studyId: string): Promise<StudyDetail | null> {
  const userId = await requireUserId()
  const supabase = createServiceRoleClient()

  const { data: study, error } = await supabase
    .from('studies')
    .select('id, title, wage_rate, use_whole_timer, created_at, updated_at')
    .eq('id', studyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!study) return null

  const { data: steps, error: stepsError } = await supabase
    .from('steps')
    .select('id, name, notes, timed, position')
    .eq('study_id', studyId)
    .order('position', { ascending: true })
  if (stepsError) throw stepsError

  return {
    id: study.id,
    title: study.title,
    wageRate: Number(study.wage_rate),
    useWholeTimer: study.use_whole_timer,
    createdAt: study.created_at,
    updatedAt: study.updated_at,
    steps: (steps ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      notes: s.notes,
      timed: s.timed,
      position: s.position,
    })),
  }
}

/**
 * Everything the timer + results screens need: steps with their observations
 * (oldest → newest) plus master runs. Reads live from the DB so a resumed or
 * refreshed session always reflects what was actually recorded.
 */
export async function getStudyWithObservations(studyId: string): Promise<{
  study: StudyDetail
  steps: StepWithObservations[]
  masterRuns: number[]
} | null> {
  const detail = await getStudy(studyId)
  if (!detail) return null

  const supabase = createServiceRoleClient()

  const [{ data: obs, error: obsError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from('observations')
      .select('step_id, duration_ms')
      .eq('study_id', studyId)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('master_runs')
      .select('duration_ms')
      .eq('study_id', studyId)
      .order('recorded_at', { ascending: true }),
  ])
  if (obsError) throw obsError
  if (runsError) throw runsError

  const byStep = new Map<string, number[]>()
  for (const row of obs ?? []) {
    const list = byStep.get(row.step_id) ?? []
    list.push(row.duration_ms)
    byStep.set(row.step_id, list)
  }

  const steps: StepWithObservations[] = detail.steps.map((s) => ({
    id: s.id,
    name: s.name,
    notes: s.notes,
    timed: s.timed,
    position: s.position,
    observations: byStep.get(s.id) ?? [],
  }))

  return {
    study: detail,
    steps,
    masterRuns: (runs ?? []).map((r) => r.duration_ms),
  }
}
