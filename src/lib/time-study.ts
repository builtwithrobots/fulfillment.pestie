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

export type StepWithObservations = {
  id: string
  name: string
  notes: string | null
  timed: boolean
  position: number
  observations: number[] // duration_ms values, oldest → newest
}

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
  masterRuns: number[]
): StudyResults {
  const wagePerMs = (wageRate || 0) / 3_600_000

  const timedWithObs = steps.filter((s) => s.timed && s.observations.length > 0)
  const stepAverages = timedWithObs.map((s) => {
    const avgMs = s.observations.reduce((a, b) => a + b, 0) / s.observations.length
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
    const avgMs = obsCount > 0 ? s.observations.reduce((a, b) => a + b, 0) / obsCount : 0
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
    const avgMs = masterRuns.reduce((a, b) => a + b, 0) / masterRuns.length
    const stdDevMs = Math.sqrt(
      masterRuns.map((r) => (r - avgMs) ** 2).reduce((a, b) => a + b, 0) / masterRuns.length
    )
    master = {
      runs: masterRuns,
      avgMs,
      minMs: Math.min(...masterRuns),
      maxMs: Math.max(...masterRuns),
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

/** Tab-separated plain-text export, mirroring the prototype's copyResults(). */
export function resultsToPlainText(
  title: string,
  wageRate: number,
  steps: StepWithObservations[],
  masterRuns: number[]
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
      const avg = s.observations.reduce((a, b) => a + b, 0) / s.observations.length
      const cost = avg * wagePerMs
      text += `${s.name}\tTimed\t${fmtMs(avg)}\t${s.observations.length}\t${wageRate > 0 ? '$' + cost.toFixed(4) : '—'}\n`
    }
  }
  if (masterRuns.length > 0) {
    text += '\nMASTER TIMER RUNS\n'
    masterRuns.forEach((ms, i) => {
      text += `Run ${i + 1}\t${fmtMs(ms)}\n`
    })
  }
  return text
}
