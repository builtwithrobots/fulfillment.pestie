/**
 * Pure, isomorphic helpers for the Time Study Tool.
 *
 * No React, no DB, no `server-only` — safe to import from Server Components,
 * Client Components, and server actions alike. The results math mirrors the
 * original prototype's buildResults()/copyResults() logic exactly.
 */

/** mm:ss.d — matches the prototype's fmtMs(). */
export function fmtMs(ms: number): string {
  if (!ms || ms < 0) return '00:00.0'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const d = Math.floor((ms % 1000) / 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`
}

/** One timing event (a step observation or a full-process run) and who did it. */
export type Observation = {
  durationMs: number
  workerId: string | null
}

export type StepWithObservations = {
  id: string
  name: string
  notes: string | null
  timed: boolean
  position: number
  observations: Observation[] // oldest → newest
}

const sumMs = (list: Observation[]) => list.reduce((a, o) => a + o.durationMs, 0)

export type StepResult = {
  id: string
  name: string
  notes: string | null
  timed: boolean
  avgMs: number
  obsCount: number
  costPerUnit: number
  pctOfTotal: number
  isBottleneck: boolean
}

export type MasterStats = {
  runs: number[]
  avgMs: number
  minMs: number
  maxMs: number
  stdDevMs: number
  avgCost: number
}

export type StudyResults = {
  steps: StepResult[]
  timedCount: number
  documentedCount: number
  totalMs: number
  totalCost: number
  totalObs: number
  bottleneck: StepResult | null
  master: MasterStats | null
}

/**
 * Compute everything the results screen needs from the raw steps + master runs.
 * Bottleneck set = top 20% of timed-with-observations steps by average time
 * (at least one), matching the prototype.
 */
export function computeResults(
  steps: StepWithObservations[],
  wageRate: number,
  masterRuns: Observation[]
): StudyResults {
  const wagePerMs = (wageRate || 0) / 3_600_000

  const timedWithObs = steps.filter((s) => s.timed && s.observations.length > 0)
  const stepAverages = timedWithObs.map((s) => {
    const avgMs = sumMs(s.observations) / s.observations.length
    return { id: s.id, avgMs }
  })

  const totalMs = stepAverages.reduce((a, b) => a + b.avgMs, 0)
  const totalCost = totalMs * wagePerMs
  const totalObs = timedWithObs.reduce((a, s) => a + s.observations.length, 0)

  const sorted = [...stepAverages].sort((a, b) => b.avgMs - a.avgMs)
  const bnCount = Math.max(1, Math.ceil(stepAverages.length * 0.2))
  const bottleneckIds = new Set(sorted.slice(0, bnCount).map((s) => s.id))

  const results: StepResult[] = steps.map((s) => {
    const obsCount = s.observations.length
    const avgMs = obsCount > 0 ? sumMs(s.observations) / obsCount : 0
    return {
      id: s.id,
      name: s.name,
      notes: s.notes,
      timed: s.timed,
      avgMs,
      obsCount,
      costPerUnit: avgMs * wagePerMs,
      pctOfTotal: totalMs > 0 && s.timed && obsCount > 0 ? (avgMs / totalMs) * 100 : 0,
      isBottleneck: bottleneckIds.has(s.id),
    }
  })

  const topId = sorted[0]?.id
  const bottleneck = stepAverages.length > 1 ? (results.find((r) => r.id === topId) ?? null) : null

  let master: MasterStats | null = null
  if (masterRuns.length > 0) {
    const durations = masterRuns.map((r) => r.durationMs)
    const avgMs = sumMs(masterRuns) / masterRuns.length
    const stdDevMs = Math.sqrt(durations.map((r) => (r - avgMs) ** 2).reduce((a, b) => a + b, 0) / masterRuns.length)
    master = {
      runs: durations,
      avgMs,
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      stdDevMs,
      avgCost: avgMs * wagePerMs,
    }
  }

  return {
    steps: results,
    timedCount: steps.filter((s) => s.timed).length,
    documentedCount: steps.filter((s) => !s.timed).length,
    totalMs,
    totalCost,
    totalObs,
    bottleneck,
    master,
  }
}

/**
 * Per-employee breakdown across a study's timings. Only workers with at least
 * one attributed observation or run appear; avgCycleMs sums that worker's
 * per-step averages across the steps they were observed on.
 */
export type WorkerBreakdown = {
  workerId: string
  obsCount: number
  stepsCovered: number
  avgCycleMs: number
  runCount: number
  avgRunMs: number | null
}

export function computePerWorker(steps: StepWithObservations[], masterRuns: Observation[]): WorkerBreakdown[] {
  const byWorker = new Map<string, WorkerBreakdown>()
  const get = (workerId: string) => {
    const existing = byWorker.get(workerId)
    if (existing) return existing
    const fresh: WorkerBreakdown = {
      workerId,
      obsCount: 0,
      stepsCovered: 0,
      avgCycleMs: 0,
      runCount: 0,
      avgRunMs: null,
    }
    byWorker.set(workerId, fresh)
    return fresh
  }

  for (const step of steps) {
    if (!step.timed) continue
    const perWorker = new Map<string, number[]>()
    for (const o of step.observations) {
      if (!o.workerId) continue
      const list = perWorker.get(o.workerId) ?? []
      list.push(o.durationMs)
      perWorker.set(o.workerId, list)
    }
    for (const [workerId, durations] of perWorker) {
      const b = get(workerId)
      b.obsCount += durations.length
      b.stepsCovered += 1
      b.avgCycleMs += durations.reduce((a, v) => a + v, 0) / durations.length
    }
  }

  const runsByWorker = new Map<string, number[]>()
  for (const r of masterRuns) {
    if (!r.workerId) continue
    const list = runsByWorker.get(r.workerId) ?? []
    list.push(r.durationMs)
    runsByWorker.set(r.workerId, list)
  }
  for (const [workerId, durations] of runsByWorker) {
    const b = get(workerId)
    b.runCount = durations.length
    b.avgRunMs = durations.reduce((a, v) => a + v, 0) / durations.length
  }

  return [...byWorker.values()].sort((a, b) => b.obsCount - a.obsCount || b.runCount - a.runCount)
}

/** Tab-separated plain-text export, mirroring the prototype's copyResults(). */
export function resultsToPlainText(
  title: string,
  wageRate: number,
  steps: StepWithObservations[],
  masterRuns: Observation[]
): string {
  const wagePerMs = (wageRate || 0) / 3_600_000
  let text = `TIME STUDY: ${title}\n`
  text += `Date: ${new Date().toLocaleDateString()}\n`
  text += `Wage rate: $${wageRate}/hr\n\n`
  text += 'Step\tType\tAvg Time\tObs\tCost/Unit\n'
  for (const s of steps) {
    if (!s.timed) {
      text += `${s.name}\tDocumented\t—\t—\t—\n`
    } else if (s.observations.length === 0) {
      text += `${s.name}\tTimed\tNo obs\t0\t—\n`
    } else {
      const avg = sumMs(s.observations) / s.observations.length
      const cost = avg * wagePerMs
      text += `${s.name}\tTimed\t${fmtMs(avg)}\t${s.observations.length}\t${wageRate > 0 ? '$' + cost.toFixed(4) : '—'}\n`
    }
  }
  if (masterRuns.length > 0) {
    text += '\nMASTER TIMER RUNS\n'
    masterRuns.forEach((r, i) => {
      text += `Run ${i + 1}\t${fmtMs(r.durationMs)}\n`
    })
  }
  return text
}
