/**
 * Pure SVG rendering for every floor-shape kind, shared by the interactive
 * editor and the print/PDF view. No hooks, no DB — just geometry in, SVG out.
 *
 * The root <g> applies the shape's rotation about its center, so editor
 * overlays passed as `children` (selection outline, handles) rotate with the
 * shape and pointer math can stay in the editor.
 */
import type { FloorShape } from '@/lib/floor/geometry'
import { clamp, normalizeDeg } from '@/lib/floor/geometry'

// White halo behind annotation strokes/text so they stay legible over any
// background image (and over the dark canvas).
const HALO = '#ffffff'

// Centered annotation text with the white halo. All annotation text (label
// bodies, arrow/figure captions) goes through here so the treatment stays
// consistent.
function HaloText({
  x,
  y,
  fontSize,
  fill,
  strokeWidth = 3,
  dominantBaseline,
  children,
}: {
  x: number
  y: number
  fontSize: number
  fill: string
  strokeWidth?: number
  dominantBaseline?: 'central'
  children: React.ReactNode
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline={dominantBaseline}
      fontSize={fontSize}
      fontWeight={600}
      fill={fill}
      paintOrder="stroke"
      stroke={HALO}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeOpacity={0.9}
    >
      {children}
    </text>
  )
}

export function ShapeVisual({
  shape,
  assignedNames,
  print = false,
  className,
  onPointerDown,
  children,
}: {
  shape: FloorShape
  // null => not a linked station (show planned only); [] => linked, nobody yet.
  assignedNames?: string[] | null
  /** Print variant: fixed light colors, no lock badge. */
  print?: boolean
  className?: string
  onPointerDown?: (e: React.PointerEvent) => void
  children?: React.ReactNode
}) {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const rotation = normalizeDeg(shape.rotation)

  return (
    <g
      className={className}
      onPointerDown={onPointerDown}
      transform={rotation !== 0 ? `rotate(${rotation} ${cx} ${cy})` : undefined}
    >
      {shape.kind === 'label' && <LabelVisual shape={shape} />}
      {shape.kind === 'arrow' && <ArrowVisual shape={shape} />}
      {shape.kind === 'figure' && <FigureVisual shape={shape} />}
      {(shape.kind === 'area' || shape.kind === 'station') && (
        <BoxVisual shape={shape} assignedNames={assignedNames} print={print} />
      )}

      {/* Lock badge -- a small padlock in the top-right of locked shapes */}
      {!print && shape.locked && (
        <g style={{ pointerEvents: 'none' }} transform={`translate(${shape.x + shape.w - 20}, ${shape.y + 6})`}>
          <rect width={14} height={14} rx={7} fill="#000" fillOpacity={0.45} />
          <rect x={4.5} y={6.5} width={5} height={4.5} rx={1} fill="#fff" />
          <path d="M5.2 6.5 v-1.1 a1.8 1.8 0 0 1 3.6 0 v1.1" fill="none" stroke="#fff" strokeWidth={1} />
        </g>
      )}

      {children}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Areas & stations (the original box shapes)
// ---------------------------------------------------------------------------
function BoxVisual({
  shape,
  assignedNames,
  print,
}: {
  shape: FloorShape
  assignedNames?: string[] | null
  print: boolean
}) {
  const isArea = shape.kind === 'area'
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2

  // Station name layout: how many first names fit stacked below the count line.
  const firstNames = (assignedNames ?? []).map((n) => n.split(' ')[0] || n)
  const capacity = Math.max(0, Math.floor((shape.h - 52) / 16))
  const showAll = firstNames.length <= capacity
  const shownNames = showAll ? firstNames : firstNames.slice(0, Math.max(0, capacity - 1))
  const overflow = firstNames.length - shownNames.length
  const countText =
    assignedNames == null
      ? `${shape.plannedHeadcount} planned`
      : `${assignedNames.length} / ${shape.plannedHeadcount} staffed`

  return (
    <>
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
        <text
          x={shape.x + 10}
          y={shape.y + 22}
          {...(print ? { fill: '#3f3f46' } : { className: 'fill-zinc-700 dark:fill-zinc-200' })}
          fontSize={16}
          fontWeight={600}
        >
          {shape.label}
        </text>
      ) : (
        <g style={{ pointerEvents: 'none' }}>
          <text x={cx} y={shape.y + 22} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={600}>
            {shape.label}
          </text>
          <text x={cx} y={shape.y + 40} textAnchor="middle" fill="#fff" fillOpacity={0.9} fontSize={13}>
            {countText}
          </text>
          {shownNames.map((n, i) => (
            <text
              key={i}
              x={cx}
              y={shape.y + 58 + i * 16}
              textAnchor="middle"
              fill="#fff"
              fillOpacity={0.95}
              fontSize={13}
            >
              {n}
            </text>
          ))}
          {overflow > 0 && (
            <text
              x={cx}
              y={shape.y + 58 + shownNames.length * 16}
              textAnchor="middle"
              fill="#fff"
              fillOpacity={0.7}
              fontSize={12}
            >
              +{overflow} more
            </text>
          )}
        </g>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Text label -- free-typed identification text. Font size tracks box height,
// so resizing the box resizes the text.
// ---------------------------------------------------------------------------
function LabelVisual({ shape }: { shape: FloorShape }) {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const fontSize = clamp(shape.h * 0.55, 10, 220)

  return (
    <>
      {/* Invisible hit area so the whole box is draggable, not just the glyphs. */}
      <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill="transparent" />
      <HaloText
        x={cx}
        y={cy}
        dominantBaseline="central"
        fontSize={fontSize}
        fill={shape.color}
        strokeWidth={Math.max(2, fontSize / 7)}
      >
        {shape.label || 'Label'}
      </HaloText>
    </>
  )
}

// ---------------------------------------------------------------------------
// Workflow arrow -- shaft + head spanning the box, pointing right at 0°;
// rotate the shape to point anywhere. Thickness tracks box height.
// ---------------------------------------------------------------------------
function ArrowVisual({ shape }: { shape: FloorShape }) {
  const { x, y, w, h } = shape
  const midY = y + h / 2
  const thickness = clamp(h * 0.26, 4, 48)
  const headLen = clamp(h * 0.95, 14, Math.max(14, w * 0.45))
  const shaftEnd = x + w - headLen
  const headPoints = `${x + w},${midY} ${shaftEnd},${y} ${shaftEnd},${y + h}`
  const captionSize = clamp(h * 0.3, 11, 20)

  return (
    <>
      {/* Halo underlay for legibility over busy backgrounds. */}
      <g opacity={0.85}>
        <line
          x1={x}
          y1={midY}
          x2={shaftEnd}
          y2={midY}
          stroke={HALO}
          strokeWidth={thickness + 6}
          strokeLinecap="round"
        />
        <polygon points={headPoints} fill={HALO} stroke={HALO} strokeWidth={6} strokeLinejoin="round" />
      </g>
      <line
        x1={x}
        y1={midY}
        x2={shaftEnd}
        y2={midY}
        stroke={shape.color}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      <polygon points={headPoints} fill={shape.color} />
      {/* Wide invisible stroke so thin arrows are still easy to grab. */}
      <line x1={x} y1={midY} x2={x + w} y2={midY} stroke="transparent" strokeWidth={Math.max(thickness, 20)} />
      {shape.label && (
        <HaloText x={x + w / 2} y={midY - thickness / 2 - 8} fontSize={captionSize} fill={shape.color}>
          {shape.label}
        </HaloText>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Human figure -- a filled silhouette (head, torso, arms, legs) drawn in a
// 40x80 local box and scaled to fit the shape, for marking headcount spots.
// ---------------------------------------------------------------------------
function FigureVisual({ shape }: { shape: FloorShape }) {
  const { x, y, w, h } = shape
  const s = Math.min(w / 40, h / 80)
  const gx = x + (w - 40 * s) / 2
  const gy = y + (h - 80 * s) / 2
  const halo = { paintOrder: 'stroke', stroke: HALO, strokeWidth: 3, strokeOpacity: 0.9 } as const
  const captionSize = clamp(h * 0.16, 11, 18)

  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill="transparent" />
      <g transform={`translate(${gx} ${gy}) scale(${s})`} fill={shape.color}>
        <circle cx={20} cy={9} r={8} {...halo} />
        <rect x={11} y={19} width={18} height={28} rx={7} {...halo} />
        <rect x={5.5} y={21} width={5} height={24} rx={2.5} {...halo} />
        <rect x={29.5} y={21} width={5} height={24} rx={2.5} {...halo} />
        <rect x={11.5} y={44} width={7.5} height={34} rx={3.5} {...halo} />
        <rect x={21} y={44} width={7.5} height={34} rx={3.5} {...halo} />
      </g>
      {shape.label && (
        <HaloText x={x + w / 2} y={y + h + 14} fontSize={captionSize} fill={shape.color}>
          {shape.label}
        </HaloText>
      )}
    </>
  )
}
