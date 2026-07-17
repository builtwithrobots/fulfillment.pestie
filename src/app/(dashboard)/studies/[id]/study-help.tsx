'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'

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
              List the steps of your process in order. Mark each one <em>Timed</em> (you&apos;ll clock it with a
              stopwatch) or <em>Documented</em> (notes only). Add an hourly wage to turn times into costs, and switch on
              the master timer to also clock the whole process end-to-end.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-zinc-950 dark:text-white">2 · Time the work</h3>
            <p className="mt-1">
              On the Timer tab, tap <em>Start</em> when a step begins and <em>Stop</em> when it ends. Every Stop saves
              one observation to the database instantly, so refreshing or switching devices never loses data. Repeat
              each step several times — the more observations, the more reliable the averages.
            </p>
            <p className="mt-1.5">
              Pick who you&apos;re observing in the <em>Timing</em> selector so recordings land on their roster profile.
              If different people run different steps at the same time, use the small selector on each step card to
              attribute that step&apos;s timings to the right person.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-zinc-950 dark:text-white">3 · The math</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Avg time</span> — a step&apos;s observations
                averaged together.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Avg cycle time</span> — all the step
                averages added up: the time for one unit to go through every step.
              </li>
              <li>
                <span className="font-medium text-zinc-950 dark:text-white">Cost per unit</span> — time × your wage
                rate. A 30-second step at $18/hr costs 15¢ per unit.
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
