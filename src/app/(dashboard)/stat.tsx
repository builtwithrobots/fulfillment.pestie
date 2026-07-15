import { Badge } from '@/components/badge'
import { Divider } from '@/components/divider'
import { AnimatedNumber } from '@/components/motion'
import type { NumberFormat } from '@/lib/format'

/**
 * KPI tile. The value counts up on mount (via AnimatedNumber, which respects
 * reduced motion) and the week-over-week change renders as a Catalyst Badge.
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
    <div>
      <Divider />
      <div className="mt-6 text-lg/6 font-medium sm:text-sm/6">{title}</div>
      <div className="mt-3 text-3xl/8 font-semibold sm:text-2xl/8">
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="mt-3 text-sm/6 sm:text-xs/6">
        <Badge color={up ? 'lime' : 'pink'}>
          {up ? '+' : ''}
          {changePct}%
        </Badge>{' '}
        <span className="text-zinc-500">from last week</span>
      </div>
    </div>
  )
}
