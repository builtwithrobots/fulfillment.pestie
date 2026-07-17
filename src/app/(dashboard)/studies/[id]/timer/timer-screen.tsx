'use client'

import {
  ArrowRight,
  Check,
  FileText,
  Play,
  Repeat,
  RotateCcw,
  Save,
  SkipForward,
  Square,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { createRosterWorker } from '@/lib/roster/actions'
import { recordMasterRun, recordObservation } from '@/lib/studies/actions'
import { fmtMs, type Observation, type StepWithObservations } from '@/lib/time-study'
import { Card, CardTitle } from '../../ui'

type LiveStep = StepWithObservations & { startTs: number | null }
type WorkerOption = { id: string; fullName: string }

// Wall-clock read, isolated at module scope so it's outside the component's
// render-purity analysis — every call site below is an event handler.
const nowMs = () => Date.now()

// Sentinel <option> value meaning "follow the session-level Timing picker" in
// the per-step selector ('' is taken by Unattributed).
const FOLLOW_SESSION = '__session__'

export function TimerScreen({
  studyId,
  title,
  useWholeTimer,
  initialSteps,
  initialMasterRuns,
  initialWorkers,
  workerNames,
}: {
  studyId: string
  title: string
  useWholeTimer: boolean
  initialSteps: StepWithObservations[]
  initialMasterRuns: Observation[]
  initialWorkers: WorkerOption[]
  /** id → name for EVERY worker (incl. inactive), so old tooltips resolve. */
  workerNames: Record<string, string>
}) {
  const [steps, setSteps] = useState<LiveStep[]>(() => initialSteps.map((s) => ({ ...s, startTs: null })))
  const [master, setMaster] = useState<{ startTs: number | null; elapsed: number; runs: Observation[] }>({
    startTs: null,
    elapsed: 0,
    runs: initialMasterRuns,
  })
  // Who is being timed: stamped onto every observation/run recorded while
  // selected. Null = unattributed, so timing never blocks on roster hygiene.
  // Steps can override this individually (stepWorkers) for line studies where
  // different people run different steps at the same time.
  const [workers, setWorkers] = useState<WorkerOption[]>(initialWorkers)
  const [workerId, setWorkerId] = useState<string | null>(null)
  const [stepWorkers, setStepWorkers] = useState<Record<string, string | null>>({})
  const [newWorkerName, setNewWorkerName] = useState('')
  // Cycle mode: run the timed steps in sequence with one control (tap through),
  // recording a split observation per step -- each stamped with that step's
  // assigned person. cycleIdx is the position among timed steps, or null idle.
  const [mode, setMode] = useState<'step' | 'cycle'>('step')
  const [cycleIdx, setCycleIdx] = useState<number | null>(null)
  const [cycleCount, setCycleCount] = useState(0)
  const [now, setNow] = useState(() => nowMs())
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const anyRunning = steps.some((s) => s.startTs !== null) || master.startTs !== null
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setNow(nowMs()), 100)
    return () => clearInterval(id)
  }, [anyRunning])

  // ── Observation recording (shared by per-step and cycle timing) ──
  // Records ONE observation immediately (no batching), stamped with the step's
  // assigned person, with optimistic append + rollback on failure. Does not
  // touch startTs -- callers manage the running state.
  function recordStepObservation(stepId: string, elapsed: number) {
    const stampedWorker = workerForStep(stepId)
    const obs: Observation = { durationMs: elapsed, workerId: stampedWorker }
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, observations: [...s.observations, obs] } : s)))
    const rollback = (reason: string) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, observations: s.observations.filter((o) => o !== obs) } : s))
      )
      showToast(`Couldn't save observation: ${reason}`)
    }
    recordObservation(studyId, stepId, elapsed, stampedWorker)
      .then((res) => {
        if (!res.ok) rollback(res.error)
      })
      .catch(() => rollback('network error — check your connection.'))
  }

  // ── Per-step timers ──────────────────────────────────────────
  function toggleStep(id: string) {
    const step = steps.find((s) => s.id === id)
    if (!step || !step.timed) return

    if (step.startTs === null) {
      const startTs = nowMs()
      setNow(startTs)
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, startTs } : s)))
    } else {
      const elapsed = nowMs() - step.startTs
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, startTs: null } : s)))
      recordStepObservation(id, elapsed)
    }
  }

  // ── Cycle mode ───────────────────────────────────────────────
  function switchMode(next: 'step' | 'cycle') {
    if (next === mode) return
    // Discard any in-progress (unsaved) running timer when switching modes.
    setSteps((prev) => prev.map((s) => ({ ...s, startTs: null })))
    setCycleIdx(null)
    setMode(next)
  }

  function startCycle() {
    const timed = steps.filter((s) => s.timed)
    if (timed.length === 0) return
    const start = nowMs()
    setNow(start)
    setCycleIdx(0)
    setSteps((prev) => prev.map((s) => ({ ...s, startTs: s.id === timed[0].id ? start : null })))
  }

  function advanceCycle() {
    if (cycleIdx === null) return
    const timed = steps.filter((s) => s.timed)
    const current = timed[cycleIdx]
    if (!current || current.startTs === null) return

    recordStepObservation(current.id, nowMs() - current.startTs)

    const nextIdx = cycleIdx + 1
    if (nextIdx < timed.length) {
      const start = nowMs()
      setNow(start)
      setCycleIdx(nextIdx)
      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === current.id) return { ...s, startTs: null }
          if (s.id === timed[nextIdx].id) return { ...s, startTs: start }
          return s
        })
      )
    } else {
      setCycleIdx(null)
      setCycleCount((c) => c + 1)
      setSteps((prev) => prev.map((s) => (s.id === current.id ? { ...s, startTs: null } : s)))
      showToast(`Cycle recorded — ${timed.length} step${timed.length !== 1 ? 's' : ''}.`)
    }
  }

  function cancelCycle() {
    setSteps((prev) => prev.map((s) => ({ ...s, startTs: null })))
    setCycleIdx(null)
  }

  // ── Master timer ─────────────────────────────────────────────
  const masterElapsed = master.startTs !== null ? now - master.startTs : master.elapsed
  const masterActive = master.startTs !== null || master.elapsed > 0

  function toggleMaster() {
    setMaster((m) => {
      if (m.startTs === null) {
        const startTs = nowMs() - m.elapsed
        setNow(nowMs())
        return { ...m, startTs }
      }
      return { ...m, startTs: null, elapsed: nowMs() - m.startTs }
    })
  }

  function saveMasterRun() {
    const value = master.startTs !== null ? nowMs() - master.startTs : master.elapsed
    if (value <= 0) return
    const run: Observation = { durationMs: value, workerId }
    setMaster((m) => ({ ...m, startTs: null, elapsed: 0, runs: [...m.runs, run] }))
    const rollback = (reason: string) => {
      // Restore the elapsed value so a failed save never discards the timing.
      setMaster((m) => ({
        ...m,
        elapsed: m.startTs === null ? value : m.elapsed,
        runs: m.runs.filter((r) => r !== run),
      }))
      showToast(`Couldn't save run: ${reason}`)
    }
    recordMasterRun(studyId, value, workerId)
      .then((res) => {
        if (res.ok) {
          showToast(`Master run saved.`)
        } else {
          rollback(res.error)
        }
      })
      .catch(() => rollback('network error — check your connection.'))
  }

  // ── Worker attribution ───────────────────────────────────────
  function addWorker() {
    const name = newWorkerName.trim()
    if (!name) return
    createRosterWorker(name)
      .then((res) => {
        if (!res.ok) {
          if (res.existing) {
            // Already on the roster — select them instead of duplicating.
            const existing = res.existing
            setWorkers((prev) =>
              prev.some((w) => w.id === existing.id)
                ? prev
                : [...prev, { id: existing.id, fullName: existing.fullName }].sort((a, b) =>
                    a.fullName.localeCompare(b.fullName)
                  )
            )
            setWorkerId(existing.id)
            setNewWorkerName('')
            showToast(`${existing.fullName} is already on the roster — selected.`)
          } else {
            showToast(`Couldn't add person: ${res.error}`)
          }
          return
        }
        setWorkers((prev) =>
          [...prev, { id: res.id, fullName: res.fullName }].sort((a, b) => a.fullName.localeCompare(b.fullName))
        )
        setWorkerId(res.id)
        setNewWorkerName('')
        if (res.similarNames.length > 0) {
          showToast(`Added. Similar name(s) on roster: ${res.similarNames.join(', ')}`)
        }
      })
      .catch(() => showToast('Couldn’t add person: network error.'))
  }

  const workerName = (id: string | null) =>
    id ? (workers.find((w) => w.id === id)?.fullName ?? workerNames[id] ?? null) : null

  /** The worker an observation on this step gets stamped with right now. */
  const workerForStep = (stepId: string) => (stepId in stepWorkers ? stepWorkers[stepId] : workerId)

  function resetMaster() {
    setMaster((m) => ({ ...m, startTs: null, elapsed: 0 }))
  }

  // ── Progress ─────────────────────────────────────────────────
  const timedSteps = steps.filter((s) => s.timed)
  const doneCount = timedSteps.filter((s) => s.observations.length > 0).length
  const pct = timedSteps.length ? Math.round((doneCount / timedSteps.length) * 100) : 0

  // ── Cycle-mode derived state ─────────────────────────────────
  const cycleActive = cycleIdx !== null
  const cycleStep = cycleActive ? timedSteps[cycleIdx] : null
  const cycleElapsed = cycleStep?.startTs != null ? now - cycleStep.startTs : 0
  const cycleIsLast = cycleActive && cycleIdx === timedSteps.length - 1

  const badge = useWholeTimer
    ? `${timedSteps.length} timed step${timedSteps.length !== 1 ? 's' : ''} + master timer`
    : `${timedSteps.length} of ${steps.length} steps timed`

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading>{title}</Heading>
          <div className="mt-1">
            <Badge color="blue">{badge}</Badge>
          </div>
        </div>
        <Button color="blue" href={`/studies/${studyId}/results`}>
          Finish <ArrowRight className="size-4" />
        </Button>
      </div>

      {/* Progress */}
      <div className="mt-6">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {timedSteps.length
            ? `${doneCount} of ${timedSteps.length} timed step${timedSteps.length !== 1 ? 's' : ''} have observations`
            : 'No steps set to be timed.'}
        </p>
      </div>

      {/* Who's being timed — stamped onto every recording until changed. */}
      <Card className="mt-4">
        <CardTitle>Timing</CardTitle>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={workerId ?? ''}
            onChange={(e) => setWorkerId(e.target.value || null)}
            aria-label="Employee being timed"
            className="max-w-60"
          >
            <option value="">— Unattributed —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.fullName}
              </option>
            ))}
          </Select>
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addWorker()
                }
              }}
              maxLength={80}
              placeholder="Add a new person…"
              aria-label="Add a new person to the roster"
              className="min-w-40 flex-1"
            />
            <Button plain onClick={addWorker} aria-label="Add person and select them">
              <UserPlus className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {workerId
            ? `Recordings are attributed to ${workerName(workerId)} and appear on their roster profile.`
            : 'Pick who you’re observing to build their roster profile (optional).'}{' '}
          Timing different people on different steps? Override per step below.
        </p>
      </Card>

      {/* Timing mode -- only meaningful with timed steps */}
      {timedSteps.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Timing mode</span>
          <div
            role="radiogroup"
            aria-label="Timing mode"
            className="inline-flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
          >
            {(['step', 'cycle'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => switchMode(m)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-700 dark:text-white dark:ring-white/10'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {m === 'cycle' ? <Repeat className="size-4" /> : <Play className="size-4" />}
                {m === 'step' ? 'Per step' : 'Cycle'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cycle control -- drives the timed steps in sequence */}
      {mode === 'cycle' && timedSteps.length > 0 && (
        <Card className="mt-4 ring-emerald-500/30 dark:ring-emerald-400/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-emerald-600 dark:text-emerald-400">Cycle timing</CardTitle>
            {cycleCount > 0 && (
              <span className="text-xs text-zinc-500">
                {cycleCount} cycle{cycleCount !== 1 ? 's' : ''} recorded
              </span>
            )}
          </div>

          {cycleActive && cycleStep ? (
            <div className="mt-3">
              <div className="text-sm text-zinc-500">
                Step {(cycleIdx as number) + 1} of {timedSteps.length} ·{' '}
                <span className="font-medium text-zinc-950 dark:text-white">{cycleStep.name}</span>
                {workerName(workerForStep(cycleStep.id)) && <> · {workerName(workerForStep(cycleStep.id))}</>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="font-mono text-3xl font-bold text-emerald-600 tabular-nums sm:text-4xl dark:text-emerald-400">
                  {fmtMs(cycleElapsed)}
                </div>
                <Button color="emerald" onClick={advanceCycle}>
                  {cycleIsLast ? (
                    <>
                      <Check className="size-4" /> Finish cycle
                    </>
                  ) : (
                    <>
                      <SkipForward className="size-4" /> Next step
                    </>
                  )}
                </Button>
                <Button plain onClick={cancelCycle} aria-label="Cancel cycle">
                  <X className="size-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button color="emerald" onClick={startCycle}>
                <Play className="size-4" /> Start cycle
              </Button>
              <p className="text-xs text-zinc-500">
                Tap through the {timedSteps.length} steps in order — each split saves to that step’s assigned person.
                Assign people per step below.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Master timer -- per-step mode only (cycle mode replaces it) */}
      {useWholeTimer && mode === 'step' && (
        <Card className="mt-4 ring-violet-500/30 dark:ring-violet-400/20">
          <CardTitle className="text-violet-600 dark:text-violet-400">Master timer</CardTitle>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div
              className={`font-mono text-3xl font-bold tabular-nums sm:text-4xl ${
                master.startTs !== null ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-950 dark:text-white'
              }`}
              aria-live="polite"
            >
              {fmtMs(masterElapsed)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button color="violet" onClick={toggleMaster}>
                {master.startTs !== null ? (
                  <>
                    <Square className="size-4" /> Stop
                  </>
                ) : (
                  <>
                    <Play className="size-4" /> Start
                  </>
                )}
              </Button>
              <Button outline onClick={saveMasterRun} disabled={!masterActive}>
                <Save className="size-4" /> Save run
              </Button>
              <Button plain onClick={resetMaster} disabled={!masterActive}>
                <RotateCcw className="size-4" /> Reset
              </Button>
            </div>
          </div>
          {master.runs.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">RUNS:</span>
              {master.runs.map((r, i) => (
                <span
                  key={i}
                  title={workerName(r.workerId) ?? undefined}
                  className="rounded-md bg-violet-500/10 px-2 py-0.5 font-mono text-xs text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-300"
                >
                  R{i + 1}: {fmtMs(r.durationMs)}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Step timer cards */}
      <ul className="mt-4 space-y-3">
        {steps.map((step, i) => {
          const running = step.startTs !== null
          const elapsed = running ? now - (step.startTs as number) : 0
          const isCycleActive = mode === 'cycle' && cycleStep?.id === step.id
          return (
            <Card
              key={step.id}
              className={
                !step.timed
                  ? 'border border-dashed border-zinc-300 opacity-80 dark:border-white/15'
                  : isCycleActive
                    ? 'ring-2 ring-emerald-500/50 dark:ring-emerald-400/40'
                    : ''
              }
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-xs text-zinc-400 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-950 dark:text-white">{step.name}</div>
                  {step.notes && <p className="mt-0.5 text-sm text-zinc-500">{step.notes}</p>}
                </div>
              </div>

              {step.timed ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div
                      className={`font-mono text-2xl font-bold tabular-nums ${
                        running ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-950 dark:text-white'
                      }`}
                    >
                      {fmtMs(elapsed)}
                    </div>
                    {mode === 'step' ? (
                      <Button color={running ? 'amber' : 'emerald'} onClick={() => toggleStep(step.id)}>
                        {running ? (
                          <>
                            <Square className="size-4" /> Stop
                          </>
                        ) : (
                          <>
                            <Play className="size-4" /> Start
                          </>
                        )}
                      </Button>
                    ) : isCycleActive ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                        <Repeat className="size-3.5" /> Timing now
                      </span>
                    ) : null}
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-white/5">
                      {step.observations.length} obs
                    </span>
                    {/* Per-step attribution override, for line studies where
                        different people run different steps simultaneously. */}
                    <Select
                      value={step.id in stepWorkers ? (stepWorkers[step.id] ?? '') : FOLLOW_SESSION}
                      onChange={(e) => {
                        const v = e.target.value
                        setStepWorkers((prev) => {
                          if (v === FOLLOW_SESSION) {
                            const { [step.id]: _dropped, ...rest } = prev
                            return rest
                          }
                          return { ...prev, [step.id]: v || null }
                        })
                      }}
                      aria-label={`Person timed on ${step.name}`}
                      className="ml-auto max-w-48"
                    >
                      <option value={FOLLOW_SESSION}>
                        {workerName(workerId) ? `Timing: ${workerName(workerId)}` : 'Timing: session pick'}
                      </option>
                      <option value="">— Unattributed —</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.fullName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {step.observations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {step.observations.map((o, oi) => (
                        <span
                          key={oi}
                          title={`Obs ${oi + 1}${workerName(o.workerId) ? ` — ${workerName(o.workerId)}` : ''}`}
                          className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
                        >
                          {fmtMs(o.durationMs)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-500 dark:bg-white/5">
                  <FileText className="size-3.5" /> Documented — not timed
                </div>
              )}
            </Card>
          )
        })}
      </ul>

      <div className="mt-6">
        <Button color="emerald" href={`/studies/${studyId}/results`} className="w-full justify-center">
          Finish &amp; view results <ArrowRight className="size-4" />
        </Button>
      </div>

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
