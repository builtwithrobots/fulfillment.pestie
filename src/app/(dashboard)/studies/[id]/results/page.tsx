import { Plus, Printer, Sparkles, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { workerNameMap } from '@/lib/roster/data'
import { getStudyWithObservations } from '@/lib/studies/data'
import {
  computePerWorker,
  computeResults,
  fmtMs,
  RECOMMENDED_OBS_CAP,
  resultsToPlainText,
  SAMPLE_TARGET_LABEL,
  type StepResult,
} from '@/lib/time-study'
import { InfoModal } from '../../info-modal'
import { Card, CardTitle, Stat } from '../../ui'
import { AiAnalysis } from './ai-analysis'
import { CopyResultsButton } from './copy-button'
import { DeleteRunButton } from './delete-run-button'

export const metadata = { title: 'Results' }

// Allow headroom for the on-demand AI analysis server action (a streamed Claude
// call with thinking) invoked from this route; page render itself is fast.
export const maxDuration = 60

function money(v: number, wage: number) {
  return wage > 0 ? `$${v.toFixed(4)}` : '—'
}

function perHour(n: number) {
  return Math.round(n).toLocaleString('en-US')
}

// Full-run consistency bands, keyed on coefficient of variation (std dev ÷
// average) so they hold for any process length. Same 10% / 25% thresholds as
// the per-step Consistency column, mapped to a suggested action.
const CONSISTENCY_BANDS = [
  {
    max: 10,
    range: '≤ 10%',
    label: 'Expected',
    pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    consider: 'No action — full runs are tight and consistent.',
  },
  {
    max: 25,
    range: '10–25%',
    label: 'Watch for trends',
    pill: 'bg-amber-400/15 text-amber-700 dark:text-amber-400',
    consider: 'Some run-to-run variation — keep sampling and watch for drift or a creeping average.',
  },
  {
    max: Infinity,
    range: '> 25%',
    label: 'Action needed',
    pill: 'bg-red-500/15 text-red-700 dark:text-red-400',
    consider: 'Unstable run to run — check for method differences, interruptions, or mixed operators before trusting the average.',
  },
] as const

function bandFor(cvPct: number) {
  return CONSISTENCY_BANDS.find((b) => cvPct <= b.max) ?? CONSISTENCY_BANDS[2]
}

// Plain-language reliability badge for a step. It folds the two things that
// decide "can I trust this step's average?" — how tightly the readings cluster
// (coefficient of variation) and whether there are enough of them — into one
// word, so the table stays readable. The underlying numbers (spread, sample
// count, recommendation) live behind the badge's tap-to-open explanation.
type Reliability = {
  label: string
  dot: string // colour of the status dot
  pill: string // pill background + text colour
  plain: string // one-line meaning, jargon-free
}

function reliabilityFor(s: StepResult): Reliability {
  if (s.obsCount < 2) {
    return {
      label: 'Building',
      dot: 'bg-zinc-400',
      pill: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
      plain: 'Not enough readings yet — time this step a few more times before trusting the average.',
    }
  }
  if (s.cvPct > 25) {
    return {
      label: 'Low confidence',
      dot: 'bg-red-500',
      pill: 'bg-red-500/15 text-red-700 dark:text-red-400',
      plain: "Readings swing a lot from cycle to cycle, so the average isn't dependable yet. Look for method differences, interruptions, or mixed operators.",
    }
  }
  if (s.cvPct > 10 || !s.enoughObs) {
    return {
      label: 'Rough',
      dot: 'bg-amber-500',
      pill: 'bg-amber-400/15 text-amber-700 dark:text-amber-400',
      plain: 'Close, but with some cycle-to-cycle variation. A few more readings will tighten the average.',
    }
  }
  return {
    label: 'Solid',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    plain: "Readings are tight and there are enough of them — you can trust this step's average.",
  }
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [data, workerNames] = await Promise.all([getStudyWithObservations(id), workerNameMap()])
  if (!data) notFound()

  const { study, steps, masterRuns } = data
  const wage = study.wageRate
  const allowance = study.allowancePct
  const r = computeResults(steps, wage, masterRuns, allowance)
  const copyText = resultsToPlainText(study.title, wage, steps, masterRuns, allowance)
  const perWorker = computePerWorker(steps, masterRuns)

  const chartSteps = r.steps.filter((s) => s.timed && s.obsCount > 0)
  const maxAvg = Math.max(0, ...chartSteps.map((s) => s.avgMs))

  // Headline KPIs: prefer per-step math; fall back to master-run stats so a
  // whole-process-only study still calculates. Runs count as observations.
  const cycleMs = chartSteps.length > 0 ? r.totalMs : (r.master?.avgMs ?? 0)
  const cycleCost = chartSteps.length > 0 ? r.totalCost : (r.master?.avgCost ?? 0)
  const totalRecordings = r.totalObs + (r.master?.runs.length ?? 0)
  const hasAllowance = r.allowancePct > 0
  const stdCycleMs = chartSteps.length > 0 ? r.totalStdMs : (r.master?.stdMs ?? 0)
  // Consistency band for the full runs — only meaningful with ≥2 runs.
  const masterBand = r.master && r.master.runs.length >= 2 ? bandFor(r.master.cvPct) : null
  // KPI tiles: 3 base, +1 for allowance, +2 for piece economics.
  const kpiCount = 3 + (hasAllowance ? 1 : 0) + (r.hasPieceCounts ? 2 : 0)
  const kpiCols = kpiCount === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'

  return (
    <div className="mx-auto max-w-3xl">
      <Heading>{study.title}</Heading>
      <p className="mt-1 text-sm text-zinc-500">
        {new Date(study.createdAt).toLocaleDateString()} · {r.steps.length} step
        {r.steps.length !== 1 ? 's' : ''} · {r.timedCount} timed · {r.documentedCount} documented
        {study.isGroupCheck && <> · <span className="text-amber-600 dark:text-amber-400">Group check</span></>}
      </p>

      {/* KPI grid */}
      <div className={`mt-6 grid grid-cols-2 gap-3 ${kpiCols}`}>
        <Stat
          label={hasAllowance ? 'Observed cycle' : 'Avg cycle time'}
          value={cycleMs > 0 ? fmtMs(cycleMs) : '—'}
          tone="text-blue-600 dark:text-blue-400"
          info={
            "The time for one unit to pass through every timed step: each step's readings are averaged, then added " +
            'together. This is the observed time, before any PF&D allowance.'
          }
        />
        {hasAllowance && (
          <Stat
            label="Standard / unit"
            value={stdCycleMs > 0 ? fmtMs(stdCycleMs) : '—'}
            tone="text-violet-600 dark:text-violet-400"
            info={`Observed cycle time with your PF&D allowance applied — observed × (1 + ${r.allowancePct}%). This is the time you actually staff and cost to.`}
          />
        )}
        <Stat
          label={hasAllowance ? 'Cost / unit (std)' : 'Labor cost / unit'}
          value={wage > 0 && cycleMs > 0 ? money(cycleCost, wage) : '—'}
          tone="text-emerald-600 dark:text-emerald-400"
          info={
            "The labor cost to make one unit: the cycle's standard time × your hourly wage. It includes the PF&D " +
            'allowance if you set one, and stays blank until you enter a wage rate.'
          }
        />
        <Stat label="Total observations" value={String(totalRecordings)} />
        {r.hasPieceCounts && (
          <>
            <Stat
              label="Cost / piece"
              value={wage > 0 && r.costPerPiece > 0 ? money(r.costPerPiece, wage) : '—'}
              tone="text-emerald-600 dark:text-emerald-400"
              info={
                "Standard labor cost to produce one finished piece — each step's standard time ÷ its pieces per cycle, " +
                'summed, × wage. A true unit cost even when some steps run in batches.'
              }
            />
            <Stat
              label="Throughput"
              value={r.throughputPerHour > 0 ? `${perHour(r.throughputPerHour)}/hr` : '—'}
              tone="text-blue-600 dark:text-blue-400"
              info={
                'Estimated line output in finished pieces per hour, capped by the slowest station (the bottleneck by ' +
                'pieces/hour). Assumes one station per step.'
              }
            />
          </>
        )}
      </div>
      {hasAllowance && (
        <p className="mt-2 text-xs text-zinc-500">
          Standard time and cost add a {r.allowancePct}% PF&amp;D allowance on top of observed time.
        </p>
      )}

      {/* Master timer results */}
      {r.master && (
        <Card className="mt-4">
          <CardTitle className="text-violet-600 dark:text-violet-400">Master timer — full process runs</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Avg full run"
              value={fmtMs(r.master.avgMs)}
              tone="text-violet-600 dark:text-violet-400"
              info={
                'The average of the whole-process runs — the master timer in per-step mode, plus any completed cycles ' +
                'in cycle mode. It measures the whole job start to finish, separate from the per-step splits.'
              }
            />
            <Stat
              label="Avg labor cost"
              value={money(r.master.avgCost, wage)}
              tone="text-emerald-600 dark:text-emerald-400"
            />
            <Stat label="Full runs" value={String(r.master.runs.length)} />
            <Stat label="Fastest" value={fmtMs(r.master.minMs)} tone="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Slowest" value={fmtMs(r.master.maxMs)} tone="text-amber-600 dark:text-amber-400" />
            <Stat
              label="Std dev"
              value={fmtMs(r.master.stdDevMs)}
              badge={
                masterBand ? (
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${masterBand.pill}`}>
                    {masterBand.label}
                  </span>
                ) : (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                    ≥2 runs to assess
                  </span>
                )
              }
              info={
                <div className="space-y-3">
                  <p>
                    How much the full runs vary around their average (sample standard deviation, N-1). Judge it against
                    the average as a coefficient of variation — CV = std dev ÷ average
                    {r.master.runs.length >= 2 ? (
                      <>
                        . This set: <span className="font-medium">{r.master.cvPct.toFixed(0)}% CV</span>.
                      </>
                    ) : (
                      <> (needs at least two runs to assess).</>
                    )}
                  </p>
                  <ul className="space-y-2">
                    {CONSISTENCY_BANDS.map((b) => (
                      <li key={b.range} className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 inline-block w-14 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold ${b.pill}`}
                        >
                          {b.range}
                        </span>
                        <span>
                          <span className="font-medium text-zinc-950 dark:text-white">{b.label}</span> — {b.consider}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              }
            />
          </div>
          <ul className="mt-3 space-y-1.5">
            {masterRuns.map((run, i) => {
              const ms = run.durationMs
              const tag =
                masterRuns.length > 1 && ms === r.master!.minMs
                  ? '✓ Fastest'
                  : masterRuns.length > 1 && ms === r.master!.maxMs
                    ? '⚠ Slowest'
                    : ''
              return (
                <li
                  key={run.id ?? i}
                  className="grid grid-cols-[1fr_auto_5rem_auto] items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-white/5"
                >
                  <span className="text-zinc-500">Run {i + 1}</span>
                  <span className="text-right font-mono font-semibold tabular-nums">{fmtMs(ms)}</span>
                  <span className="text-right text-xs text-zinc-500">{tag}</span>
                  {run.id ? (
                    <DeleteRunButton studyId={study.id} runId={run.id} label={`Run ${i + 1}`} time={fmtMs(ms)} />
                  ) : (
                    <span className="w-6" />
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Chart */}
      {chartSteps.length > 0 && (
        <Card className="mt-4">
          <CardTitle>Time distribution — timed steps</CardTitle>
          <div className="mt-4 space-y-2.5">
            {chartSteps.map((s) => {
              const barPct = maxAvg > 0 ? (s.avgMs / maxAvg) * 100 : 0
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 truncate text-xs sm:w-32" title={s.name}>
                    {s.name}
                  </div>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        s.isBottleneck
                          ? 'bg-gradient-to-r from-amber-500 to-red-500'
                          : 'bg-gradient-to-r from-blue-500 to-violet-500'
                      }`}
                      style={{ width: `${barPct.toFixed(1)}%` }}
                    />
                  </div>
                  <div className="w-14 shrink-0 text-right font-mono text-xs text-zinc-500 tabular-nums">
                    {fmtMs(s.avgMs)}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Step breakdown table */}
      <Card className="mt-4 overflow-x-auto">
        <CardTitle>Step breakdown</CardTitle>
        <table className="mt-4 w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-zinc-950/10 text-left text-[11px] tracking-wide text-zinc-500 uppercase dark:border-white/10">
              <th className="py-2 pr-3 font-medium">Step</th>
              <th className="py-2 pr-3 font-medium">Avg time</th>
              <th className="py-2 pr-3 font-medium">Reliability</th>
              <th className="py-2 pr-3 font-medium">Cost/unit</th>
              <th className="py-2 font-medium">% of total</th>
            </tr>
          </thead>
          <tbody>
            {r.steps.map((s) => {
              if (!s.timed) {
                return (
                  <tr key={s.id} className="border-b border-zinc-950/5 text-zinc-500 italic dark:border-white/5">
                    <td className="py-2.5 pr-3">
                      {s.name}
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 uppercase not-italic dark:bg-white/5">
                        Documented
                      </span>
                      {s.notes && (
                        <InfoModal
                          title={`Notes — ${s.name}`}
                          triggerLabel={`View notes for ${s.name}`}
                          icon={<StickyNote className="size-3.5" />}
                          triggerClassName="ml-1.5 inline-flex align-middle text-zinc-400 not-italic hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {s.notes}
                        </InfoModal>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">—</td>
                    <td className="py-2.5 pr-3">—</td>
                    <td className="py-2.5 pr-3">—</td>
                    <td className="py-2.5">—</td>
                  </tr>
                )
              }
              if (s.obsCount === 0) {
                return (
                  <tr key={s.id} className="border-b border-zinc-950/5 dark:border-white/5">
                    <td className="py-2.5 pr-3 font-medium">
                      {s.name}
                      {s.notes && (
                        <InfoModal
                          title={`Notes — ${s.name}`}
                          triggerLabel={`View notes for ${s.name}`}
                          icon={<StickyNote className="size-3.5" />}
                          triggerClassName="ml-1.5 inline-flex align-middle text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {s.notes}
                        </InfoModal>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-400">No obs</td>
                    <td className="py-2.5 pr-3 text-zinc-400">—</td>
                    <td className="py-2.5 pr-3">—</td>
                    <td className="py-2.5">—</td>
                  </tr>
                )
              }
              return (
                <tr key={s.id} className="border-b border-zinc-950/5 dark:border-white/5">
                  <td className="py-2.5 pr-3 font-medium">
                    {s.name}
                    {s.piecesPerCycle > 1 && (
                      <span
                        className="ml-1.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-400"
                        title={`${s.piecesPerCycle} pieces per cycle`}
                      >
                        ×{s.piecesPerCycle}
                      </span>
                    )}
                    {s.isBottleneck && (
                      <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                        Bottleneck
                      </span>
                    )}
                    {s.notes && (
                      <InfoModal
                        title={`Notes — ${s.name}`}
                        triggerLabel={`View notes for ${s.name}`}
                        icon={<StickyNote className="size-3.5" />}
                        triggerClassName="ml-1.5 inline-flex align-middle text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {s.notes}
                      </InfoModal>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{fmtMs(s.avgMs)}</td>
                  <td className="py-2.5 pr-3">
                    {(() => {
                      const rel = reliabilityFor(s)
                      const moreNeeded =
                        s.recommendedObs != null && !s.enoughObs ? Math.max(1, s.recommendedObs - s.obsCount) : 0
                      return (
                        <InfoModal
                          title={`Reliability — ${s.name}`}
                          triggerLabel={`Reliability detail for ${s.name}`}
                          triggerClassName="inline-flex"
                          icon={
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${rel.pill}`}
                            >
                              <span className={`size-1.5 rounded-full ${rel.dot}`} />
                              {rel.label}
                            </span>
                          }
                        >
                          <div className="space-y-3">
                            <p>{rel.plain}</p>
                            <dl className="space-y-1.5 text-[13px]">
                              <div className="flex justify-between gap-4">
                                <dt className="text-zinc-500">Average time</dt>
                                <dd className="font-mono tabular-nums">{fmtMs(s.avgMs)}</dd>
                              </div>
                              {s.obsCount >= 2 && (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-zinc-500">Typical swing</dt>
                                  <dd className="font-mono tabular-nums">
                                    ± {fmtMs(s.stdDevMs)} ({s.cvPct.toFixed(0)}%)
                                  </dd>
                                </div>
                              )}
                              <div className="flex justify-between gap-4">
                                <dt className="text-zinc-500">Readings taken</dt>
                                <dd className="font-mono tabular-nums">{s.obsCount}</dd>
                              </div>
                            </dl>
                            <p className="text-[13px]">
                              {s.enoughObs
                                ? `Enough readings for a confident average (${SAMPLE_TARGET_LABEL}).`
                                : s.recommendedObs != null && s.recommendedObs > RECOMMENDED_OBS_CAP
                                  ? 'This step swings too much to pin down by timing alone — standardize the method (fixed station, one operator, remove interruptions), then re-time.'
                                  : moreNeeded > 0
                                    ? `About ${moreNeeded} more reading${moreNeeded === 1 ? '' : 's'} recommended to pin the average down (${SAMPLE_TARGET_LABEL}).`
                                    : 'Time this step a few more times to gauge how steady it is.'}
                            </p>
                          </div>
                        </InfoModal>
                      )
                    })()}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{money(s.costPerUnit, wage)}</td>
                  <td className="py-2.5">{s.pctOfTotal.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-zinc-500">
          <span className="font-medium">Reliability</span> blends how steady a step is with how many times it&apos;s been
          timed — <span className="text-emerald-600 dark:text-emerald-400">Solid</span>,{' '}
          <span className="text-amber-600 dark:text-amber-400">Rough</span>, or{' '}
          <span className="text-red-600 dark:text-red-400">Low confidence</span>. Tap any badge for the exact spread,
          readings, and how many more are recommended.
        </p>
      </Card>

      {/* Throughput & piece economics -- only when a step produces >1 piece/cycle */}
      {r.hasPieceCounts && chartSteps.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <CardTitle>Throughput &amp; piece economics</CardTitle>
          <table className="mt-4 w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-zinc-950/10 text-left text-[11px] tracking-wide text-zinc-500 uppercase dark:border-white/10">
                <th className="py-2 pr-3 font-medium">Step</th>
                <th className="py-2 pr-3 font-medium">Pcs/cycle</th>
                <th className="py-2 pr-3 font-medium">Per piece</th>
                <th className="py-2 pr-3 font-medium">Pieces/hr</th>
                <th className="py-2 font-medium">Cost/piece</th>
              </tr>
            </thead>
            <tbody>
              {chartSteps.map((s) => (
                <tr key={s.id} className="border-b border-zinc-950/5 dark:border-white/5">
                  <td className="py-2.5 pr-3 font-medium">
                    {s.name}
                    {r.throughputBottleneck?.id === s.id && (
                      <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                        Limits line
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{s.piecesPerCycle}</td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{fmtMs(s.perPieceMs)}</td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{perHour(s.piecesPerHour)}</td>
                  <td className="py-2.5 font-mono tabular-nums">{money(s.costPerPiece, wage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-zinc-500">
            Per-piece figures divide each step&apos;s time by its pieces/cycle.{' '}
            <span className="font-medium">Line throughput</span> is capped by the slowest station
            {r.throughputBottleneck ? (
              <>
                {' '}
                — <span className="font-medium">{r.throughputBottleneck.name}</span> at {perHour(r.throughputPerHour)}/hr
              </>
            ) : null}{' '}
            (assumes one station per step).
          </p>
        </Card>
      )}

      {/* Per-employee breakdown -- only when timings were attributed */}
      {perWorker.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <CardTitle>By employee</CardTitle>
          {study.isGroupCheck && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Group / process check — these timings are not counted toward individual roster profiles.
            </p>
          )}
          <table className="mt-4 w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-zinc-950/10 text-left text-[11px] tracking-wide text-zinc-500 uppercase dark:border-white/10">
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Obs</th>
                <th className="py-2 pr-3 font-medium">Steps covered</th>
                <th className="py-2 pr-3 font-medium">Avg cycle (their steps)</th>
                <th className="py-2 font-medium">Full runs</th>
              </tr>
            </thead>
            <tbody>
              {perWorker.map((w) => (
                <tr key={w.workerId} className="border-b border-zinc-950/5 dark:border-white/5">
                  <td className="py-2.5 pr-3 font-medium">
                    <Link href={`/roster/${w.workerId}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                      {workerNames.get(w.workerId) ?? 'Removed employee'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3">{w.obsCount}</td>
                  <td className="py-2.5 pr-3">
                    {w.stepsCovered} of {r.timedCount}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">
                    {w.stepsCovered > 0 ? fmtMs(w.avgCycleMs) : '—'}
                  </td>
                  <td className="py-2.5 font-mono tabular-nums">
                    {w.runCount > 0 ? `${w.runCount} · avg ${fmtMs(w.avgRunMs ?? 0)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Analysis & recommendations — on-demand AI read, with the deterministic
          bottleneck line as the always-on quick take / fallback. */}
      {(chartSteps.length > 0 || !!r.master) && (
        <Card className="mt-4 bg-violet-50/40 ring-violet-500/25 dark:bg-violet-500/5 dark:ring-violet-400/20">
          <CardTitle className="flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
            <Sparkles className="size-3.5" /> Analysis &amp; recommendations
          </CardTitle>
          <div className="mt-3">
            <AiAnalysis
              studyId={study.id}
              fallback={
                r.bottleneck ? (
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                    &ldquo;{r.bottleneck.name}&rdquo; is your biggest bottleneck — averaging {fmtMs(r.bottleneck.avgMs)} (
                    {r.bottleneck.pctOfTotal.toFixed(1)}% of timed cycle time
                    {wage > 0 ? `, costing ${money(r.bottleneck.costPerUnit, wage)} per unit` : ''}). Focus improvement
                    efforts here first for the highest impact on throughput.
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                    Timings are captured above. Run an AI analysis for a plain-English read of where the process stands
                    and what to tackle next.
                  </p>
                )
              }
            />
          </div>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <CopyResultsButton text={copyText} />
        <Button outline href={`/studies/${study.id}/results/print`} target="_blank">
          <Printer className="size-4" /> Export PDF
        </Button>
        <Button plain href="/studies/new">
          <Plus className="size-4" /> New study
        </Button>
      </div>
    </div>
  )
}
