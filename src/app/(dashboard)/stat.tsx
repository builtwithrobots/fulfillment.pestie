import { Badge } from '@/components/badge'
import { AnimatedNumber } from '@/components/motion'
import type { NumberFormat } from '@/lib/format'

/**
 * KPI card tile. Sits on a card so it floats on the dashboard surface. The
 * value counts up on mount (via AnimatedNumber, which respects reduced motion)
 * and the week-over-week change renders as a Catalyst Badge.
 */
export function Stat({
  title,
  value,
  format,
  changePct,
}: {
  title: string
  value: number
  format?: NumberFormat
  changePct: number
}) {
  const up = changePct >= 0
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="mt-2 text-2xl/8 font-semibold text-zinc-950 tabular-nums dark:text-white">
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="mt-2 text-xs/6">
        <Badge color={up ? 'lime' : 'pink'}>
          {up ? '+' : ''}
          {changePct}%
        </Badge>{' '}
        <span className="text-zinc-500">from last week</span>
      </div>
    </div>
  )
}
