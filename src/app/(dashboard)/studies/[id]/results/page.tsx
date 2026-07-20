import { Plus, Printer, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { workerNameMap } from '@/lib/roster/data'
import { getStudyWithObservations } from '@/lib/studies/data'
import { computePerWorker, computeResults, fmtMs, resultsToPlainText } from '@/lib/time-study'
import { InfoModal } from '../../info-modal'
import { Card, CardTitle, Stat } from '../../ui'
import { CopyResultsButton } from './copy-button'

export const metadata = { title: 'Results' }

function money(v: number, wage: number) {
  return wage > 0 ? `$${v.toFixed(4)}` : '—'
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

  return (
    <div className="mx-auto max-w-3xl">
      <Heading>{study.title}</Heading>
      <p className="mt-1 text-sm text-zinc-500">
        {new Date(study.createdAt).toLocaleDateString()} · {r.steps.length} step
        {r.steps.length !== 1 ? 's' : ''} · {r.timedCount} timed · {r.documentedCount} documented
      </p>

      {/* KPI grid */}
      <div className={`mt-6 grid grid-cols-2 gap-3 ${hasAllowance ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
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
            {r.master.runs.map((ms, i) => {
              const tag =
                r.master!.runs.length > 1 && ms === r.master!.minMs
                  ? '✓ Fastest'
                  : r.master!.runs.length > 1 && ms === r.master!.maxMs
                    ? '⚠ Slowest'
                    : ''
              return (
                <li
                  key={i}
                  className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-white/5"
                >
                  <span className="text-zinc-500">Run {i + 1}</span>
                  <span className="text-right font-mono font-semibold tabular-nums">{fmtMs(ms)}</span>
                  <span className="text-right text-xs text-zinc-500">{tag}</span>
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
              <th className="py-2 pr-3 font-medium">Consistency</th>
              <th className="py-2 pr-3 font-medium">Obs</th>
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
                    <td className="py-2.5 pr-3">0</td>
                    <td className="py-2.5 pr-3">—</td>
                    <td className="py-2.5">—</td>
                  </tr>
                )
              }
              return (
                <tr key={s.id} className="border-b border-zinc-950/5 dark:border-white/5">
                  <td className="py-2.5 pr-3 font-medium">
                    {s.name}
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
                    {s.obsCount < 2 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <span
                        className={
                          s.cvPct <= 10
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : s.cvPct <= 25
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        }
                        title={`Std dev ${fmtMs(s.stdDevMs)} across ${s.obsCount} readings`}
                      >
                        {s.cvPct.toFixed(0)}% CV
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {s.obsCount}
                    {s.recommendedObs != null && !s.enoughObs && (
                      <span
                        className="ml-1 text-xs text-amber-600 dark:text-amber-400"
                        title={`About ${s.recommendedObs} cycles recommended for ±10% at 95% confidence`}
                      >
                        (+{Math.max(1, s.recommendedObs - s.obsCount)})
                      </span>
                    )}
                    {s.enoughObs && <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">✓</span>}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{money(s.costPerUnit, wage)}</td>
                  <td className="py-2.5">{s.pctOfTotal.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-zinc-500">
          <span className="font-medium">Consistency</span> is each step&apos;s coefficient of variation (spread ÷
          average) across its readings — under 10% is steady, over 25% is erratic.{' '}
          <span className="font-medium">(+N)</span> flags about how many more cycles are recommended to pin the average
          down (±10% at 95% confidence); <span className="text-emerald-600 dark:text-emerald-400">✓</span> means enough.
        </p>
      </Card>

      {/* Per-employee breakdown -- only when timings were attributed */}
      {perWorker.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <CardTitle>By employee</CardTitle>
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

      {/* Bottleneck insight */}
      {r.bottleneck && (
        <Card className="mt-4 bg-amber-50/50 ring-amber-500/30 dark:bg-amber-500/5 dark:ring-amber-400/20">
          <CardTitle className="text-amber-700 dark:text-amber-400">Bottleneck identified</CardTitle>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
            &ldquo;{r.bottleneck.name}&rdquo; is your biggest bottleneck — averaging {fmtMs(r.bottleneck.avgMs)} (
            {r.bottleneck.pctOfTotal.toFixed(1)}% of timed cycle time
            {wage > 0 ? `, costing ${money(r.bottleneck.costPerUnit, wage)} per unit` : ''}). Focus improvement efforts
            here first for the highest impact on throughput.
          </p>
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
