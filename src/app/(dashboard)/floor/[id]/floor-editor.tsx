'use client'

import { ArrowLeft, ImageUp, Square, Trash2, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { createShape, deleteShape, setActivePlan, updateShape, uploadPlanImage } from '@/lib/floor/actions'
import type { PlanDetail, StationOption } from '@/lib/floor/data'
import { clamp, type FloorShape, rollUp, snap } from '@/lib/floor/geometry'

const DEFAULT_W = 1200
const DEFAULT_H = 800
const GRID = 8
const MIN_SIZE = 40
const AREA_COLOR = '#38bdf8'
const STATION_COLOR = '#34d399'

type DragState = {
  mode: 'move' | 'resize'
  id: string
  startX: number
  startY: number
  orig: { x: number; y: number; w: number; h: number }
} | null

export function FloorEditor({
  plan,
  initialShapes,
  stations,
}: {
  plan: PlanDetail
  initialShapes: FloorShape[]
  stations: StationOption[]
}) {
  const router = useRouter()
  const [shapes, setShapes] = useState<FloorShape[]>(initialShapes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [, startTransition] = useTransition()

  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<DragState>(null)

  const W = plan.imageWidth ?? DEFAULT_W
  const H = plan.imageHeight ?? DEFAULT_H
  const selected = shapes.find((s) => s.id === selectedId) ?? null
  const totals = rollUp(shapes)

  // --- geometry helpers (all in event handlers, never render scope) ----------
  function toCanvas(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function patchLocal(id: string, patch: Partial<FloorShape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function persist(id: string, patch: Parameters<typeof updateShape>[1]) {
    startTransition(async () => {
      await updateShape(id, patch)
    })
  }

  // --- drag / resize ---------------------------------------------------------
  function beginDrag(e: React.PointerEvent, shape: FloorShape, mode: 'move' | 'resize') {
    e.stopPropagation()
    const p = toCanvas(e)
    if (!p) return
    setSelectedId(shape.id)
    dragRef.current = {
      mode,
      id: shape.id,
      startX: p.x,
      startY: p.y,
      orig: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const p = toCanvas(e)
    if (!p) return
    const dx = p.x - drag.startX
    const dy = p.y - drag.startY
    const { orig } = drag

    if (drag.mode === 'move') {
      const x = clamp(snap(orig.x + dx, GRID), 0, W - orig.w)
      const y = clamp(snap(orig.y + dy, GRID), 0, H - orig.h)
      patchLocal(drag.id, { x, y })
    } else {
      const w = clamp(snap(orig.w + dx, GRID), MIN_SIZE, W - orig.x)
      const h = clamp(snap(orig.h + dy, GRID), MIN_SIZE, H - orig.y)
      patchLocal(drag.id, { w, h })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    svgRef.current?.releasePointerCapture(e.pointerId)
    dragRef.current = null
    const s = shapes.find((sh) => sh.id === drag.id)
    if (s) persist(s.id, { x: s.x, y: s.y, w: s.w, h: s.h })
  }

  // --- toolbar actions -------------------------------------------------------
  function addShape(kind: 'area' | 'station') {
    const offset = (shapes.length % 6) * GRID * 2
    const w = kind === 'area' ? 280 : 140
    const h = kind === 'area' ? 200 : 90
    const x = clamp(snap(W / 2 - w / 2 + offset, GRID), 0, W - w)
    const y = clamp(snap(H / 2 - h / 2 + offset, GRID), 0, H - h)
    const color = kind === 'area' ? AREA_COLOR : STATION_COLOR
    const label = kind === 'area' ? 'New area' : 'New station'

    startTransition(async () => {
      const res = await createShape(plan.id, { kind, shape: 'rect', x, y, w, h, label, color })
      if (!res.ok) return
      const created: FloorShape = {
        id: res.data.id,
        kind,
        shape: 'rect',
        x,
        y,
        w,
        h,
        rotation: 0,
        label,
        color,
        stationId: null,
        plannedHeadcount: 0,
        sortOrder: shapes.length,
      }
      setShapes((prev) => [...prev, created])
      setSelectedId(created.id)
    })
  }

  function removeSelected() {
    if (!selected) return
    const id = selected.id
    setShapes((prev) => prev.filter((s) => s.id !== id))
    setSelectedId(null)
    startTransition(async () => {
      await deleteShape(id)
    })
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setUploading(true)
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      URL.revokeObjectURL(url)
      const form = new FormData()
      form.set('file', file)
      form.set('width', String(width))
      form.set('height', String(height))
      startTransition(async () => {
        await uploadPlanImage(plan.id, form)
        setUploading(false)
        router.refresh()
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setUploading(false)
    }
    img.src = url
  }

  function activate() {
    startTransition(async () => {
      await setActivePlan(plan.id)
      router.refresh()
    })
  }

  const areas = shapes.filter((s) => s.kind === 'area')
  const stationShapes = shapes.filter((s) => s.kind === 'station')

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button plain href="/floor" aria-label="Back to floor plans">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-zinc-950 dark:text-white">{plan.name}</h1>
              {plan.isActive && <Badge color="green">Active</Badge>}
            </div>
            <p className="text-sm text-zinc-500">Drag to move, drag the corner handle to resize.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!plan.isActive && (
            <Button plain onClick={activate}>
              Set active
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          <Button outline onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ImageUp className="size-4" /> {uploading ? 'Uploading…' : plan.imageUrl ? 'Replace image' : 'Upload image'}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Canvas */}
        <div>
          <div className="mb-3 flex gap-2">
            <Button color="sky" onClick={() => addShape('area')}>
              <Square className="size-4" /> Add area
            </Button>
            <Button color="emerald" onClick={() => addShape('station')}>
              <Users className="size-4" /> Add station
            </Button>
          </div>

          <div className="overflow-auto rounded-xl bg-zinc-100 ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full touch-none select-none"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerDown={() => setSelectedId(null)}
            >
              <defs>
                <pattern id="floor-grid" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-zinc-300 dark:text-zinc-600"
                  />
                </pattern>
              </defs>

              {plan.imageUrl ? (
                <image href={plan.imageUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
              ) : (
                <>
                  <rect x={0} y={0} width={W} height={H} className="fill-white dark:fill-zinc-900" />
                  <rect x={0} y={0} width={W} height={H} fill="url(#floor-grid)" />
                </>
              )}

              {/* Areas render below stations so stations stay clickable. */}
              {areas.map((s) => (
                <ShapeNode
                  key={s.id}
                  shape={s}
                  selected={s.id === selectedId}
                  onDown={(e) => beginDrag(e, s, 'move')}
                  onResize={(e) => beginDrag(e, s, 'resize')}
                />
              ))}
              {stationShapes.map((s) => (
                <ShapeNode
                  key={s.id}
                  shape={s}
                  selected={s.id === selectedId}
                  onDown={(e) => beginDrag(e, s, 'move')}
                  onResize={(e) => beginDrag(e, s, 'resize')}
                />
              ))}
            </svg>
          </div>
          {!plan.imageUrl && (
            <p className="mt-2 text-xs text-zinc-500">
              Tip: upload a floor-plan image to trace your layout over. Shapes work without one too.
            </p>
          )}
        </div>

        {/* Inspector + roll-up */}
        <div className="space-y-4">
          {selected ? (
            <ShapeInspector
              key={selected.id}
              shape={selected}
              stations={stations}
              onChange={(patch) => patchLocal(selected.id, patch)}
              onCommit={(patch) => persist(selected.id, patch)}
              onDelete={removeSelected}
            />
          ) : (
            <div className="rounded-xl bg-white p-5 text-sm text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              Select a shape to edit it, or add an area/station to get started.
            </div>
          )}

          <RollUpPanel totals={totals} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SVG shape
// ---------------------------------------------------------------------------
function ShapeNode({
  shape,
  selected,
  onDown,
  onResize,
}: {
  shape: FloorShape
  selected: boolean
  onDown: (e: React.PointerEvent) => void
  onResize: (e: React.PointerEvent) => void
}) {
  const isArea = shape.kind === 'area'
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2

  return (
    <g className="cursor-move" onPointerDown={onDown}>
      {shape.shape === 'circle' ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={shape.w / 2}
          ry={shape.h / 2}
          fill={shape.color}
          fillOpacity={isArea ? 0.12 : 0.85}
          stroke={shape.color}
          strokeWidth={2}
          strokeDasharray={isArea ? '8 6' : undefined}
        />
      ) : (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={isArea ? 10 : 8}
          fill={shape.color}
          fillOpacity={isArea ? 0.12 : 0.85}
          stroke={shape.color}
          strokeWidth={2}
          strokeDasharray={isArea ? '8 6' : undefined}
        />
      )}

      {/* Label */}
      {isArea ? (
        <text x={shape.x + 10} y={shape.y + 22} className="fill-zinc-700 dark:fill-zinc-200" fontSize={16} fontWeight={600}>
          {shape.label}
        </text>
      ) : (
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="fill-white"
          fontSize={15}
          fontWeight={600}
          style={{ pointerEvents: 'none' }}
        >
          {shape.label}
        </text>
      )}
      {!isArea && (
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          className="fill-white/90"
          fontSize={13}
          style={{ pointerEvents: 'none' }}
        >
          {shape.plannedHeadcount} planned
        </text>
      )}

      {/* Selection outline + resize handle */}
      {selected && (
        <>
          <rect
            x={shape.x - 3}
            y={shape.y - 3}
            width={shape.w + 6}
            height={shape.h + 6}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            rx={10}
          />
          <rect
            x={shape.x + shape.w - 7}
            y={shape.y + shape.h - 7}
            width={14}
            height={14}
            rx={3}
            fill="#3b82f6"
            className="cursor-nwse-resize"
            onPointerDown={onResize}
          />
        </>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function ShapeInspector({
  shape,
  stations,
  onChange,
  onCommit,
  onDelete,
}: {
  shape: FloorShape
  stations: StationOption[]
  onChange: (patch: Partial<FloorShape>) => void
  onCommit: (patch: Parameters<typeof updateShape>[1]) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          {shape.kind === 'area' ? 'Area' : 'Station'}
        </span>
        <Button plain onClick={onDelete} aria-label="Delete shape">
          <Trash2 className="size-4 text-red-500" />
        </Button>
      </div>

      <Field>
        <Label>Label</Label>
        <Input
          value={shape.label}
          maxLength={60}
          onChange={(e) => onChange({ label: e.target.value })}
          onBlur={(e) => onCommit({ label: e.target.value })}
        />
      </Field>

      <Field>
        <Label>Color</Label>
        <input
          type="color"
          value={shape.color}
          onChange={(e) => onChange({ color: e.target.value })}
          onBlur={(e) => onCommit({ color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-800"
          aria-label="Shape color"
        />
      </Field>

      {shape.kind === 'station' && (
        <>
          <Field>
            <Label>Linked station</Label>
            <Select
              value={shape.stationId ?? ''}
              onChange={(e) => {
                const stationId = e.target.value || null
                onChange({ stationId })
                onCommit({ stationId })
              }}
            >
              <option value="">— Not linked —</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lineName ? `${s.lineName} — ${s.name}` : s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>Planned headcount</Label>
            <Input
              type="number"
              min={0}
              value={String(shape.plannedHeadcount)}
              onChange={(e) => onChange({ plannedHeadcount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              onBlur={(e) =>
                onCommit({ plannedHeadcount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
              }
            />
          </Field>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Roll-up
// ---------------------------------------------------------------------------
function RollUpPanel({ totals }: { totals: ReturnType<typeof rollUp> }) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Planned labor</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-zinc-950 tabular-nums dark:text-white">
          {totals.totalHeadcount}
        </span>
        <span className="text-sm text-zinc-500">
          across {totals.totalStations} station{totals.totalStations !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {totals.perArea.map((a) => (
          <li key={a.areaId} className="flex items-center justify-between text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: a.color }} />
              <span className="truncate text-zinc-700 dark:text-zinc-200">{a.label || 'Untitled area'}</span>
            </span>
            <span className="shrink-0 text-zinc-500 tabular-nums">
              {a.headcount} · {a.stationCount} st
            </span>
          </li>
        ))}
        {totals.unassigned.stationCount > 0 && (
          <li className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Outside any area</span>
            <span className="text-zinc-500 tabular-nums">
              {totals.unassigned.headcount} · {totals.unassigned.stationCount} st
            </span>
          </li>
        )}
      </ul>
    </div>
  )
}
