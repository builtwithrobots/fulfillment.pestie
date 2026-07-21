'use client'

import { AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@/components/button'
import { analyzeStudy, type StudyAnalysis } from '@/lib/studies/analyze'

/** Short human date for the "Generated …" stamp (deterministic — safe in render). */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * On-demand "Analyze with AI" control that sits where the deterministic
 * bottleneck summary used to. A previously saved analysis is passed as
 * `initial` and shown right away (no re-run, no new call); otherwise the
 * `fallback` (the quick deterministic take) shows until the user runs it.
 * Running it streams the computed results to Claude, persists them on the
 * study, and swaps in a plain-English summary plus concrete recommendations.
 */
export function AiAnalysis({
  studyId,
  fallback,
  initial,
}: {
  studyId: string
  fallback: React.ReactNode
  initial?: StudyAnalysis | null
}) {
  const [result, setResult] = useState<StudyAnalysis | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    setError(null)
    startTransition(async () => {
      const res = await analyzeStudy(studyId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResult(res.data)
    })
  }

  if (result) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{result.summary}</p>
        <ul className="space-y-2.5">
          {result.recommendations.map((rec, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-lg bg-white/70 p-3 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-700 dark:text-violet-300">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">{rec.title}</div>
                <div className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{rec.detail}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 transition-colors hover:text-violet-900 disabled:opacity-60 dark:text-violet-300 dark:hover:text-violet-200"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {pending ? 'Analyzing…' : 'Re-run analysis'}
          </button>
          <span className="text-xs text-zinc-400">
            {result.generatedAt ? `Generated ${fmtDate(result.generatedAt)} · ` : ''}AI-generated — sanity-check
            against the numbers above.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Quick take</div>
        <div className="mt-1">{fallback}</div>
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button color="violet" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {pending ? 'Analyzing…' : error ? 'Try again' : 'Analyze with AI'}
        </Button>
        <span className="text-xs text-zinc-500">
          Sends this study&apos;s results to Claude for a plain-English read and suggested next steps.
        </span>
      </div>
    </div>
  )
}
