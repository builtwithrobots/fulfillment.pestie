'use client'

import { useState } from 'react'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import type { ShiftPlanRecord } from '@/lib/shifts/data'
import { formatClock12, parseClockToMinutes } from '@/lib/staffing-model'
import type { ShiftKitStatus } from '@/lib/supabase/types'
import { Card } from '../studies/ui'

const PAGE_SIZE = 10

const STATUS_META: Record<ShiftKitStatus, { color: 'green' | 'amber' | 'red'; label: string; rank: number }> = {
  on_track: { color: 'green', label: 'On Track', rank: 0 },
  at_risk: { color: 'amber', label: 'At Risk', rank: 1 },
  will_not_complete: { color: 'red', label: 'Will Not Complete', rank: 2 },
}

/** The most severe of the plan's per-kit statuses — the row-level summary. */
function worstStatus(row: ShiftPlanRecord): ShiftKitStatus | null {
  const all = [row.fakStatus, row.rakStatus, row.uyakStatus].filter((s): s is ShiftKitStatus => s !== null)
  if (all.length === 0) return null
  return all.reduce((worst, s) => (STATUS_META[s].rank > STATUS_META[worst].rank ? s : worst))
}

/** 'YYYY-MM-DD' → 'Jul 23, 2026' without UTC-parsing date drift. */
function formatShiftDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusCell({ status }: { status: ShiftKitStatus | null }) {
  if (!status) return <span className="text-zinc-400">—</span>
  const meta = STATUS_META[status]
  return <Badge color={meta.color}>{meta.label}</Badge>
}

export function PlanHistory({ rows }: { rows: ShiftPlanRecord[] }) {
  const [page, setPage] = useState(0)
  const [viewing, setViewing] = useState<ShiftPlanRecord | null>(null)

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  return (
    <div className="mt-10">
      <Subheading>Plan History</Subheading>
      <p className="mt-1 text-sm text-zinc-500">Saved plans from the last 30 days.</p>

      {rows.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="text-sm text-zinc-500">No saved plans yet. Generate a plan and save it to start a history.</p>
        </Card>
      ) : (
        <Card className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Date</TableHeader>
                <TableHeader>Shift Start</TableHeader>
                <TableHeader>FAK</TableHeader>
                <TableHeader>RAK</TableHeader>
                <TableHeader>UYAK</TableHeader>
                <TableHeader>Headcount</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>
                  <span className="sr-only">Actions</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{formatShiftDate(row.shiftDate)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatClock12(parseClockToMinutes(row.shiftStartTime))}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.fakQty.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{row.rakQty.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{row.uyakQty.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{row.availableHeadcount}</TableCell>
                  <TableCell>
                    <StatusCell status={worstStatus(row)} />
                  </TableCell>
                  <TableCell>
                    <Button plain onClick={() => setViewing(row)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-500">
                Page {currentPage + 1} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button plain disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </Button>
                <Button plain disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} size="2xl">
        {viewing && <PlanDetail plan={viewing} onClose={() => setViewing(null)} />}
      </Dialog>
    </div>
  )
}

function PlanDetail({ plan, onClose }: { plan: ShiftPlanRecord; onClose: () => void }) {
  const startMin = parseClockToMinutes(plan.shiftStartTime)
  const clock = (min: number | null) => (min === null ? '—' : formatClock12(startMin + min))

  const staffing: [string, string][] = [
    ['FAK/RAK workers', plan.recFakRakWorkers?.toString() ?? '—'],
    ['UYAK stations', plan.recUyakStations?.toString() ?? '—'],
    ['Tape/scan workers', plan.recTapeScanWorkers?.toString() ?? '—'],
    [
      'Assembly',
      plan.recAssemblyWorkers
        ? `${plan.recAssemblyWorkers} workers (${plan.recAssemblyLines ?? 0} line${plan.recAssemblyLines === 1 ? '' : 's'})`
        : '—',
    ],
    ['Material Handling', plan.recMaterialHandling?.toString() ?? '2'],
    ['Replenishment', plan.recReplenishment?.toString() ?? '2'],
  ]

  const kits: { label: string; qty: number; est: number | null; status: ShiftKitStatus | null }[] = [
    { label: 'FAK', qty: plan.fakQty, est: plan.estFakCompletionMin, status: plan.fakStatus },
    { label: 'RAK', qty: plan.rakQty, est: plan.estRakCompletionMin, status: plan.rakStatus },
    { label: 'UYAK', qty: plan.uyakQty, est: plan.estUyakCompletionMin, status: plan.uyakStatus },
  ].filter((k) => k.qty > 0)

  return (
    <>
      <DialogTitle>
        Shift plan — {formatShiftDate(plan.shiftDate)}, {formatClock12(startMin)} start
      </DialogTitle>
      <DialogBody>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <p className="text-zinc-500">
            Headcount <span className="font-medium text-zinc-950 dark:text-white">{plan.availableHeadcount}</span>
          </p>
          <p className="text-zinc-500">
            FAK <span className="font-medium text-zinc-950 tabular-nums dark:text-white">{plan.fakQty}</span>
          </p>
          <p className="text-zinc-500">
            RAK <span className="font-medium text-zinc-950 tabular-nums dark:text-white">{plan.rakQty}</span>
          </p>
          <p className="text-zinc-500">
            UYAK <span className="font-medium text-zinc-950 tabular-nums dark:text-white">{plan.uyakQty}</span>
          </p>
        </div>

        <h3 className="mt-5 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
          Staffing
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {staffing.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
              <span className="font-medium text-zinc-950 tabular-nums dark:text-white">{value}</span>
            </div>
          ))}
        </div>

        <h3 className="mt-5 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
          Completion
        </h3>
        <div className="mt-2 space-y-1.5">
          {kits.map((k) => (
            <div key={k.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">
                {k.label} ({k.qty.toLocaleString()})
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-zinc-950 tabular-nums dark:text-white">{clock(k.est)}</span>
                <StatusCell status={k.status} />
              </span>
            </div>
          ))}
          {plan.estAssemblyCompletionMin !== null && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Assembly</span>
              <span className="font-medium text-zinc-950 tabular-nums dark:text-white">
                {clock(plan.estAssemblyCompletionMin)}
              </span>
            </div>
          )}
        </div>

        {plan.flex.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
              Flex plan
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
              {plan.flex.map((f, i) => (
                <li key={i}>
                  <span className="font-medium text-zinc-950 tabular-nums dark:text-white">
                    {formatClock12(parseClockToMinutes(f.trigger_time))}
                  </span>{' '}
                  — {f.from_area}
                  {f.kind === 'pivot' ? ' pivots to ' : ` sends ${f.workers} to `}
                  {f.to_area}
                  {f.new_completion_min !== null && <> · new completion {clock(f.new_completion_min)}</>}
                </li>
              ))}
            </ul>
          </>
        )}

        {plan.notes && <p className="mt-5 text-sm text-zinc-500">Notes: {plan.notes}</p>}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </>
  )
}
