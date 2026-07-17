'use client'

import {
  ArrowLeft,
  Check,
  Copy,
  ImageUp,
  Lock,
  LockOpen,
  Minus,
  MoveRight,
  PersonStanding,
  Plus,
  Printer,
  RotateCw,
  Square,
  Trash2,
  Type,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Combobox, ComboboxLabel, ComboboxOption } from '@/components/combobox'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import {
  assignWorker,
  createShape,
  createWorker,
  deleteShape,
  refreshAssignments,
  renamePlan,
  setActivePlan,
  unassignWorker,
  updateShape,
  uploadPlanImage,
} from '@/lib/floor/actions'
import type { PlanDetail, StationAssignment, StationOption, Worker } from '@/lib/floor/data'
import {
  assignedNamesFor,
  clamp,
  DEFAULT_CANVAS_H,
  DEFAULT_CANVAS_W,
  type FloorShape,
  groupAssignments,
  isAnnotation,
  normalizeDeg,
  rollUp,
  snap,
  zOrdered,
} from '@/lib/floor/geometry'
import { ShapeVisual } from '@/lib/floor/shape-visual'
import { useSupabaseBrowserClient } from '@/lib/supabase/client'
import type { FloorShapeKind } from '@/lib/supabase/types'

// Large virtual canvas so there's plenty of room to spread areas/stations out.
// The canvas renders at least MIN_CANVAS_PX wide and scrolls inside a tall
// viewport, so it's genuinely bigger both ways regardless of screen size.
const MIN_CANVAS_PX = 2000
const GRID = 8
const MIN_SIZE = 40
// Annotations (labels/arrows/figures) can shrink further than areas/stations.
const MIN_ANNOTATION_SIZE = 24
const AREA_COLOR = '#38bdf8'
const STATION_COLOR = '#34d399'

// Per-kind defaults for newly added shapes.
const SHAPE_DEFAULTS: Record<FloorShapeKind, { w: number; h: number; color: string; label: string }> = {
  area: { w: 280, h: 200, color: AREA_COLOR, label: 'New area' },
  station: { w: 140, h: 90, color: STATION_COLOR, label: 'New station' },
  label: { w: 220, h: 48, color: '#1e293b', label: 'Label' },
  arrow: { w: 240, h: 56, color: '#f59e0b', label: '' },
  figure: { w: 44, h: 88, color: '#6366f1', label: '' },
}

// Inspector copy per kind: the panel title and what the label field means.
const KIND_COPY: Record<FloorShapeKind, { title: string; labelField: string }> = {
  area: { title: 'Area', labelField: 'Label' },
  station: { title: 'Station', labelField: 'Label' },
  label: { title: 'Text label', labelField: 'Text' },
  arrow: { title: 'Arrow', labelField: 'Caption (optional)' },
  figure: { title: 'Person', labelField: 'Caption (optional)' },
}

// Zoom bounds for the +/- canvas-size control.
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.5
const ZOOM_STEP = 1.2

type DragState = {
  mode: 'move' | 'resize' | 'rotate'
  id: string
  startX: number
  startY: number
  orig: { x: number; y: number; w: number; h: number; rotation: number }
  minSize: number
} | null

export function FloorEditor({
  plan,
  initialShapes,
  stations,
  initialWorkers,
  initialAssignments,
}: {
  plan: PlanDetail
  initialShapes: FloorShape[]
  stations: StationOption[]
  initialWorkers: Worker[]
  initialAssignments: StationAssignment[]
}) {
  const router = useRouter()
  const supabase = useSupabaseBrowserClient()
  const [shapes, setShapes] = useState<FloorShape[]>(initialShapes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers)
  const [assignments, setAssignments] = useState<StationAssignment[]>(initialAssignments)
  const [zoom, setZoom] = useState(1)
  const [, startTransition] = useTransition()

  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<DragState>(null)

  const W = plan.imageWidth ?? DEFAULT_CANVAS_W
  const H = plan.imageHeight ?? DEFAULT_CANVAS_H
  const selected = shapes.find((s) => s.id === selectedId) ?? null

  // Assignments grouped by real station id, for canvas names + the inspector.
  const assignmentsByStation = useMemo(() => groupAssignments(assignments), [assignments])

  const assignedCountByStation = useMemo(
    () => new Map([...assignmentsByStation].map(([sid, list]) => [sid, list.length])),
    [assignmentsByStation]
  )

  const totals = rollUp(shapes, assignedCountByStation)

  // Live updates: refetch assignments whenever another client changes them.
  // Best-effort — falls back to optimistic local updates when Realtime is
  // unavailable (e.g. dev with auth off).
  useEffect(() => {
    const channel = supabase
      .channel('floor-assignments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_assignments' }, () => {
        startTransition(async () => {
          setAssignments(await refreshAssignments())
        })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase])

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

  // --- drag / resize / rotate ------------------------------------------------
  function beginDrag(e: React.PointerEvent, shape: FloorShape, mode: 'move' | 'resize' | 'rotate') {
    e.stopPropagation()
    // Locked shapes can be selected (to unlock) but never moved/resized/rotated.
    if (shape.locked) {
      setSelectedId(shape.id)
      return
    }
    const p = toCanvas(e)
    if (!p) return
    setSelectedId(shape.id)
    dragRef.current = {
      mode,
      id: shape.id,
      startX: p.x,
      startY: p.y,
      orig: { x: shape.x, y: shape.y, w: shape.w, h: shape.h, rotation: shape.rotation },
      minSize: isAnnotation(shape.kind) ? MIN_ANNOTATION_SIZE : MIN_SIZE,
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
    } else if (drag.mode === 'rotate') {
      // Delta-based: how far the pointer swung around the center since the
      // grab, added to the starting rotation. No jump on grab, and it works
      // wherever the handle is (it flips below shapes near the canvas top).
      // Snapped to 5° for tidy diagrams.
      const ccx = orig.x + orig.w / 2
      const ccy = orig.y + orig.h / 2
      const swung = Math.atan2(p.y - ccy, p.x - ccx) - Math.atan2(drag.startY - ccy, drag.startX - ccx)
      patchLocal(drag.id, { rotation: normalizeDeg(snap(orig.rotation + (swung * 180) / Math.PI, 5)) })
    } else {
      // The resize handle lives inside the rotated group, so convert the screen
      // delta into the shape's local (unrotated) frame before applying it.
      let dxl = dx
      let dyl = dy
      if (orig.rotation) {
        const rad = (orig.rotation * Math.PI) / 180
        dxl = dx * Math.cos(rad) + dy * Math.sin(rad)
        dyl = -dx * Math.sin(rad) + dy * Math.cos(rad)
      }
      const w = clamp(snap(orig.w + dxl, GRID), drag.minSize, W - orig.x)
      const h = clamp(snap(orig.h + dyl, GRID), drag.minSize, H - orig.y)
      patchLocal(drag.id, { w, h })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    svgRef.current?.releasePointerCapture(e.pointerId)
    dragRef.current = null
    const s = shapes.find((sh) => sh.id === drag.id)
    if (s) persist(s.id, { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation })
  }

  // --- toolbar actions -------------------------------------------------------
  function addShape(kind: FloorShapeKind) {
    const offset = (shapes.length % 6) * GRID * 2
    const { w, h, color, label } = SHAPE_DEFAULTS[kind]
    const x = clamp(snap(W / 2 - w / 2 + offset, GRID), 0, W - w)
    const y = clamp(snap(H / 2 - h / 2 + offset, GRID), 0, H - h)

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
        locked: false,
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

  function duplicateSelected() {
    if (!selected) return
    const src = selected
    const x = clamp(snap(src.x + GRID * 2, GRID), 0, W - src.w)
    const y = clamp(snap(src.y + GRID * 2, GRID), 0, H - src.h)
    startTransition(async () => {
      // Copy geometry/label/color/headcount, but not the station link, so the
      // copy doesn't double-link (and double-count) the same station.
      const res = await createShape(plan.id, {
        kind: src.kind,
        shape: src.shape,
        x,
        y,
        w: src.w,
        h: src.h,
        rotation: src.rotation,
        label: src.label,
        color: src.color,
        plannedHeadcount: src.plannedHeadcount,
      })
      if (!res.ok) return
      const copy: FloorShape = {
        ...src,
        id: res.data.id,
        x,
        y,
        stationId: null,
        sortOrder: shapes.length,
        locked: false, // new shapes start unlocked (matches the DB default)
      }
      setShapes((prev) => [...prev, copy])
      setSelectedId(copy.id)
    })
  }

  // --- assignments -----------------------------------------------------------
  function doAssign(stationId: string, worker: Worker) {
    // Optimistic: one station per worker, so move them off any other station.
    setAssignments((prev) => [
      ...prev.filter((a) => a.workerId !== worker.id),
      { assignmentId: `tmp-${worker.id}`, stationId, workerId: worker.id, fullName: worker.fullName },
    ])
    startTransition(async () => {
      await assignWorker(stationId, worker.id)
      setAssignments(await refreshAssignments())
    })
  }

  function doUnassign(workerId: string) {
    setAssignments((prev) => prev.filter((a) => a.workerId !== workerId))
    startTransition(async () => {
      await unassignWorker(workerId)
      setAssignments(await refreshAssignments())
    })
  }

  function doCreateAndAssign(stationId: string, fullName: string) {
    startTransition(async () => {
      const res = await createWorker(fullName)
      if (!res.ok) return
      setWorkers((prev) => [...prev, { id: res.data.id, fullName: res.data.fullName }])
      await assignWorker(stationId, res.data.id)
      setAssignments(await refreshAssignments())
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

  const ordered = zOrdered(shapes)

  return (
    <div className="mx-auto max-w-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button plain href="/floor" aria-label="Back to floor plans">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <PlanTitle planId={plan.id} initialName={plan.name} />
              {plan.isActive && <Badge color="green">Active</Badge>}
            </div>
            <p className="text-sm text-zinc-500">
              Drag to move, drag the corner to resize, drag the top handle to rotate, lock to pin in place.
            </p>
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
          <Button outline href={`/floor/${plan.id}/print`} target="_blank">
            <Printer className="size-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Canvas */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button color="sky" onClick={() => addShape('area')}>
                <Square className="size-4" /> Add area
              </Button>
              <Button color="emerald" onClick={() => addShape('station')}>
                <Users className="size-4" /> Add station
              </Button>
              <Button outline onClick={() => addShape('label')} title="Add a text label">
                <Type className="size-4" /> Label
              </Button>
              <Button outline onClick={() => addShape('arrow')} title="Add a workflow arrow">
                <MoveRight className="size-4" /> Arrow
              </Button>
              <Button outline onClick={() => addShape('figure')} title="Add a person silhouette">
                <PersonStanding className="size-4" /> Person
              </Button>
            </div>
            {/* Grid size / zoom -- purely visual, for easier viewing on any device. */}
            <div className="flex items-center gap-1">
              <Button
                plain
                onClick={() => setZoom((z) => clamp(z / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX))}
                aria-label="Decrease grid size"
              >
                <Minus className="size-4" />
              </Button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="w-12 text-center text-xs text-zinc-500 tabular-nums hover:text-zinc-800 dark:hover:text-zinc-200"
                aria-label="Reset grid size"
                title="Reset grid size"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                plain
                onClick={() => setZoom((z) => clamp(z * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX))}
                aria-label="Increase grid size"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-[calc(100svh-11rem)] overflow-auto rounded-xl bg-zinc-100 ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto touch-none select-none"
              style={{ width: Math.round(MIN_CANVAS_PX * zoom) }}
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

              {/* zOrdered: areas under stations (so stations stay clickable),
                  annotations on top so arrows/labels overlay both. */}
              {ordered.map((s) => (
                <ShapeNode
                  key={s.id}
                  shape={s}
                  selected={s.id === selectedId}
                  assignedNames={assignedNamesFor(s, assignmentsByStation)}
                  onBegin={(e, mode) => beginDrag(e, s, mode)}
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
              workers={workers}
              assigned={selected.stationId ? (assignmentsByStation.get(selected.stationId) ?? []) : []}
              onChange={(patch) => patchLocal(selected.id, patch)}
              onCommit={(patch) => persist(selected.id, patch)}
              onDelete={removeSelected}
              onDuplicate={() => duplicateSelected()}
              onAssign={(worker) => selected.stationId && doAssign(selected.stationId, worker)}
              onCreateAndAssign={(name) => selected.stationId && doCreateAndAssign(selected.stationId, name)}
              onUnassign={doUnassign}
            />
          ) : (
            <div className="rounded-xl bg-white p-5 text-sm text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
              Select a shape to edit it, or add an area, station, label, arrow, or person to get started.
            </div>
          )}

          <RollUpPanel totals={totals} onSelectArea={setSelectedId} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable plan title -- locked by default; click the lock to rename.
// ---------------------------------------------------------------------------
function PlanTitle({ planId, initialName }: { planId: string; initialName: string }) {
  const [name, setName] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialName)
  const [error, setError] = useState(false)
  const [isPending, startTransition] = useTransition()

  function begin() {
    setValue(name)
    setError(false)
    setEditing(true)
  }

  function save() {
    const clean = value.trim()
    if (!clean) return
    if (clean === name) return setEditing(false)
    startTransition(async () => {
      const res = await renamePlan(planId, clean)
      if (res.ok) {
        setName(clean)
        setEditing(false)
      } else {
        setError(true)
      }
    })
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          maxLength={80}
          disabled={isPending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          aria-label="Plan name"
          className="w-56 sm:w-72"
        />
        <Button plain onClick={save} disabled={isPending} aria-label="Save name">
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
        </Button>
        <Button plain onClick={() => setEditing(false)} disabled={isPending} aria-label="Cancel rename">
          <X className="size-4" />
        </Button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">Couldn’t rename.</span>}
      </span>
    )
  }

  return (
    <span className="group flex items-center gap-1">
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-white">{name}</h1>
      <button
        type="button"
        onClick={begin}
        title="Unlock to rename"
        aria-label="Unlock to rename plan"
        className="rounded p-1 text-zinc-400 opacity-60 transition group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <Lock className="size-4" />
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------------
// SVG shape -- shared visuals (ShapeVisual) plus editor-only overlays. The
// overlays render inside ShapeVisual's rotated group so they track rotation.
// ---------------------------------------------------------------------------
function ShapeNode({
  shape,
  selected,
  assignedNames,
  onBegin,
}: {
  shape: FloorShape
  selected: boolean
  // null => not a linked station (show planned only); [] => linked, nobody yet.
  assignedNames?: string[] | null
  onBegin: (e: React.PointerEvent, mode: 'move' | 'resize' | 'rotate') => void
}) {
  const cx = shape.x + shape.w / 2
  const rotatable = isAnnotation(shape.kind)
  // Rotate handle flips below the shape near the canvas top so it never clips
  // out of reach (rotation is delta-based, so the grab point doesn't matter).
  const flip = shape.y < 44
  const stemStart = flip ? shape.y + shape.h + 3 : shape.y - 3
  const stemEnd = flip ? shape.y + shape.h + 22 : shape.y - 22
  const knobY = flip ? shape.y + shape.h + 30 : shape.y - 30

  return (
    <ShapeVisual
      shape={shape}
      assignedNames={assignedNames}
      className={shape.locked ? 'cursor-default' : 'cursor-move'}
      onPointerDown={(e) => onBegin(e, 'move')}
    >
      {/* Selection outline (always when selected) */}
      {selected && (
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
      )}
      {/* Resize handle -- only when selected AND unlocked */}
      {selected && !shape.locked && (
        <rect
          x={shape.x + shape.w - 7}
          y={shape.y + shape.h - 7}
          width={14}
          height={14}
          rx={3}
          fill="#3b82f6"
          className="cursor-nwse-resize"
          onPointerDown={(e) => onBegin(e, 'resize')}
        />
      )}
      {/* Rotate handle -- annotations only, a stemmed knob off the top edge */}
      {selected && !shape.locked && rotatable && (
        <g className="cursor-grab" onPointerDown={(e) => onBegin(e, 'rotate')}>
          <line x1={cx} y1={stemStart} x2={cx} y2={stemEnd} stroke="#3b82f6" strokeWidth={2} />
          <circle cx={cx} cy={knobY} r={8} fill="#3b82f6" />
          <circle cx={cx} cy={knobY} r={3} fill="#fff" />
        </g>
      )}
    </ShapeVisual>
  )
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function ShapeInspector({
  shape,
  stations,
  workers,
  assigned,
  onChange,
  onCommit,
  onDelete,
  onDuplicate,
  onAssign,
  onCreateAndAssign,
  onUnassign,
}: {
  shape: FloorShape
  stations: StationOption[]
  workers: Worker[]
  assigned: StationAssignment[]
  onChange: (patch: Partial<FloorShape>) => void
  onCommit: (patch: Parameters<typeof updateShape>[1]) => void
  onDelete: () => void
  onDuplicate: () => void
  onAssign: (worker: Worker) => void
  onCreateAndAssign: (fullName: string) => void
  onUnassign: (workerId: string) => void
}) {
  const rotatable = isAnnotation(shape.kind)

  return (
    <div className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          {KIND_COPY[shape.kind].title}
        </span>
        <div className="flex items-center gap-1">
          <Button
            plain
            onClick={() => {
              onChange({ locked: !shape.locked })
              onCommit({ locked: !shape.locked })
            }}
            aria-label={shape.locked ? 'Unlock shape' : 'Lock shape'}
            title={shape.locked ? 'Unlock (allow move/resize)' : 'Lock in place'}
          >
            {shape.locked ? (
              <Lock className="size-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <LockOpen className="size-4" />
            )}
          </Button>
          <Button plain onClick={onDuplicate} aria-label="Duplicate shape">
            <Copy className="size-4" />
          </Button>
          <Button plain onClick={onDelete} aria-label="Delete shape">
            <Trash2 className="size-4 text-red-500" />
          </Button>
        </div>
      </div>
      {shape.locked && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
          <Lock className="size-3.5" /> Locked -- unlock to move or resize.
        </p>
      )}

      <Field>
        <Label>{KIND_COPY[shape.kind].labelField}</Label>
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

      {!rotatable && (
        <Field>
          <Label>Shape</Label>
          <div className="flex gap-2">
            {(['rect', 'circle'] as const).map((g) => (
              <Button
                key={g}
                {...(shape.shape === g ? { color: 'blue' as const } : { outline: true })}
                onClick={() => {
                  onChange({ shape: g })
                  onCommit({ shape: g })
                }}
                className="flex-1 justify-center"
              >
                {g === 'rect' ? 'Rectangle' : 'Circle'}
              </Button>
            ))}
          </div>
        </Field>
      )}

      {rotatable && (
        <Field>
          <Label>Rotation (°)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={359}
              value={String(Math.round(shape.rotation))}
              onChange={(e) => onChange({ rotation: normalizeDeg(Math.round(Number(e.target.value) || 0)) })}
              onBlur={(e) => onCommit({ rotation: normalizeDeg(Math.round(Number(e.target.value) || 0)) })}
              className="flex-1"
            />
            <Button
              plain
              onClick={() => {
                const rotation = normalizeDeg(Math.round(shape.rotation / 90) * 90 + 90)
                onChange({ rotation })
                onCommit({ rotation })
              }}
              aria-label="Rotate 90 degrees"
              title="Rotate 90°"
            >
              <RotateCw className="size-4" />
            </Button>
          </div>
        </Field>
      )}

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
              onBlur={(e) => onCommit({ plannedHeadcount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </Field>

          <AssignmentPanel
            linked={!!shape.stationId}
            planned={shape.plannedHeadcount}
            assigned={assigned}
            workers={workers}
            onAssign={onAssign}
            onCreateAndAssign={onCreateAndAssign}
            onUnassign={onUnassign}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Assignment panel (linked stations only)
// ---------------------------------------------------------------------------
function AssignmentPanel({
  linked,
  planned,
  assigned,
  workers,
  onAssign,
  onCreateAndAssign,
  onUnassign,
}: {
  linked: boolean
  planned: number
  assigned: StationAssignment[]
  workers: Worker[]
  onAssign: (worker: Worker) => void
  onCreateAndAssign: (fullName: string) => void
  onUnassign: (workerId: string) => void
}) {
  const [newName, setNewName] = useState('')

  if (!linked) {
    return (
      <div className="rounded-lg bg-zinc-50 px-3 py-3 text-xs text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
        Link this shape to a station above to assign people to it.
      </div>
    )
  }

  const assignedIds = new Set(assigned.map((a) => a.workerId))
  const available = workers.filter((w) => !assignedIds.has(w.id))
  const over = assigned.length > planned

  return (
    <div className="border-t border-zinc-950/5 pt-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">People</span>
        <span
          className={
            over
              ? 'text-xs font-medium text-amber-600 tabular-nums dark:text-amber-400'
              : 'text-xs text-zinc-500 tabular-nums'
          }
        >
          {assigned.length} / {planned} staffed
        </span>
      </div>

      {assigned.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {assigned.map((a) => (
            <li
              key={a.assignmentId}
              className="flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pr-1 pl-3 text-sm text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
            >
              <span className="max-w-40 truncate">{a.fullName}</span>
              <button
                type="button"
                onClick={() => onUnassign(a.workerId)}
                aria-label={`Remove ${a.fullName}`}
                className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Combobox
          options={available}
          value={null}
          displayValue={(w) => w?.fullName}
          onChange={(w) => w && onAssign(w)}
          placeholder="Assign someone from the roster…"
          aria-label="Assign a worker"
        >
          {(w) => (
            <ComboboxOption value={w}>
              <ComboboxLabel>{w.fullName}</ComboboxLabel>
            </ComboboxOption>
          )}
        </Combobox>
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              e.preventDefault()
              onCreateAndAssign(newName.trim())
              setNewName('')
            }
          }}
          maxLength={80}
          placeholder="New person's name"
          aria-label="Add a new worker and assign"
          className="flex-1"
        />
        <Button
          plain
          onClick={() => {
            if (newName.trim()) {
              onCreateAndAssign(newName.trim())
              setNewName('')
            }
          }}
          aria-label="Add and assign"
        >
          <UserPlus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Roll-up
// ---------------------------------------------------------------------------
// Green when fully/over staffed, amber when short, zinc when nothing planned.
function coverageClass(assigned: number, planned: number): string {
  if (planned === 0) return 'text-zinc-500'
  if (assigned >= planned) return 'text-emerald-600 dark:text-emerald-400'
  return 'text-amber-600 dark:text-amber-400'
}

function RollUpPanel({
  totals,
  onSelectArea,
}: {
  totals: ReturnType<typeof rollUp>
  onSelectArea: (areaId: string) => void
}) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Labor coverage</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-3xl font-semibold tabular-nums ${coverageClass(totals.totalAssigned, totals.totalHeadcount)}`}
        >
          {totals.totalAssigned} / {totals.totalHeadcount}
        </span>
        <span className="text-sm text-zinc-500">
          staffed across {totals.totalStations} station{totals.totalStations !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="mt-4 space-y-1">
        {totals.perArea.map((a) => (
          <li key={a.areaId}>
            <button
              type="button"
              onClick={() => onSelectArea(a.areaId)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: a.color }} />
                <span className="truncate text-zinc-700 dark:text-zinc-200">{a.label || 'Untitled area'}</span>
              </span>
              <span className={`shrink-0 tabular-nums ${coverageClass(a.assigned, a.headcount)}`}>
                {a.assigned} / {a.headcount}
              </span>
            </button>
          </li>
        ))}
        {totals.unassigned.stationCount > 0 && (
          <li className="flex items-center justify-between px-2 py-1 text-sm">
            <span className="text-zinc-500">Outside any area</span>
            <span className={`tabular-nums ${coverageClass(totals.unassigned.assigned, totals.unassigned.headcount)}`}>
              {totals.unassigned.assigned} / {totals.unassigned.headcount}
            </span>
          </li>
        )}
      </ul>
    </div>
  )
}
