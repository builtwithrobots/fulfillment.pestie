'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Switch } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { createStudy, updateStudy, type StudyInput } from '@/lib/studies/actions'
import { Card, CardTitle } from './ui'

type BuilderStep = {
  key: string // stable React key
  id?: string // DB id when editing an existing step
  name: string
  notes: string
  timed: boolean
  piecesPerCycle: string // free-text while editing; parsed to an int ≥1 on save
  notesOpen: boolean
}

export type SetupInitial = {
  id?: string
  title: string
  wageRate: number
  allowancePct: number
  useWholeTimer: boolean
  isGroupCheck: boolean
  steps: { id: string; name: string; notes: string | null; timed: boolean; piecesPerCycle: number }[]
}

let keySeq = 0
const nextKey = () => `s${keySeq++}`

export function SetupForm({ initial }: { initial?: SetupInitial }) {
  const router = useRouter()
  const editing = !!initial?.id
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [wage, setWage] = useState(initial?.wageRate ? String(initial.wageRate) : '')
  const [allowance, setAllowance] = useState(initial?.allowancePct ? String(initial.allowancePct) : '')
  const [useWhole, setUseWhole] = useState(initial?.useWholeTimer ?? false)
  const [isGroupCheck, setIsGroupCheck] = useState(initial?.isGroupCheck ?? false)
  const [steps, setSteps] = useState<BuilderStep[]>(
    () =>
      initial?.steps.map((s) => ({
        key: nextKey(),
        id: s.id,
        name: s.name,
        notes: s.notes ?? '',
        timed: s.timed,
        piecesPerCycle: String(s.piecesPerCycle ?? 1),
        notesOpen: !!s.notes,
      })) ?? []
  )
  const [newStep, setNewStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const newStepRef = useRef<HTMLInputElement>(null)

  function addStep() {
    const name = newStep.trim()
    if (!name) return
    setSteps((prev) => [
      ...prev,
      { key: nextKey(), name, notes: '', timed: true, piecesPerCycle: '1', notesOpen: false },
    ])
    setNewStep('')
    newStepRef.current?.focus()
  }

  function patchStep(key: string, patch: Partial<BuilderStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key))
  }

  function moveStep(key: string, dir: -1 | 1) {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function save() {
    setError(null)
    const input: StudyInput = {
      title,
      wageRate: parseFloat(wage) || 0,
      allowancePct: parseFloat(allowance) || 0,
      useWholeTimer: useWhole,
      isGroupCheck,
      steps: steps.map((s) => ({
        id: s.id,
        name: s.name,
        notes: s.notes,
        timed: s.timed,
        piecesPerCycle: Math.max(1, Math.floor(Number(s.piecesPerCycle) || 1)),
      })),
    }
    startTransition(async () => {
      if (editing && initial?.id) {
        const res = await updateStudy(initial.id, input)
        if (!res.ok) return setError(res.error)
        router.push(`/studies/${initial.id}/timer`)
      } else {
        const res = await createStudy(input)
        if (!res.ok) return setError(res.error)
        router.push(`/studies/${res.data.id}/timer`)
      }
    })
  }

  const timedCount = steps.filter((s) => s.timed).length

  return (
    <div className="mx-auto max-w-3xl">
      <Heading>{editing ? 'Edit study setup' : 'New time study'}</Heading>
      <p className="mt-1 text-sm text-zinc-500">Plan the process, then observe and improve.</p>

      {/* Study details */}
      <Card className="mt-6">
        <CardTitle>Study details</CardTitle>
        <div className="mt-4 space-y-4">
          <Field>
            <Label>Study title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Pestie Kit Assembly — Line A"
            />
          </Field>
          <Field>
            <Label>Hourly labor rate ($/hr) — optional</Label>
            <Input
              type="number"
              value={wage}
              onChange={(e) => setWage(e.target.value)}
              min={0}
              step="0.01"
              placeholder="e.g. 18.00"
            />
          </Field>
          <Field>
            <Label>PF&D allowance (%) — optional</Label>
            <Input
              type="number"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              min={0}
              max={100}
              step="1"
              placeholder="e.g. 15"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Personal, fatigue &amp; delay time added to the observed time to get the standard time you actually staff
              and cost to (typically 10–20%). Leave blank for raw observed time.
            </p>
          </Field>
        </div>
      </Card>

      {/* Steps */}
      <Card className="mt-4">
        <CardTitle>Steps</CardTitle>
        <p className="mt-2 text-sm text-zinc-500">
          Add each step in the process. Toggle the timer on or off per step. Add notes to document what happens —
          great for steps you observe but don&apos;t need to time.
        </p>

        <ul className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <li
              key={step.key}
              className={clsxCard(step.timed)}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="font-mono text-xs tabular-nums text-zinc-400">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveStep(step.key, -1)}
                    disabled={i === 0}
                    className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                    aria-label={`Move step ${i + 1} up`}
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(step.key, 1)}
                    disabled={i === steps.length - 1}
                    className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                    aria-label={`Move step ${i + 1} down`}
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
                <Input
                  aria-label={`Step ${i + 1} name`}
                  value={step.name}
                  onChange={(e) => patchStep(step.key, { name: e.target.value })}
                  maxLength={80}
                  placeholder="Step name"
                  className="flex-1"
                />
                <Button plain onClick={() => removeStep(step.key)} aria-label={`Remove step ${i + 1}`}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-6 sm:pl-9">
                <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <Switch
                    checked={step.timed}
                    onChange={(v) => patchStep(step.key, { timed: v })}
                    aria-label="Time this step"
                  />
                  {step.timed ? 'Timed' : 'Documented only'}
                </label>
                {step.timed && (
                  <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <span>Pieces / cycle</span>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      value={step.piecesPerCycle}
                      onChange={(e) => patchStep(step.key, { piecesPerCycle: e.target.value })}
                      aria-label={`Pieces per cycle for step ${i + 1}`}
                      className="w-20"
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => patchStep(step.key, { notesOpen: !step.notesOpen })}
                  className="text-sm text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {step.notesOpen ? '— Hide notes' : '+ Add notes'}
                </button>
              </div>

              {step.notesOpen && (
                <div className="mt-3 pl-6 sm:pl-9">
                  <Textarea
                    aria-label={`Notes for step ${i + 1}`}
                    value={step.notes}
                    onChange={(e) => patchStep(step.key, { notes: e.target.value })}
                    rows={2}
                    placeholder="Describe what happens in this step..."
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        {steps.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500">No steps yet. Add at least one step to begin.</p>
        )}

        <div className="mt-4 flex gap-2">
          <Input
            ref={newStepRef}
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addStep()
              }
            }}
            maxLength={80}
            placeholder="Step name — press Enter or click Add"
            aria-label="New step name"
            className="flex-1"
          />
          <Button color="blue" onClick={addStep}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </Card>

      {/* Whole process timer */}
      <Card className="mt-4">
        <CardTitle>Whole process timer</CardTitle>
        <label className="mt-4 flex items-center gap-3">
          <Switch color="violet" checked={useWhole} onChange={setUseWhole} aria-label="Run a master timer" />
          <span className="text-sm text-zinc-700 dark:text-zinc-200">
            Also run a master timer for the full process
          </span>
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Runs a single stopwatch alongside your step timers. Lets you capture total process time across multiple full
          runs, separately from individual step observations.
        </p>
      </Card>

      {/* Group / process check */}
      <Card className="mt-4">
        <CardTitle>Group / process check</CardTitle>
        <label className="mt-4 flex items-center gap-3">
          <Switch
            color="amber"
            checked={isGroupCheck}
            onChange={setIsGroupCheck}
            aria-label="Mark as a group or process check"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-200">
            Label who ran each step, but keep timings out of roster profiles
          </span>
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Turn on for a quick line/cycle check with different people on different steps. You still get a per-person
          breakdown in this study — it just won&apos;t roll up into anyone&apos;s individual roster performance.
        </p>
      </Card>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button plain href="/studies" className="max-sm:justify-center">
          Cancel
        </Button>
        <Button color="blue" onClick={save} disabled={isPending} className="max-sm:justify-center">
          {isPending ? 'Saving…' : editing ? 'Save & open timer' : 'Start study'}
          <ArrowRight className="size-4" />
        </Button>
      </div>

      <p className="mt-3 text-center text-xs text-zinc-400">
        {steps.length} step{steps.length !== 1 ? 's' : ''} · {timedCount} timed ·{' '}
        {steps.length - timedCount} documented
      </p>
    </div>
  )
}

function clsxCard(timed: boolean) {
  return [
    'rounded-lg p-3 ring-1 sm:p-4',
    timed ? 'ring-zinc-950/10 dark:ring-white/10' : 'ring-zinc-950/5 dark:ring-white/5 bg-zinc-50 dark:bg-white/5',
  ].join(' ')
}
