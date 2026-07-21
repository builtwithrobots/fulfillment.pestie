'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { SAMPLE_TARGET_LABEL } from '@/lib/time-study'

/** Info icon + modal: how the timer, the math, and the tool work, in plain terms. */
export function StudyHelp() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button plain onClick={() => setOpen(true)} aria-label="How the Time Study Tool works">
        <Info className="size-4" />
      </Button>
      <Dialog open={open} onClose={setOpen} size="2xl">
        <DialogTitle>How the Time Study Tool works</DialogTitle>
        <DialogBody className="space-y-5 text-sm text-zinc-600 dark:text-zinc-300">
          <section>
            <h3 className="font-semibold text-zinc-950 dark:text-white">1 · Set up</h3>
            <p className="mt-1">
              List the steps of your process in order. Mark each step <em>Timed</em> or <em>Documented</em>: timed steps
              you clock with a stopwatch, documented steps are just notes. Add an hourly wage to turn times into costs,
              set a <em>PF&amp;D allowance</em> to convert observed time into the standard time you actually staff and
              cost to, and switch on the master timer to also clock the whole process end-to-end. If a step finishes
              several pieces at once (a batch), set its <em>Pieces / cycle</em> so results report true per-piece time,
              throughput, and cost.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-zinc-950 dark:text-white">2 · Time the work</h3>
            <p className="mt-1">
              On the Timer tab, tap <em>Start</em> when a step begins and <em>Stop</em> when it ends. Every Stop saves
              one observation to the database instantly, so refreshing or switching devices never loses data. Repeat
              each step several times — the more observations, the more reliable the averages, and the Results tab tells
              you when you&apos;ve timed enough. Mis-tap or catch an abnormal cycle? Tap the <em>×</em> on that reading to
              discard it so it can&apos;t skew the numbers.
            </p>
            <p className="mt-1.5">
              Pick who you&apos;re observing in the <em>Timing</em> selector so recordings land on their roster profile.
              If different people run different steps at the same time, use the small selector on each step card (or the
              per-step list in the Cycle card) to attribute that step&apos;s timings to the right person. For a quick
              line/cycle check, turn on <em>Group / process check</em> in setup — you still see who did what in this
              study, but it won&apos;t roll up to anyone&apos;s roster profile.
            </p>
            <p className="mt-1.5">
              Timing a multi-step process as one flow? Switch to <em>Cycle</em> mode and tap through the steps in order
              — each split is saved to that step&apos;s assigned person, so you get real per-step times and per-person
              roster stats from a single continuous run. The whole pass is also saved as one full-process run, so
              completed cycles roll into the master-timer stats.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-zinc-950 dark:text-white">3 · The math</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Avg time</span> — a step&apos;s observations
                averaged together (the observed time).
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Standard time</span> — observed time × (1 +
                your PF&amp;D allowance). This is what you staff and cost to; with no allowance it equals the observed
                time.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Cycle time</span> — the step times added up:
                the time for one unit to go through every step.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Cost per unit</span> — standard time × your
                wage rate. A 30-second step at $18/hr costs 15¢ per unit before allowance.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Throughput &amp; piece economics</span> — set
                a step&apos;s <em>Pieces / cycle</em> when it finishes a batch, and results add per-piece time,
                pieces/hour, and cost per finished piece; line throughput is set by the slowest station.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Consistency (CV)</span> — a step&apos;s
                spread ÷ its average. Under 10% is steady; over 25% is erratic and worth a look (often two elements timed
                as one).
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Reliability</span> — each timed step gets a
                plain badge (Solid / Rough / Low confidence) from how steady it is and how many times it&apos;s been
                timed. Tap it for the spread, the readings so far, and how many more are suggested to trust the average (
                {SAMPLE_TARGET_LABEL}). A step that swings too much to pin down by timing is flagged to standardize the
                method first.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Bottleneck</span> — the slowest step(s).
                Speeding these up helps throughput most; everything else waits on them.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Master timer stats</span> — average,
                fastest, slowest, and standard deviation (consistency: lower = steadier) across full-process runs.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-zinc-950 dark:text-white">4 · Results</h3>
            <p className="mt-1">
              The Results tab is always live — check it mid-study or after. Copy a text summary to the clipboard, or
              export a PDF with full step details and notes. Employee attributions roll up on each person&apos;s Roster
              profile across every study they&apos;ve been timed in.
            </p>
          </section>
        </DialogBody>
        <DialogActions>
          <Button color="blue" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
