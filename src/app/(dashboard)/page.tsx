import { Badge } from '@/components/badge'
import { Heading, Subheading } from '@/components/heading'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { alerts, kpis, lineStatus, outputTrend } from '@/lib/mock/overview'
import { Stat } from './stat'
import { TrendChart } from './trend-chart'

const severityColor = { critical: 'red', warning: 'amber', info: 'sky' } as const

function efficiencyColor(pct: number) {
  if (pct === 0) return 'zinc'
  if (pct >= 100) return 'lime'
  if (pct >= 90) return 'emerald'
  return 'amber'
}

export default function OverviewPage() {
  return (
    <>
      <FadeIn>
        <Heading>Executive overview</Heading>
        <p className="mt-1 text-sm text-zinc-500">Live shift snapshot · mock data pending Supabase</p>
      </FadeIn>

      {/* KPI tiles — stagger in, values count up */}
      <Stagger className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4" gap={0.08}>
        {kpis.map((k) => (
          <StaggerItem key={k.key}>
            <Stat title={k.title} value={k.value} format={k.format} changePct={k.changePct} />
          </StaggerItem>
        ))}
      </Stagger>

      {/* 7-day output trend */}
      <FadeIn delay={0.15}>
        <Subheading className="mt-14">7-day output trend</Subheading>
        <TrendChart data={outputTrend} />
      </FadeIn>

      {/* Priority alerts */}
      <FadeIn delay={0.2}>
        <Subheading className="mt-14">Priority alerts</Subheading>
        <Table className="mt-4 [--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
          <TableHead>
            <TableRow>
              <TableHeader>Severity</TableHeader>
              <TableHeader>Line</TableHeader>
              <TableHeader>Detail</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {alerts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Badge color={severityColor[a.severity]}>{a.severity}</Badge>
                </TableCell>
                <TableCell className="font-medium">{a.line}</TableCell>
                <TableCell className="text-zinc-500">{a.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </FadeIn>

      {/* Line status */}
      <FadeIn delay={0.25}>
        <Subheading className="mt-14">Line status</Subheading>
        <Table className="mt-4 [--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
          <TableHead>
            <TableRow>
              <TableHeader>Line</TableHeader>
              <TableHeader className="text-right">Headcount</TableHeader>
              <TableHeader className="text-right">Target</TableHeader>
              <TableHeader className="text-right">Efficiency</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {lineStatus.map((l) => (
              <TableRow key={l.line}>
                <TableCell className="font-medium">{l.line}</TableCell>
                <TableCell className="text-right tabular-nums">{l.headcount}</TableCell>
                <TableCell className="text-right tabular-nums text-zinc-500">{l.target}</TableCell>
                <TableCell className="text-right">
                  <Badge color={efficiencyColor(l.efficiencyPct)}>
                    {l.efficiencyPct === 0 ? 'inactive' : `${l.efficiencyPct}%`}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </FadeIn>
    </>
  )
}
