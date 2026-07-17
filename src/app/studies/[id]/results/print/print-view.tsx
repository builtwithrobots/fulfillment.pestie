'use client'

import { ArrowLeft, Printer } from 'lucide-react'

import { Button } from '@/components/button'
import type { StudyDetail } from '@/lib/studies/data'
import { computePerWorker, computeResults, fmtMs, type Observation, type StepWithObservations } from '@/lib/time-study'

/**
 * Print-optimized study results for the browser's native "Save as PDF" — the
 * full report: per-step detail with notes, master runs, and the per-employee
 * breakdown. The on-screen page previews the printed sheet; the controls bar
 * disappears when printing.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function money(v: number, wage: number) {
  return wage > 0 ? `$${v.toFixed(4)}` : '—'
}

const th = 'border-b border-zinc-300 py-1.5 pr-3 text-left align-bottom font-semibold'
const td = 'border-b border-zinc-200 py-1.5 pr-3 align-top'

export function PrintView({
  study,
  steps,
  masterRuns,
  workerNames,
}: {
  study: StudyDetail
  steps: StepWithObservations[]
  masterRuns: Observation[]
  workerNames: Record<string, string>
}) {
  const wage = study.wageRate
  const r = computeResults(steps, wage, masterRuns)
  const perWorker = computePerWorker(steps, masterRuns)
  const nameOf = (id: string | null) => (id ? (workerNames[id] ?? 'Removed employee') : null)

  // Same fallback as the results screen: master-run stats carry the headline
  // KPIs when no per-step observations exist yet, and runs count as recordings.
  const cycleMs = r.totalMs > 0 ? r.totalMs : (r.master?.avgMs ?? 0)
  const cycleCost = r.totalMs > 0 ? r.totalCost : (r.master?.avgCost ?? 0)
  const totalRecordings = r.totalObs + (r.master?.runs.length ?? 0)

  // Per-step spread, straight from the raw observations.
  const spread = new Map(
    steps
      .filter((s) => s.observations.length > 0)
      .map((s) => {
        const d = s.observations.map((o) => o.durationMs)
        return [s.id, { minMs: Math.min(...d), maxMs: Math.max(...d) }] as const
      })
  )

  return (
    <div className="min-h-svh bg-zinc-200 text-zinc-900 dark:bg-zinc-800 print:bg-white">
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        @media print {
          .print-sheet { width: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Controls -- never printed */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900 print:hidden">
        <Button plain href={`/studies/${study.id}/results`} aria-label="Back to results">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <div className="text-sm font-semibold text-zinc-950 dark:text-white">{study.title}</div>
          <div className="text-xs text-zinc-500">In the print dialog, choose “Save as PDF” as the destination.</div>
        </div>
        <Button color="blue" onClick={() => window.print()} className="ml-auto">
          <Printer className="size-4" /> Print / Save PDF
        </Button>
      </div>

      {/* Sheet */}
      <div className="print-sheet mx-auto my-6 w-[8.5in] bg-white p-[0.5in] shadow-lg">
        {/* Header */}
        <h1 className="text-2xl font-semibold">Time study: {study.title}</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Created {formatDate(study.createdAt)} · Last activity {formatDate(study.updatedAt)} ·{' '}
          {wage > 0 ? `Wage rate $${wage}/hr` : 'No wage rate set'} · {r.timedCount} timed step
          {r.timedCount !== 1 ? 's' : ''}, {r.documentedCount} documented
        </p>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Avg cycle time', value: cycleMs > 0 ? fmtMs(cycleMs) : '—' },
            { label: 'Labor cost / unit', value: cycleMs > 0 ? money(cycleCost, wage) : '—' },
            { label: 'Total observations', value: String(totalRecordings) },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-zinc-300 p-3">
              <div className="font-mono text-xl font-bold tabular-nums">{kpi.value}</div>
              <div className="mt-1 text-[10px] tracking-wide text-zinc-500 uppercase">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Step detail (with notes) */}
        <h2 className="mt-6 text-sm font-semibold tracking-wider text-zinc-500 uppercase">Step detail</h2>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>Step</th>
              <th className={th}>Avg</th>
              <th className={th}>Fastest</th>
              <th className={th}>Slowest</th>
              <th className={th}>Obs</th>
              <th className={th}>Cost/unit</th>
              <th className={`${th} pr-0`}>% of total</th>
            </tr>
          </thead>
          <tbody>
            {r.steps.map((s, i) => {
              const sp = spread.get(s.id)
              return (
                <tr key={s.id}>
                  <td className={`${td} font-mono tabular-nums`}>{String(i + 1).padStart(2, '0')}</td>
                  <td className={td}>
                    <span className="font-medium">{s.name}</span>
                    {!s.timed && (
                      <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-semibold text-zinc-500 uppercase">
                        Documented
                      </span>
                    )}
                    {s.isBottleneck && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700 uppercase">
                        Bottleneck
                      </span>
                    )}
                    {s.notes && <div className="mt-0.5 text-[11px] text-zinc-500 italic">{s.notes}</div>}
                  </td>
                  {!s.timed ? (
                    <td className={td} colSpan={6}>
                      —
                    </td>
                  ) : s.obsCount === 0 ? (
                    <td className={`${td} text-zinc-400`} colSpan={6}>
                      No observations
                    </td>
                  ) : (
                    <>
                      <td className={`${td} font-mono tabular-nums`}>{fmtMs(s.avgMs)}</td>
                      <td className={`${td} font-mono tabular-nums`}>{sp ? fmtMs(sp.minMs) : '—'}</td>
                      <td className={`${td} font-mono tabular-nums`}>{sp ? fmtMs(sp.maxMs) : '—'}</td>
                      <td className={td}>{s.obsCount}</td>
                      <td className={`${td} font-mono tabular-nums`}>{money(s.costPerUnit, wage)}</td>
                      <td className={`${td} pr-0`}>{s.pctOfTotal.toFixed(1)}%</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Bottleneck note */}
        {r.bottleneck && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed">
            <span className="font-semibold">Bottleneck:</span> “{r.bottleneck.name}” averages{' '}
            {fmtMs(r.bottleneck.avgMs)} ({r.bottleneck.pctOfTotal.toFixed(1)}% of the cycle
            {wage > 0 ? `, ${money(r.bottleneck.costPerUnit, wage)} per unit` : ''}). Improving this step has the
            biggest impact on throughput.
          </p>
        )}

        {/* Master runs */}
        {r.master && (
          <>
            <h2 className="mt-6 text-sm font-semibold tracking-wider text-zinc-500 uppercase">
              Master timer — full process runs
            </h2>
            <p className="mt-2 text-xs">
              {r.master.runs.length} run{r.master.runs.length !== 1 ? 's' : ''} · Avg{' '}
              <span className="font-mono tabular-nums">{fmtMs(r.master.avgMs)}</span> · Fastest{' '}
              <span className="font-mono tabular-nums">{fmtMs(r.master.minMs)}</span> · Slowest{' '}
              <span className="font-mono tabular-nums">{fmtMs(r.master.maxMs)}</span> · Std dev{' '}
              <span className="font-mono tabular-nums">{fmtMs(r.master.stdDevMs)}</span>
              {wage > 0 && (
                <>
                  {' '}
                  · Avg cost <span className="font-mono tabular-nums">{money(r.master.avgCost, wage)}</span>
                </>
              )}
            </p>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>Run</th>
                  <th className={th}>Time</th>
                  <th className={`${th} pr-0`}>Employee</th>
                </tr>
              </thead>
              <tbody>
                {masterRuns.map((run, i) => (
                  <tr key={i}>
                    <td className={td}>Run {i + 1}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtMs(run.durationMs)}</td>
                    <td className={`${td} pr-0`}>{nameOf(run.workerId) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* By employee */}
        {perWorker.length > 0 && (
          <>
            <h2 className="mt-6 text-sm font-semibold tracking-wider text-zinc-500 uppercase">By employee</h2>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>Employee</th>
                  <th className={th}>Obs</th>
                  <th className={th}>Steps covered</th>
                  <th className={th}>Avg cycle (their steps)</th>
                  <th className={`${th} pr-0`}>Full runs</th>
                </tr>
              </thead>
              <tbody>
                {perWorker.map((w) => (
                  <tr key={w.workerId}>
                    <td className={`${td} font-medium`}>{nameOf(w.workerId)}</td>
                    <td className={td}>{w.obsCount}</td>
                    <td className={td}>
                      {w.stepsCovered} of {r.timedCount}
                    </td>
                    <td className={`${td} font-mono tabular-nums`}>{w.stepsCovered > 0 ? fmtMs(w.avgCycleMs) : '—'}</td>
                    <td className={`${td} pr-0 font-mono tabular-nums`}>
                      {w.runCount > 0 ? `${w.runCount} · avg ${fmtMs(w.avgRunMs ?? 0)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className="mt-6 text-[10px] text-zinc-400">
          Pestie Fulfillment · Time Study Tool · Averages are per-step observation means; cycle time is the sum of step
          averages; cost = time × ${wage}/hr.
        </p>
      </div>
    </div>
  )
}
