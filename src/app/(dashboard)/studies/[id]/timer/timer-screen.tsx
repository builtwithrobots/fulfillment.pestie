'use client'

import { ArrowRight, FileText, Play, RotateCcw, Save, Square } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { recordMasterRun, recordObservation } from '@/lib/studies/actions'
import { fmtMs, type StepWithObservations } from '@/lib/time-study'
import { Card, CardTitle } from '../../ui'

type LiveStep = StepWithObservations & { startTs: number | null }

// Wall-clock read, isolated at module scope so it's outside the component's
// render-purity analysis — every call site below is an event handler.
const nowMs = () => Date.now()

export function TimerScreen({
  studyId,
  title,
  useWholeTimer,
  initialSteps,
  initialMasterRuns,
}: {
  studyId: string
  title: string
  useWholeTimer: boolean
  initialSteps: StepWithObservations[]
  initialMasterRuns: number[]
}) {
  const router = useRouter()

  const [steps, setSteps] = useState<LiveStep[]>(() =>
    initialSteps.map((s) => ({ ...s, startTs: null }))
  )
  const [master, setMaster] = useState<{ startTs: number | null; elapsed: number; runs: number[] }>({
    startTs: null,
    elapsed: 0,
    runs: initialMasterRuns,
  })
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

  // ── Step timers ──────────────────────────────────────────────
  function toggleStep(id: string) {
    const step = steps.find((s) => s.id === id)
    if (!step || !step.timed) return

    if (step.startTs === null) {
      // Start
      const startTs = nowMs()
      setNow(startTs)
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, startTs } : s)))
    } else {
      // Stop → record ONE observation immediately (no batching)
      const elapsed = nowMs() - step.startTs
      setSteps((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, startTs: null, observations: [...s.observations, elapsed] } : s
        )
      )
      recordObservation(studyId, id, elapsed).then((res) => {
        if (!res.ok) {
          // Roll back the optimistic observation.
          setSteps((prev) =>
            prev.map((s) => {
              if (s.id !== id) return s
              const idx = s.observations.lastIndexOf(elapsed)
              if (idx === -1) return s
              const next = [...s.observations]
              next.splice(idx, 1)
              return { ...s, observations: next }
            })
          )
          showToast(`Couldn't save observation: ${res.error}`)
        }
      })
    }
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
    setMaster((m) => ({ ...m, startTs: null, elapsed: 0, runs: [...m.runs, value] }))
    recordMasterRun(studyId, value).then((res) => {
      if (res.ok) {
        showToast(`Master run saved.`)
      } else {
        setMaster((m) => {
          const idx = m.runs.lastIndexOf(value)
          const runs = [...m.runs]
          if (idx !== -1) runs.splice(idx, 1)
          return { ...m, runs }
        })
        showToast(`Couldn't save run: ${res.error}`)
      }
    })
  }

  function resetMaster() {
    setMaster((m) => ({ ...m, startTs: null, elapsed: 0 }))
  }

  // ── Progress ─────────────────────────────────────────────────
  const timedSteps = steps.filter((s) => s.timed)
  const doneCount = timedSteps.filter((s) => s.observations.length > 0).length
  const pct = timedSteps.length ? Math.round((doneCount / timedSteps.length) * 100) : 0

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

      {/* Master timer */}
      {useWholeTimer && (
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
              {master.runs.map((ms, i) => (
                <span
                  key={i}
                  className="rounded-md bg-violet-500/10 px-2 py-0.5 font-mono text-xs text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-300"
                >
                  R{i + 1}: {fmtMs(ms)}
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
          return (
            <Card
              key={step.id}
              className={step.timed ? '' : 'border border-dashed border-zinc-300 opacity-80 dark:border-white/15'}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-xs tabular-nums text-zinc-400">
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
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-white/5">
                      {step.observations.length} obs
                    </span>
                  </div>
                  {step.observations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {step.observations.map((ms, oi) => (
                        <span
                          key={oi}
                          title={`Obs ${oi + 1}`}
                          className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
                        >
                          {fmtMs(ms)}
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
