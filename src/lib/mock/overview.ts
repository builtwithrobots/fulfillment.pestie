/**
 * Mock data for the Executive Overview.
 *
 * Placeholder only — replace with Supabase queries once the schema is live.
 * Shapes intentionally mirror the tables in supabase/migrations/0001_init.sql
 * so swapping in real data is a drop-in change.
 */
import type { NumberFormat } from '@/lib/format'

export type Kpi = {
  key: string
  title: string
  value: number
  /** Serializable format descriptor (see src/lib/format.ts). */
  format: NumberFormat
  changePct: number
}

export const kpis: Kpi[] = [
  {
    key: 'headcount',
    title: 'Headcount deployed',
    value: 142,
    format: { kind: 'ratio', denominator: 150 },
    changePct: 4,
  },
  {
    key: 'efficiency',
    title: 'Overall efficiency',
    value: 96,
    format: { kind: 'percent' },
    changePct: 2,
  },
  {
    key: 'kits',
    title: 'Kits completed',
    value: 8420,
    format: { kind: 'number' },
    changePct: 6,
  },
  {
    key: 'projection',
    title: 'EOD projection',
    value: 11200,
    format: { kind: 'number' },
    changePct: -3,
  },
]

/** 7-day kit output; last entry is today. */
export const outputTrend: { day: string; kits: number }[] = [
  { day: 'Mon', kits: 9800 },
  { day: 'Tue', kits: 10250 },
  { day: 'Wed', kits: 9600 },
  { day: 'Thu', kits: 10900 },
  { day: 'Fri', kits: 11400 },
  { day: 'Sat', kits: 7300 },
  { day: 'Today', kits: 8420 },
]

export type LineRow = {
  line: string
  headcount: number
  target: number
  efficiencyPct: number
}

export const lineStatus: LineRow[] = [
  { line: 'Line 1 — FAK', headcount: 38, target: 40, efficiencyPct: 95 },
  { line: 'Line 1.5 — Overflow', headcount: 0, target: 0, efficiencyPct: 0 },
  { line: 'Line 2 — RAK', headcount: 34, target: 34, efficiencyPct: 101 },
  { line: 'Line 3 — UYAK Kitting', headcount: 40, target: 44, efficiencyPct: 88 },
  { line: 'Line 4 — UYAK Box', headcount: 30, target: 32, efficiencyPct: 92 },
]

export type Alert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  line: string
  message: string
}

export const alerts: Alert[] = [
  { id: 'a1', severity: 'critical', line: 'Line 3', message: 'Understaffed by 4 — kitting below min rate' },
  { id: 'a2', severity: 'warning', line: 'Line 1', message: '2 callouts unfilled from float pool' },
  { id: 'a3', severity: 'info', line: 'Line 2', message: 'Running 1% over target — candidate to lend headcount' },
]
