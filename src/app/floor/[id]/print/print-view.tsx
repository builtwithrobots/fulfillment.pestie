'use client'

import { ArrowLeft, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/button'
import { Select } from '@/components/select'
import type { PlanDetail, StationAssignment } from '@/lib/floor/data'
import {
  assignedNamesFor,
  DEFAULT_CANVAS_H,
  DEFAULT_CANVAS_W,
  type FloorShape,
  groupAssignments,
  rollUp,
  zOrdered,
} from '@/lib/floor/geometry'
import { ShapeVisual } from '@/lib/floor/shape-visual'

/**
 * Print-optimized floor plan for the browser's native "Save as PDF". The
 * on-screen page is a faithful preview of the printed sheet; the controls bar
 * disappears when printing.
 *
 * "Fit to 8.5 × 11" scales the whole layout onto a single Letter page (the
 * default). "Actual size" prints at canvas resolution and may span pages.
 */

// Usable inches on a Letter sheet with 0.4in margins.
const PAGE_LONG = 10.2
const PAGE_SHORT = 7.7
// Vertical inches reserved for the sheet header (name + staffing summary).
const HEADER_IN = 0.6

type Orientation = 'auto' | 'portrait' | 'landscape'
type PrintScale = 'fit' | 'actual'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PrintView({
  plan,
  shapes,
  assignments,
}: {
  plan: PlanDetail
  shapes: FloorShape[]
  assignments: StationAssignment[]
}) {
  const [orientation, setOrientation] = useState<Orientation>('auto')
  const [scale, setScale] = useState<PrintScale>('fit')

  const W = plan.imageWidth ?? DEFAULT_CANVAS_W
  const H = plan.imageHeight ?? DEFAULT_CANVAS_H

  const assignmentsByStation = useMemo(() => groupAssignments(assignments), [assignments])

  const assignedCountByStation = useMemo(
    () => new Map([...assignmentsByStation].map(([sid, list]) => [sid, list.length])),
    [assignmentsByStation]
  )

  const totals = rollUp(shapes, assignedCountByStation)

  // Auto-orientation matches the layout's aspect so the fit uses the page best.
  const orient = orientation === 'auto' ? (W >= H ? 'landscape' : 'portrait') : orientation
  const contentW = orient === 'landscape' ? PAGE_LONG : PAGE_SHORT
  const contentH = (orient === 'landscape' ? PAGE_SHORT : PAGE_LONG) - HEADER_IN

  // Fit the layout inside the page content box, preserving aspect ratio.
  const aspect = W / H
  const fitW = aspect >= contentW / contentH ? contentW : contentH * aspect
  const fitH = aspect >= contentW / contentH ? contentW / aspect : contentH

  const ordered = zOrdered(shapes)

  return (
    <div className="min-h-svh bg-zinc-200 dark:bg-zinc-800 print:bg-white">
      {/* Print setup: page size/orientation + hide preview chrome on paper. */}
      <style>{`
        @page { size: letter ${orient}; margin: 0.4in; }
        @media print {
          .print-sheet { width: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Controls -- never printed */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900 print:hidden">
        <Button plain href={`/floor/${plan.id}`} aria-label="Back to editor">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <div className="text-sm font-semibold text-zinc-950 dark:text-white">{plan.name}</div>
          <div className="text-xs text-zinc-500">In the print dialog, choose “Save as PDF” as the destination.</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={scale} onChange={(e) => setScale(e.target.value as PrintScale)} aria-label="Print scale">
            <option value="fit">Fit to 8.5 × 11</option>
            <option value="actual">Actual size (may span pages)</option>
          </Select>
          <Select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation)}
            aria-label="Page orientation"
          >
            <option value="auto">Auto orientation</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
          <Button color="blue" onClick={() => window.print()}>
            <Printer className="size-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Sheet -- a faithful preview of the printed page */}
      <div
        className="print-sheet mx-auto my-6 w-fit bg-white p-[0.4in] shadow-lg"
        style={scale === 'fit' ? { width: orient === 'landscape' ? '11in' : '8.5in' } : undefined}
      >
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-semibold text-zinc-900">{plan.name}</h1>
          <p className="text-xs text-zinc-500">
            {totals.totalAssigned} / {totals.totalHeadcount} staffed · {totals.totalStations} station
            {totals.totalStations !== 1 ? 's' : ''} · Updated {formatDate(plan.updatedAt)}
          </p>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          style={scale === 'fit' ? { width: `${fitW}in`, height: `${fitH}in` } : { width: W, height: H }}
        >
          {plan.imageUrl ? (
            <image href={plan.imageUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          ) : (
            <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#d4d4d8" strokeWidth={2} />
          )}

          {ordered.map((s) => (
            <ShapeVisual key={s.id} shape={s} print assignedNames={assignedNamesFor(s, assignmentsByStation)} />
          ))}
        </svg>
      </div>
    </div>
  )
}
