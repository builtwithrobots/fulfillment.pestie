'use client'

import { Calculator, Clock, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { ErrorMessage, Field, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { saveShiftPlan, type SaveShiftPlanInput } from '@/lib/shifts/actions'
import type { ShiftPlanRecord } from '@/lib/shifts/data'
import {
  calculateStaffingPlan,
  describeFlexTarget,
  formatClock12,
  formatDuration,
  MAX_HEADCOUNT,
  OVERHEAD_WORKERS,
  parseClockToMinutes,
  UYAK_MAX_STATIONS,
  type KitOutcome,
  type KitStatus,
  type StaffingPlan,
} from '@/lib/staffing-model'
import { Card, CardTitle, Stat } from '../studies/ui'
import { PlanHistory } from './plan-history'

const STATUS_BADGE: Record<KitStatus, { color: 'green' | 'amber' | 'red'; label: string }> = {
  on_track: { color: 'green', label: 'On Track' },
  at_risk: { color: 'amber', label: 'At Risk' },
  will_not_complete: { color: 'red', label: 'Will Not Complete' },
}

type FieldKey = 'date' | 'start' | 'headcount' | 'fak' | 'rak' | 'uyak'

type Generated = {
  plan: StaffingPlan
  startMin: number
  saveInput: SaveShiftPlanInput
}

/** Strict non-negative integer parse; blank counts as 0 for quantities. */
function parseCount(raw: string, blankAsZero: boolean): number | null {
  const s = raw.trim()
  if (s === '') return blankAsZero ? 0 : null
  return /^\d+$/.test(s) ? Number(s) : null
}

function StatusBadge({ status }: { status: KitStatus }) {
  const { color, label } = STATUS_BADGE[status]
  return <Badge color={color}>{label}</Badge>
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-medium text-zinc-950 tabular-nums dark:text-white">{value}</span>
    </div>
  )
}

export function ShiftPlanner({ defaultDate, history }: { defaultDate: string; history: ShiftPlanRecord[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [shiftDate, setShiftDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('06:00')
  const [headcount, setHeadcount] = useState('')
  const [fak, setFak] = useState('')
  const [rak, setRak] = useState('')
  const [uyak, setUyak] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<Generated | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  function generate() {
    const errors: Partial<Record<FieldKey, string>> = {}
    if (!shiftDate) errors.date = 'Pick a shift date.'
    if (!startTime) errors.start = 'Pick a start time.'

    const hc = parseCount(headcount, false)
    if (hc === null || hc < 1 || hc > MAX_HEADCOUNT) {
      errors.headcount = `Enter a headcount between 1 and ${MAX_HEADCOUNT}.`
    } else if (hc <= OVERHEAD_WORKERS) {
      errors.headcount = 'Minimum 5 workers needed after overhead allocation.'
    }

    const fakQty = parseCount(fak, true)
    const rakQty = parseCount(rak, true)
    const uyakQty = parseCount(uyak, true)
    if (fakQty === null) errors.fak = 'Enter a whole number of 0 or more.'
    if (rakQty === null) errors.rak = 'Enter a whole number of 0 or more.'
    if (uyakQty === null) errors.uyak = 'Enter a whole number of 0 or more.'

    const allZero = (fakQty ?? 0) === 0 && (rakQty ?? 0) === 0 && (uyakQty ?? 0) === 0
    setFormError(allZero ? 'Enter at least one kit type quantity.' : null)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || allZero) {
      setGenerated(null)
      return
    }

    const saveInput: SaveShiftPlanInput = {
      shiftDate,
      shiftStartTime: startTime,
      availableHeadcount: hc!,
      fakQty: fakQty!,
      rakQty: rakQty!,
      uyakQty: uyakQty!,
    }
    const plan = calculateStaffingPlan(saveInput)
    if (!plan.ok) {
      setFormError(plan.errors.join(' '))
      setGenerated(null)
      return
    }
    setGenerated({ plan, startMin: parseClockToMinutes(startTime), saveInput })
  }

  function save() {
    if (!generated) return
    startTransition(async () => {
      const res = await saveShiftPlan(generated.saveInput)
      if (res.ok) {
        showToast('Shift plan saved.')
        router.refresh()
      } else {
        showToast('Failed to save plan. Try again.')
      }
    })
  }

  const plan = generated?.plan ?? null
  const clock = (min: number) => (generated ? formatClock12(generated.startMin + min) : '')
  const uyakFlexImproved =
    plan?.areas.uyak &&
    plan.areas.uyak.initialCompletionMin !== null &&
    plan.areas.uyak.finalCompletionMin !== null &&
    plan.areas.uyak.initialCompletionMin - plan.areas.uyak.finalCompletionMin > 0.5

  return (
    <div className="mx-auto max-w-5xl">
      <Heading>Shift Planning</Heading>
      <p className="mt-1 max-w-3xl text-sm text-zinc-500">
        Enter today&apos;s order queue and available headcount to get a recommended staffing plan, estimated completion
        times, and flex assignments for the shift.
      </p>

      {/* Section 1 — Shift inputs */}
      <Card className="mt-6">
        <CardTitle>Shift Setup</CardTitle>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label>Shift date</Label>
            <Input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
            {fieldErrors.date && <ErrorMessage>{fieldErrors.date}</ErrorMessage>}
          </Field>
          <Field>
            <Label>Shift start time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            {fieldErrors.start && <ErrorMessage>{fieldErrors.start}</ErrorMessage>}
          </Field>
          <Field>
            <Label>Available headcount</Label>
            <Input
              type="number"
              min={1}
              max={MAX_HEADCOUNT}
              step="1"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              placeholder="e.g. 18"
            />
            {fieldErrors.headcount && <ErrorMessage>{fieldErrors.headcount}</ErrorMessage>}
          </Field>
        </div>

        <CardTitle className="mt-6">Order Queue</CardTitle>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label>FAK quantity</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={fak}
              onChange={(e) => setFak(e.target.value)}
              placeholder="0"
            />
            {fieldErrors.fak && <ErrorMessage>{fieldErrors.fak}</ErrorMessage>}
          </Field>
          <Field>
            <Label>RAK quantity</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={rak}
              onChange={(e) => setRak(e.target.value)}
              placeholder="0"
            />
            {fieldErrors.rak && <ErrorMessage>{fieldErrors.rak}</ErrorMessage>}
          </Field>
          <Field>
            <Label>UYAK quantity</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={uyak}
              onChange={(e) => setUyak(e.target.value)}
              placeholder="0"
            />
            {fieldErrors.uyak && <ErrorMessage>{fieldErrors.uyak}</ErrorMessage>}
          </Field>
        </div>

        {formError && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20">
            {formError}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <Button color="blue" onClick={generate}>
            <Calculator className="size-4" /> Generate Plan
          </Button>
        </div>
      </Card>

      {plan && (
        <>
          {/* Section 2 — Staffing recommendation */}
          <Subheading className="mt-10">Staffing Recommendation</Subheading>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Headcount" value={String(plan.headcount.total)} />
            <Stat label="Producing" value={String(plan.headcount.producing)} />
            <Stat label="Overhead" value={String(plan.headcount.overhead)} />
            <Stat label="Unassigned" value={String(plan.headcount.unassigned)} />
          </div>

          {plan.headcount.unassigned > 0 && (
            <p className="mt-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
              {plan.headcount.unassigned} worker{plan.headcount.unassigned === 1 ? '' : 's'} unassigned — available as
              flex.
              {plan.headcount.backupArea && (
                <>
                  {' '}
                  Position as primary backup at{' '}
                  {plan.headcount.backupArea === 'uyak' ? 'the UYAK personalization line' : 'the FAK/RAK manual line'}.
                </>
              )}
            </p>
          )}

          {plan.warnings.length > 0 && (
            <ul className="mt-3 space-y-2">
              {plan.warnings.map((w) => (
                <li
                  key={w}
                  className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20"
                >
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.areas.fakRak && (
              <Card>
                <CardTitle>FAK/RAK Manual</CardTitle>
                <div className="mt-3 space-y-2">
                  <Row label="Workers" value={plan.areas.fakRak.workers} />
                  <Row label="Est. start" value={clock(plan.areas.fakRak.fakStartMin)} />
                  {plan.areas.fakRak.fakCompletionMin !== null && (
                    <Row label="FAK completion" value={clock(plan.areas.fakRak.fakCompletionMin)} />
                  )}
                  {plan.areas.fakRak.rakStartMin !== null && (
                    <Row label="RAK start" value={clock(plan.areas.fakRak.rakStartMin)} />
                  )}
                  {plan.areas.fakRak.rakCompletionMin !== null && (
                    <Row label="RAK completion" value={clock(plan.areas.fakRak.rakCompletionMin)} />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan.kits
                    .filter((k) => k.kit === 'FAK' || k.kit === 'RAK')
                    .map((k) => (
                      <span key={k.kit} className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                        {k.kit} <StatusBadge status={k.status} />
                      </span>
                    ))}
                </div>
              </Card>
            )}

            {plan.areas.uyak && (
              <Card>
                <CardTitle>UYAK Personalization</CardTitle>
                <div className="mt-3 space-y-2">
                  <Row label="Active stations" value={`${plan.areas.uyak.stations} of ${UYAK_MAX_STATIONS}`} />
                  <Row label="Station workers" value={plan.areas.uyak.stationWorkers} />
                  <Row label="Tape/scan workers" value={plan.areas.uyak.tapeScanWorkers} />
                  {plan.areas.uyak.finalCompletionMin !== null && (
                    <Row label="Est. completion" value={clock(plan.areas.uyak.finalCompletionMin)} />
                  )}
                </div>
                {uyakFlexImproved && plan.areas.uyak.initialCompletionMin !== null && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {clock(plan.areas.uyak.initialCompletionMin)} without flex moves — see the flex plan below.
                  </p>
                )}
                <div className="mt-3">
                  {plan.kits
                    .filter((k) => k.kit === 'UYAK')
                    .map((k) => (
                      <StatusBadge key={k.kit} status={k.status} />
                    ))}
                </div>
              </Card>
            )}

            {plan.areas.assembly && (
              <Card>
                <CardTitle>Assembly</CardTitle>
                <div className="mt-3 space-y-2">
                  <Row label="Lines running" value={plan.areas.assembly.lines} />
                  <Row label="Workers" value={plan.areas.assembly.workers} />
                  <Row label="Recommended start" value={clock(plan.areas.assembly.startMin)} />
                  {plan.areas.assembly.completionMin !== null && (
                    <Row label="Est. completion" value={clock(plan.areas.assembly.completionMin)} />
                  )}
                </div>
                <p className="mt-2 text-xs text-zinc-500">Pre-starts 1 hour early to build the UYAK buffer.</p>
              </Card>
            )}

            <Card>
              <CardTitle>Material Handling</CardTitle>
              <div className="mt-3 space-y-2">
                <Row label="Workers" value={plan.areas.materialHandling.workers} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">Fixed overhead — staffed before producing areas.</p>
            </Card>

            <Card>
              <CardTitle>Replenishment</CardTitle>
              <div className="mt-3 space-y-2">
                <Row label="Workers" value={plan.areas.replenishment.workers} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">Fixed overhead — staffed before producing areas.</p>
            </Card>
          </div>

          {/* Section 3 — Flex recommendations */}
          {plan.flex.length > 0 && (
            <>
              <Subheading className="mt-10">Flex Recommendations</Subheading>
              <Card className="mt-4">
                <ol className="space-y-5">
                  {plan.flex.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
                        <Clock className="size-4" />
                      </span>
                      <div className="min-w-0 text-sm">
                        <div className="font-semibold text-zinc-950 tabular-nums dark:text-white">
                          {clock(e.triggerMin)}
                        </div>
                        {e.kind === 'pivot' ? (
                          <>
                            <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">
                              FAK batch completes. FAK/RAK line pivots to RAK.
                            </p>
                            {e.newCompletionMin !== null && (
                              <p className="text-zinc-500">→ RAK estimated completion: {clock(e.newCompletionMin)}</p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">
                              {e.fromArea} completes at {clock(e.completionMin)}.
                            </p>
                            <p className="text-zinc-500">
                              → Move {e.workers} worker{e.workers === 1 ? '' : 's'} to {describeFlexTarget(e)}
                            </p>
                            {e.newCompletionMin !== null && (
                              <p className="text-zinc-500">→ Updated UYAK completion: {clock(e.newCompletionMin)}</p>
                            )}
                            {e.unplacedWorkers > 0 && (
                              <p className="text-zinc-500">
                                ({e.unplacedWorkers} freed worker{e.unplacedWorkers === 1 ? '' : 's'} stay
                                {e.unplacedWorkers === 1 ? 's' : ''} on standby as floats)
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          )}

          {/* Section 4 — Shift summary & status */}
          <Subheading className="mt-10">Shift Summary &amp; Status</Subheading>
          <Card className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Kit Type</TableHeader>
                  <TableHeader>Qty</TableHeader>
                  <TableHeader>Est. Completion</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {plan.kits.map((k) => (
                  <TableRow key={k.kit}>
                    <TableCell className="font-medium">{k.kit}</TableCell>
                    <TableCell className="tabular-nums">{k.qty.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">
                      {k.completionMin !== null ? clock(k.completionMin) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={k.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {plan.kits.some((k) => k.status !== 'on_track') && (
              <div className="mt-4 space-y-3">
                {plan.kits
                  .filter((k) => k.status !== 'on_track')
                  .map((k) => (
                    <KitCallout key={k.kit} kit={k} clock={clock} />
                  ))}
              </div>
            )}
          </Card>

          {/* Section 5 — Save plan */}
          <div className="mt-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-zinc-500">
              Save this plan to history — you can re-plan and save again mid-shift.
            </p>
            <Button color="blue" onClick={save} disabled={isPending}>
              <Save className="size-4" /> {isPending ? 'Saving…' : 'Save Plan'}
            </Button>
          </div>
        </>
      )}

      {/* Section 6 — Plan history */}
      <PlanHistory rows={history} />

      {/* Toast */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg ring-1 ring-white/10 dark:bg-zinc-800"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function KitCallout({ kit, clock }: { kit: KitOutcome; clock: (min: number) => string }) {
  const severe = kit.status === 'will_not_complete'
  const headline =
    kit.completionMin === null
      ? `${kit.kit} cannot run at current headcount.`
      : severe
        ? `${kit.kit} will not complete within shift — ${formatDuration(kit.minutesOver ?? 0)} over.`
        : `${kit.kit} is at risk of not completing within shift.`

  let optionA: string | null = null
  if (kit.optionA) {
    if (kit.optionA.possible) {
      optionA = `Option A: Add ${kit.optionA.addWorkers} worker${kit.optionA.addWorkers === 1 ? '' : 's'} to UYAK (${kit.optionA.totalStations} stations total, incl. tape/scan + assembly pairing) to complete by ${clock(kit.optionA.completionMin)}.`
    } else if (kit.optionA.reason === 'fixed_line') {
      optionA =
        'Option A: Not possible — the FAK/RAK line is a fixed 5-station crew. Extend the shift or reduce volume.'
    } else if (kit.optionA.reason === 'station_cap') {
      optionA = `Option A: Not possible — even all ${UYAK_MAX_STATIONS} UYAK stations cannot finish within shift. Extend the shift or reduce volume.`
    } else {
      optionA = 'Option A: Add headcount to staff this area (see the flags above).'
    }
  }

  return (
    <div
      className={
        severe
          ? 'rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20'
          : 'rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
      }
    >
      <p className="font-medium">{headline}</p>
      {optionA && <p className="mt-1">{optionA}</p>}
      {kit.optionB && (
        <p className="mt-1">
          Option B: At current staffing, {kit.optionB.achievableQty.toLocaleString()} of {kit.qty.toLocaleString()}{' '}
          {kit.kit} orders complete within shift.
        </p>
      )}
    </div>
  )
}
