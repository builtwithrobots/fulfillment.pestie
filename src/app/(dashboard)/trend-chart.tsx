'use client'

import { motion, useReducedMotion } from 'motion/react'

import type { outputTrend } from '@/lib/mock/overview'

/**
 * Lightweight 7-day output bar chart. No charting dependency.
 *
 * Bars are sized server-side (height set via style), so they render without
 * JS. The grow-in animation is a `scaleY` transform from the bottom, which
 * layers on top of the already-correct height — progressive enhancement, and
 * it respects reduced motion. Today's bar is accented; the rest are zinc.
 */
export function TrendChart({ data }: { data: typeof outputTrend }) {
  const reduce = useReducedMotion()
  const max = Math.max(...data.map((d) => d.kits))

  return (
    <div className="mt-4">
      <div className="flex h-48 items-end gap-3" role="img" aria-label="Kit output over the last 7 days">
        {data.map((d, i) => {
          const pct = (d.kits / max) * 100
          const isToday = i === data.length - 1
          return (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="flex w-full flex-1 items-end">
                <motion.div
                  className={
                    isToday
                      ? 'w-full origin-bottom rounded-t-md bg-lime-500 dark:bg-lime-400'
                      : 'w-full origin-bottom rounded-t-md bg-zinc-200 dark:bg-zinc-700'
                  }
                  style={{ height: `${pct}%` }}
                  initial={{ scaleY: reduce ? 1 : 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : i * 0.05 }}
                  title={`${d.day}: ${d.kits.toLocaleString()} kits`}
                />
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{d.day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
