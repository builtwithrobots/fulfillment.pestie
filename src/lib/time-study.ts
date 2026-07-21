/**
 * Pure, isomorphic helpers for the Time Study Tool.
 *
 * No React, no DB, no `server-only` — safe to import from Server Components,
 * Client Components, and server actions alike.
 *
 * Methodology: readings are averaged per element (OBSERVED time). A study-level
 * PF&D allowance converts observed time into STANDARD time
 * (standard = observed × (1 + allowance)), which is the correct basis for labor
 * cost. Per-element spread (sample std dev, N-1) and its coefficient of
 * variation gauge consistency and drive a recommended-cycles target, so you can
 * tell when an element has been timed enough. Subjective performance rating is
 * intentionally omitted — pace bias is controlled structurally (many operators,
 * many cycles) rather than by analyst judgement.
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
  id?: string // DB id when persisted; absent for a just-recorded optimistic row
  durationMs: number
  workerId: string | null
}

export type StepWithObservations = {
  id: string
  name: string
  notes: string | null
  timed: boolean
  position: number
  piecesPerCycle: number // finished pieces produced in one timed cycle (≥1)
  observations: Observation[] // oldest → newest
}

/**
 * AI-generated read of a study — a plain-language summary plus concrete
 * recommendations. Persisted on the study (studies.ai_analysis) once run, shown
 * on the results screen, and included in the PDF export. Lives here (pure,
 * isomorphic) so the client component, the server action, and the server-only
 * data layer can all share the type without a circular import.
 */
export type StudyAnalysis = {
  summary: string
  recommendations: { title: string; detail: string }[]
  generatedAt?: string // ISO timestamp set when the analysis was generated
}

// Sample-size guidance. Cycles needed to estimate the mean within ±PRECISION at
// CONFIDENCE, from the observed spread: n = (z·s / (k·x̄))² = (z/k)²·CV². Because
// required readings grow with the SQUARE of a step's spread, the target is set to
// a floor-realistic ±15% precision at 90% confidence — tight enough to trust an
// average, loose enough that a normal step needs only a handful of readings. A
// stricter target (e.g. ±10% / 95%) would demand dozens of clicks on variable steps.
// Keep SAMPLE_TARGET_LABEL below in sync with these two values.
export const SAMPLE_CONFIDENCE_Z = 1.645 // z for 90% two-sided confidence
export const SAMPLE_PRECISION_K = 0.15 // ±15% of the mean

/** Human-readable form of the target above, so UI copy has one source of truth. */
export const SAMPLE_TARGET_LABEL = '±15% at 90% confidence'

// Past this many recommended readings, timing more stops being practical — the
// real fix is standardizing the method, not more stopwatch clicks. The UI reframes
// its guidance beyond this cap instead of showing a large "+N". At the target
// above this is roughly a step that swings more than ~40%.
export const RECOMMENDED_OBS_CAP = 20

const avgOf = (nums: number[]) => (nums.length ? nums.reduce((a, v) => a + v, 0) / nums.length : 0)

/** Sample standard deviation (N-1, Bessel's correction). 0 for fewer than two values. */
function sampleStdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  return Math.sqrt(values.reduce((a, v) => a + (v - avg) ** 2, 0) / (values.length - 1))
}

/**
 * Cycles recommended to reach ±k of the mean at the set confidence, from the
 * observed spread. Null when it can't be estimated yet (needs ≥2 readings and a
 * positive mean).
 */
function recommendedCycles(count: number, avg: number, stdDev: number): number | null {
  if (count < 2 || avg <= 0) return null
  const cv = stdDev / avg
  return Math.ceil((SAMPLE_CONFIDENCE_Z / SAMPLE_PRECISION_K) ** 2 * cv ** 2)
}

export type StepResult = {
  id: string
  name: string
  notes: string | null
  timed: boolean
  avgMs: number // observed average (mean of readings)
  stdMs: number // standard time = observed × (1 + allowance)
  stdDevMs: number // sample std dev of readings (N-1)
  cvPct: number // coefficient of variation = stdDev / avg × 100
  obsCount: number
  recommendedObs: number | null // cycles to trust the average (see SAMPLE_TARGET_LABEL); null when not estimable
  enoughObs: boolean
  costPerUnit: number // standard time × wage (per cycle)
  pctOfTotal: number
  isBottleneck: boolean
  piecesPerCycle: number // finished pieces per timed cycle (≥1)
  perPieceMs: number // observed time per piece = avgMs / piecesPerCycle
  piecesPerHour: number // throughput at this step (one station assumed)
  costPerPiece: number // standard cost per piece = costPerUnit / piecesPerCycle
}

export type MasterStats = {
  runs: number[]
  avgMs: number // observed
  stdMs: number // standard = observed × (1 + allowance)
  minMs: number
  maxMs: number
  stdDevMs: number // sample std dev (N-1)
  cvPct: number
  avgCost: number // standard × wage
}

export type StudyResults = {
  steps: StepResult[]
  timedCount: number
  documentedCount: number
  totalMs: number // observed cycle time (sum of observed step averages)
  totalStdMs: number // standard cycle time = totalMs × (1 + allowance)
  totalCost: number // standard labor cost / unit (per cycle)
  totalObs: number
  allowancePct: number
  bottleneck: StepResult | null
  master: MasterStats | null
  totalPerPieceMs: number // observed labor time per finished piece
  totalPerPieceStdMs: number // standard labor time per finished piece
  costPerPiece: number // standard labor cost per finished piece
  throughputPerHour: number // line output cap = slowest station's pieces/hour
  throughputBottleneck: StepResult | null // the station that caps throughput
  hasPieceCounts: boolean // any timed step produces >1 piece per cycle
}

/**
 * Compute everything the results screen needs from the raw steps + master runs.
 * `allowancePct` (PF&D) converts observed time into standard time and cost.
 * Bottleneck set = top 20% of timed-with-observations steps by average time
 * (at least one).
 */
export function computeResults(
  steps: StepWithObservations[],
  wageRate: number,
  masterRuns: Observation[],
  allowancePct = 0
): StudyResults {
  const wagePerMs = (wageRate || 0) / 3_600_000
  const allowMult = 1 + (allowancePct || 0) / 100

  const timedWithObs = steps.filter((s) => s.timed && s.observations.length > 0)
  const stepAverages = timedWithObs.map((s) => ({
    id: s.id,
    avgMs: avgOf(s.observations.map((o) => o.durationMs)),
    pieces: Math.max(1, s.piecesPerCycle || 1),
  }))

  const totalMs = stepAverages.reduce((a, b) => a + b.avgMs, 0)
  const totalStdMs = totalMs * allowMult
  const totalCost = totalStdMs * wagePerMs
  const totalObs = timedWithObs.reduce((a, s) => a + s.observations.length, 0)

  // Per-piece: normalize each step's time by its pieces/cycle so batch steps
  // compare fairly and roll up to a true per-finished-piece labor cost.
  const totalPerPieceMs = stepAverages.reduce((a, b) => a + b.avgMs / b.pieces, 0)
  const totalPerPieceStdMs = totalPerPieceMs * allowMult
  const costPerPiece = totalPerPieceStdMs * wagePerMs
  const hasPieceCounts = steps.some((s) => s.timed && Math.max(1, s.piecesPerCycle || 1) > 1)

  // Line throughput is capped by the slowest station in pieces/hour (one
  // station per step assumed until operator counts land).
  let throughputPerHour = 0
  let throughputBottleneckId: string | null = null
  for (const b of stepAverages) {
    if (b.avgMs <= 0) continue
    const pph = (b.pieces * 3_600_000) / b.avgMs
    if (throughputBottleneckId === null || pph < throughputPerHour) {
      throughputPerHour = pph
      throughputBottleneckId = b.id
    }
  }

  const sorted = [...stepAverages].sort((a, b) => b.avgMs - a.avgMs)
  const bnCount = Math.max(1, Math.ceil(stepAverages.length * 0.2))
  const bottleneckIds = new Set(sorted.slice(0, bnCount).map((s) => s.id))

  const results: StepResult[] = steps.map((s) => {
    const durations = s.observations.map((o) => o.durationMs)
    const obsCount = durations.length
    const avgMs = avgOf(durations)
    const stdDevMs = sampleStdDev(durations, avgMs)
    const recommendedObs = recommendedCycles(obsCount, avgMs, stdDevMs)
    const piecesPerCycle = Math.max(1, s.piecesPerCycle || 1)
    return {
      id: s.id,
      name: s.name,
      notes: s.notes,
      timed: s.timed,
      avgMs,
      stdMs: avgMs * allowMult,
      stdDevMs,
      cvPct: avgMs > 0 ? (stdDevMs / avgMs) * 100 : 0,
      obsCount,
      recommendedObs,
      enoughObs: recommendedObs != null && obsCount >= recommendedObs,
      costPerUnit: avgMs * allowMult * wagePerMs,
      pctOfTotal: totalMs > 0 && s.timed && obsCount > 0 ? (avgMs / totalMs) * 100 : 0,
      isBottleneck: bottleneckIds.has(s.id),
      piecesPerCycle,
      perPieceMs: avgMs / piecesPerCycle,
      piecesPerHour: avgMs > 0 ? (piecesPerCycle * 3_600_000) / avgMs : 0,
      costPerPiece: (avgMs * allowMult * wagePerMs) / piecesPerCycle,
    }
  })

  const topId = sorted[0]?.id
  const bottleneck = stepAverages.length > 1 ? (results.find((r) => r.id === topId) ?? null) : null
  const throughputBottleneck = throughputBottleneckId
    ? (results.find((r) => r.id === throughputBottleneckId) ?? null)
    : null

  let master: MasterStats | null = null
  if (masterRuns.length > 0) {
    const durations = masterRuns.map((r) => r.durationMs)
    const avgMs = avgOf(durations)
    const stdDevMs = sampleStdDev(durations, avgMs)
    master = {
      runs: durations,
      avgMs,
      stdMs: avgMs * allowMult,
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      stdDevMs,
      cvPct: avgMs > 0 ? (stdDevMs / avgMs) * 100 : 0,
      avgCost: avgMs * allowMult * wagePerMs,
    }
  }

  return {
    steps: results,
    timedCount: steps.filter((s) => s.timed).length,
    documentedCount: steps.filter((s) => !s.timed).length,
    totalMs,
    totalStdMs,
    totalCost,
    totalObs,
    allowancePct: allowancePct || 0,
    bottleneck,
    master,
    totalPerPieceMs,
    totalPerPieceStdMs,
    costPerPiece,
    throughputPerHour,
    throughputBottleneck,
    hasPieceCounts,
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
  masterRuns: Observation[],
  allowancePct = 0
): string {
  const wagePerMs = (wageRate || 0) / 3_600_000
  const allowMult = 1 + (allowancePct || 0) / 100
  let text = `TIME STUDY: ${title}\n`
  text += `Date: ${new Date().toLocaleDateString()}\n`
  text += `Wage rate: $${wageRate}/hr\n`
  text += `PF&D allowance: ${allowancePct || 0}%\n\n`
  text += 'Step\tType\tObs avg\tStd time\tStd dev\tCV%\tObs\tPcs/cyc\tPcs/hr\tCost/piece\n'
  for (const s of steps) {
    const pieces = Math.max(1, s.piecesPerCycle || 1)
    if (!s.timed) {
      text += `${s.name}\tDocumented\t—\t—\t—\t—\t—\t—\t—\t—\n`
    } else if (s.observations.length === 0) {
      text += `${s.name}\tTimed\tNo obs\t—\t—\t—\t0\t${pieces}\t—\t—\n`
    } else {
      const durations = s.observations.map((o) => o.durationMs)
      const avg = avgOf(durations)
      const sd = sampleStdDev(durations, avg)
      const std = avg * allowMult
      const costPiece = (std * wagePerMs) / pieces
      const cv = avg > 0 ? (sd / avg) * 100 : 0
      const pph = avg > 0 ? Math.round((pieces * 3_600_000) / avg) : 0
      text += `${s.name}\tTimed\t${fmtMs(avg)}\t${fmtMs(std)}\t${fmtMs(sd)}\t${cv.toFixed(1)}%\t${s.observations.length}\t${pieces}\t${pph}\t${wageRate > 0 ? '$' + costPiece.toFixed(4) : '—'}\n`
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
