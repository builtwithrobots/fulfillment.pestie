'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { computeResults, fmtMs, RECOMMENDED_OBS_CAP, type StudyAnalysis, type StudyResults } from '@/lib/time-study'
import { getStudyWithObservations, requireUserId } from './data'

/**
 * On-demand AI read of a time study. Sends the *computed* results (times,
 * spread, cost, throughput, master-run stats) to Claude and returns a
 * plain-English summary plus a few concrete recommendations — a richer
 * alternative to the deterministic "bottleneck" line on the results screen.
 *
 * This is the only place in the app that calls an external LLM, and it costs a
 * small amount per run, so it is invoked on demand from a button (never on page
 * load). It needs ANTHROPIC_API_KEY in the environment; without it the action
 * returns a friendly message and the results screen falls back to the
 * deterministic bottleneck summary.
 */

// Best available model for this reasoning task. Not user-configurable here.
const MODEL = 'claude-opus-4-8'

const SYSTEM_PROMPT = `You are an industrial engineer reviewing a time study from a product-fulfillment warehouse for the operations lead.

Your reader is NOT technical. Write in plain, concrete language a shift lead understands. Never use jargon like "coefficient of variation", "standard deviation", or "sample size" — say "how much the times bounce around" or "how many times it was timed" instead.

Base every statement ONLY on the numbers provided. Do not invent figures or steps. If the data is thin (few readings, one run), say so plainly and make collecting more timings a recommendation.

Respond with ONLY a JSON object — no prose, no markdown code fences — in exactly this shape:
{
  "summary": "2-3 sentences: where the process stands overall — the slowest / limiting step, the cycle time and labor cost, throughput if given, and how much to trust the numbers so far.",
  "recommendations": [
    { "title": "short imperative action, about 3-6 words", "detail": "1-2 sentences naming the specific step and number, and why this helps." }
  ]
}

Give 2 to 4 recommendations, most impactful first. Favor the limiting/bottleneck step, steps whose times bounce around a lot, steps timed too few times to trust, and anything driving cost or capping throughput.`

/** Formats a money value only when a wage was entered. */
function fmtMoney(v: number, wage: number): string {
  return wage > 0 ? `$${v.toFixed(4)}` : 'n/a (no wage set)'
}

/** Compact, plain description of the computed results for the model to read. */
function buildPrompt(title: string, isGroupCheck: boolean, wage: number, r: StudyResults): string {
  const lines: string[] = []
  lines.push(`STUDY: ${title}${isGroupCheck ? ' (group / process check — not tied to one operator)' : ''}`)
  lines.push(`Wage: ${wage > 0 ? `$${wage}/hr` : 'not set'} | PF&D allowance: ${r.allowancePct}%`)

  if (r.totalMs > 0) {
    lines.push(
      `Cycle time (all timed steps): observed ${fmtMs(r.totalMs)}` +
        (r.allowancePct > 0 ? `, standard ${fmtMs(r.totalStdMs)} (after allowance)` : '')
    )
    lines.push(`Labor cost per unit: ${fmtMoney(r.totalCost, wage)}`)
  }
  if (r.hasPieceCounts) {
    lines.push(`Cost per finished piece: ${fmtMoney(r.costPerPiece, wage)}`)
    lines.push(
      `Line throughput: ${Math.round(r.throughputPerHour).toLocaleString('en-US')} pieces/hr` +
        (r.throughputBottleneck ? ` — capped by "${r.throughputBottleneck.name}"` : '')
    )
  }

  const timed = r.steps.filter((s) => s.timed && s.obsCount > 0)
  if (timed.length > 0) {
    lines.push('')
    lines.push('TIMED STEPS:')
    for (const s of timed) {
      const flags: string[] = []
      if (s.isBottleneck) flags.push('SLOWEST STEP')
      if (r.throughputBottleneck?.id === s.id && r.hasPieceCounts) flags.push('CAPS THROUGHPUT')
      if (s.piecesPerCycle > 1) flags.push(`${s.piecesPerCycle} pieces/cycle`)
      const trust =
        s.obsCount < 2
          ? 'only 1 reading'
          : s.cvPct > 25
            ? `times bounce a lot (~${s.cvPct.toFixed(0)}% swing)`
            : s.cvPct > 10
              ? `times bounce some (~${s.cvPct.toFixed(0)}% swing)`
              : 'times are steady'
      const enough =
        s.enoughObs || s.recommendedObs == null
          ? 'enough readings'
          : s.recommendedObs > RECOMMENDED_OBS_CAP
            ? `timed ${s.obsCount}×, too variable to pin down by timing — needs method standardization`
            : `timed ${s.obsCount}×, ~${Math.max(1, s.recommendedObs - s.obsCount)} more recommended`
      lines.push(
        `- ${s.name}: avg ${fmtMs(s.avgMs)}, ${s.pctOfTotal.toFixed(0)}% of cycle, cost/unit ${fmtMoney(
          s.costPerUnit,
          wage
        )} — ${trust}, ${enough}${flags.length ? ` [${flags.join(', ')}]` : ''}`
      )
    }
  }

  const documented = r.steps.filter((s) => !s.timed)
  if (documented.length > 0) {
    lines.push('')
    lines.push(`DOCUMENTED (not timed) STEPS: ${documented.map((s) => s.name).join(', ')}`)
  }

  const noObs = r.steps.filter((s) => s.timed && s.obsCount === 0)
  if (noObs.length > 0) {
    lines.push(`TIMED STEPS WITH NO READINGS YET: ${noObs.map((s) => s.name).join(', ')}`)
  }

  if (r.master) {
    lines.push('')
    lines.push(
      `MASTER FULL-PROCESS RUNS: ${r.master.runs.length} run(s), avg ${fmtMs(r.master.avgMs)}, ` +
        `fastest ${fmtMs(r.master.minMs)}, slowest ${fmtMs(r.master.maxMs)}` +
        (r.master.runs.length >= 2 ? `, times swing ~${r.master.cvPct.toFixed(0)}%` : '')
    )
  }

  lines.push('')
  lines.push('Give the operations lead a short read on this study and what to do next.')
  return lines.join('\n')
}

/** Pull the plain-text answer out of the model's content blocks. */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/** Defensively parse the model's JSON (tolerates stray fences / prose). */
function parseAnalysis(text: string): StudyAnalysis | null {
  if (!text) return null
  let t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) t = fenced[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  let obj: unknown
  try {
    obj = JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null

  const rec = obj as { summary?: unknown; recommendations?: unknown }
  if (typeof rec.summary !== 'string' || !rec.summary.trim()) return null

  const list = Array.isArray(rec.recommendations) ? rec.recommendations : []
  const recommendations = list
    .filter(
      (r): r is { title: string; detail: string } =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as { title?: unknown }).title === 'string' &&
        typeof (r as { detail?: unknown }).detail === 'string'
    )
    .map((r) => ({ title: r.title.trim(), detail: r.detail.trim() }))
    .filter((r) => r.title && r.detail)
    .slice(0, 4)

  if (recommendations.length === 0) return null
  return { summary: rec.summary.trim(), recommendations }
}

export async function analyzeStudy(studyId: string): Promise<ActionResult<StudyAnalysis>> {
  await requireUserId()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: "AI analysis isn't set up yet — add an ANTHROPIC_API_KEY to the project environment to turn it on.",
    }
  }

  const data = await getStudyWithObservations(studyId)
  if (!data) return { ok: false, error: 'Study not found.' }

  const { study, steps, masterRuns } = data
  const r = computeResults(steps, study.wageRate, masterRuns, study.allowancePct)

  const hasTimed = r.steps.some((s) => s.timed && s.obsCount > 0)
  if (!hasTimed && !r.master) {
    return { ok: false, error: 'Record some step timings or a full run first — there is nothing to analyze yet.' }
  }

  const client = new Anthropic({ apiKey })
  try {
    // Stream server-side and await the final message: streaming avoids
    // request-timeout limits while thinking runs; the client just awaits the
    // resolved action (it never sees the token stream).
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(study.title, study.isGroupCheck, study.wageRate, r) }],
    })
    const final = await stream.finalMessage()
    const parsed = parseAnalysis(extractText(final.content))
    if (!parsed) return { ok: false, error: 'The AI response could not be read. Please try again.' }

    // Persist the analysis on the study so it survives a refresh, renders on the
    // results screen without re-running, and prints in the PDF export.
    const analysis: StudyAnalysis = { ...parsed, generatedAt: new Date().toISOString() }
    const supabase = createServiceRoleClient()
    const { error: saveError } = await supabase.from('studies').update({ ai_analysis: analysis }).eq('id', studyId)
    if (saveError) return { ok: false, error: saveError.message }

    revalidatePath(`/studies/${studyId}/results`)
    revalidatePath(`/studies/${studyId}/results/print`)
    return { ok: true, data: analysis }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { ok: false, error: `Analysis failed: ${msg}` }
  }
}
