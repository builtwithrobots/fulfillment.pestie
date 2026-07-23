/**
 * Shift Planning staffing model — pure calculation, no DB, no React.
 *
 * Given the day's order queue (FAK / RAK / UYAK) and available headcount,
 * `calculateStaffingPlan` returns the full recommended plan: worker allocation
 * per functional area, estimated completion times, an iteratively-simulated
 * flex reassignment timeline, and a completion status per kit type.
 *
 * All times are minutes from shift start (floats internally; round only for
 * display/persistence). Negative minutes are before shift start — assembly
 * pre-starts 1 hour early.
 *
 * Allocation waterfall:
 *   1. Overhead first, always: Material Handling 2 + Replenishment 2.
 *   2. FAK/RAK manual line (priority 1): exactly 5 workers when FAK or RAK
 *      orders exist — a fixed sequential crew that can never scale.
 *   3. UYAK complex (priority 2): stations + tape/scan + assembly funded as
 *      one bundle; the largest station count whose bundle fits the remaining
 *      pool wins (tape/scan and assembly-line pairing re-derived per step).
 *   4. Anything left over is unassigned flex.
 */

// ---------------------------------------------------------------------------
// Tunable constants — baseline until time-study data refines them.
// ---------------------------------------------------------------------------

/**
 * Average cycle times in seconds. 45s ⇒ 80 kits/hr per station. Eventually
 * these should come from the DB per kit type / per worker (time studies).
 */
export const CYCLE_TIME_SEC = {
  /** FAK/RAK manual line — one kit exits per cycle; the slowest of the 5 sequential stations governs. */
  fakRak: 45,
  /** UYAK personalization — per station (one worker per station, working independently). */
  uyak: 45,
  /**
   * Assembly — per assembly station. A 4-station line therefore runs at 4×
   * the station rate (320/hr at 45s), which is what makes the
   * 1-assembly-line-per-4-UYAK-stations pairing capacity-balanced and lets
   * assembly (with its 1-hour pre-start) finish ahead of UYAK and flex in.
   */
  assembly: 45,
} as const

export const SHIFT_MINUTES = 480 // 8 hours
export const PRODUCTIVE_MINUTES = 450 // 480 − 2 × 15 min paid breaks
export const MAX_HEADCOUNT = 40

export const MATERIAL_HANDLING_WORKERS = 2
export const REPLENISHMENT_WORKERS = 2
export const OVERHEAD_WORKERS = MATERIAL_HANDLING_WORKERS + REPLENISHMENT_WORKERS

export const FAK_RAK_CREW = 5 // fixed 5-station sequential line
export const UYAK_MAX_STATIONS = 8 // 4 per side of the dual conveyor
export const ASSEMBLY_LINE_SIZE = 4 // workers (stations) per assembly line
export const ASSEMBLY_PRESTART_MIN = 60 // assembly starts 1 hour before shift
export const FLEX_LEAD_MIN = 15 // surface flex moves this many minutes early

const perHourRate = (cycleSec: number) => 3600 / cycleSec

/** Whole-line output of the FAK/RAK manual line (kits/hr). */
export const FAK_RAK_LINE_RATE = perHourRate(CYCLE_TIME_SEC.fakRak)
/** Output per active UYAK station (kits/hr). */
export const UYAK_STATION_RATE = perHourRate(CYCLE_TIME_SEC.uyak)
/** Output per 4-station assembly line (kits/hr). */
export const ASSEMBLY_LINE_RATE = ASSEMBLY_LINE_SIZE * perHourRate(CYCLE_TIME_SEC.assembly)

// ---------------------------------------------------------------------------
// UYAK bundle rules
// ---------------------------------------------------------------------------

/** Tape/scan crew drawn from the producing pool: 1 for stations 1–4, 2 for 5–8. */
export function tapeScanWorkersFor(stations: number): number {
  if (stations <= 0) return 0
  return stations <= 4 ? 1 : 2
}

/** 1 assembly line (4 workers) per 4 active UYAK stations. */
export function assemblyLinesFor(stations: number): number {
  if (stations <= 0) return 0
  return stations <= 4 ? 1 : 2
}

/** Total producing heads needed to run `stations` UYAK stations (stations + tape/scan + assembly). */
export function uyakBundleWorkers(stations: number): number {
  if (stations <= 0) return 0
  return stations + tapeScanWorkersFor(stations) + assemblyLinesFor(stations) * ASSEMBLY_LINE_SIZE
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StaffingInputs = {
  availableHeadcount: number
  fakQty: number
  rakQty: number
  uyakQty: number
}

export type KitType = 'FAK' | 'RAK' | 'UYAK'
export type KitStatus = 'on_track' | 'at_risk' | 'will_not_complete'

export type OptionA =
  | { possible: true; addWorkers: number; addStations: number; totalStations: number; completionMin: number }
  | { possible: false; reason: 'fixed_line' | 'station_cap' | 'not_staffed' }

export type KitOutcome = {
  kit: KitType
  qty: number
  /** Final estimated completion (after flex), minutes from shift start. Null = cannot run at all. */
  completionMin: number | null
  status: KitStatus
  /** Minutes past shift end (480), when completion overruns it. */
  minutesOver: number | null
  /** Staffing change that would land the kit within productive time (450 min). Null when on track. */
  optionA: OptionA | null
  /** Volume achievable within productive time at current staffing. Null when on track. */
  optionB: { achievableQty: number } | null
}

export type FlexEvent = {
  kind: 'move' | 'pivot'
  /** When to act: completion − 15 min for moves; the completion moment itself for the FAK→RAK pivot. */
  triggerMin: number
  /** When the freeing area actually finishes its queue. */
  completionMin: number
  fromArea: string
  /** Heads repositioned (stations gained + tape/scan added). 5 for the pivot (crew stays on the line). */
  workers: number
  stationsAdded: number
  tapeScanAdded: number
  /** New station numbers brought online, e.g. [5, 7] renders as "stations 5–7". */
  stationRange: [number, number] | null
  /** Freed workers with nowhere productive to go (UYAK already at 8 stations, etc.). */
  unplacedWorkers: number
  /** Updated completion of the receiving work (UYAK for moves, RAK for the pivot). */
  newCompletionMin: number | null
  targetKit: KitType | null
}

export type StaffingPlan = {
  ok: boolean
  /** Blocking input errors — when non-empty, no plan sections are populated. */
  errors: string[]
  /** Non-blocking operational flags (insufficient FAK/RAK headcount, assembly pace advisory, …). */
  warnings: string[]
  headcount: {
    total: number
    overhead: number
    /** Producing workers actually assigned (FAK/RAK crew + UYAK bundle). */
    producing: number
    unassigned: number
    /** Where unassigned flex workers should position as primary backup. */
    backupArea: 'fak_rak' | 'uyak' | null
  }
  areas: {
    fakRak: {
      workers: number
      fakStartMin: number
      fakCompletionMin: number | null
      rakStartMin: number | null
      rakCompletionMin: number | null
    } | null
    uyak: {
      stations: number
      stationWorkers: number
      tapeScanWorkers: number
      /** Completion at the initial allocation, before any flex boosts. */
      initialCompletionMin: number | null
      /** Completion after all flex reassignments. */
      finalCompletionMin: number | null
    } | null
    assembly: {
      lines: number
      workers: number
      startMin: number // negative: before shift start
      completionMin: number | null
    } | null
    materialHandling: { workers: number }
    replenishment: { workers: number }
  }
  /** One entry per kit type in the queue, in FAK → RAK → UYAK order. */
  kits: KitOutcome[]
  /** Flex timeline, ordered by trigger time. */
  flex: FlexEvent[]
}

// ---------------------------------------------------------------------------
// Time helpers (pure arithmetic — shared by UI formatting and persistence)
// ---------------------------------------------------------------------------

const minutesToProduce = (qty: number, ratePerHour: number) => (qty / ratePerHour) * 60

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight. */
export function parseClockToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map((p) => Number(p))
  return h * 60 + m
}

/** Minutes since midnight (any sign) → '9:45 AM'. */
export function formatClock12(minutesSinceMidnight: number): string {
  const m = ((Math.round(minutesSinceMidnight) % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** Minutes since midnight (any sign) → '09:45' (24h, for persistence). */
export function formatClock24(minutesSinceMidnight: number): string {
  const m = ((Math.round(minutesSinceMidnight) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Duration in minutes → '1h 20m' / '45m'. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`
}

/** Human label for where a flex event sends workers, e.g. 'UYAK stations 5–7 + 1 to tape/scan'. */
export function describeFlexTarget(e: FlexEvent): string {
  if (e.kind === 'pivot') return 'RAK (same line)'
  const parts: string[] = []
  if (e.stationRange) {
    const [from, to] = e.stationRange
    parts.push(from === to ? `UYAK station ${from}` : `UYAK stations ${from}–${to}`)
  }
  if (e.tapeScanAdded > 0) parts.push(`${e.tapeScanAdded} to tape/scan`)
  return parts.join(' + ') || 'UYAK'
}

// ---------------------------------------------------------------------------
// Internal simulation helpers
// ---------------------------------------------------------------------------

/** UYAK staffing over time: station count changes as flex workers arrive. */
type Segment = { startMin: number; stations: number }

/** Kits personalized by `t` given the station timeline (production starts at minute 0). */
function producedBy(t: number, segments: Segment[], qty: number): number {
  let produced = 0
  for (let i = 0; i < segments.length; i++) {
    const start = Math.max(0, segments[i].startMin)
    const end = Math.min(t, i + 1 < segments.length ? Math.max(0, segments[i + 1].startMin) : Infinity)
    if (end > start) produced += segments[i].stations * (UYAK_STATION_RATE / 60) * (end - start)
  }
  return Math.min(qty, produced)
}

/** Minute at which cumulative production reaches `qty`, or null if it never does. */
function completionFromSegments(qty: number, segments: Segment[]): number | null {
  if (qty <= 0) return 0
  let produced = 0
  for (let i = 0; i < segments.length; i++) {
    const start = Math.max(0, segments[i].startMin)
    const end = i + 1 < segments.length ? Math.max(0, segments[i + 1].startMin) : Infinity
    const rate = segments[i].stations * (UYAK_STATION_RATE / 60) // kits per minute
    if (rate <= 0) continue
    const capacity = (end - start) * rate
    if (produced + capacity >= qty || end === Infinity) return start + (qty - produced) / rate
    produced += capacity
  }
  return null
}

function statusFor(completionMin: number | null): KitStatus {
  if (completionMin === null) return 'will_not_complete'
  if (completionMin <= PRODUCTIVE_MINUTES) return 'on_track'
  if (completionMin <= SHIFT_MINUTES) return 'at_risk'
  return 'will_not_complete'
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export function calculateStaffingPlan(inputs: StaffingInputs): StaffingPlan {
  const { availableHeadcount, fakQty, rakQty, uyakQty } = inputs

  const plan: StaffingPlan = {
    ok: true,
    errors: [],
    warnings: [],
    headcount: {
      total: availableHeadcount,
      overhead: OVERHEAD_WORKERS,
      producing: 0,
      unassigned: 0,
      backupArea: null,
    },
    areas: {
      fakRak: null,
      uyak: null,
      assembly: null,
      materialHandling: { workers: MATERIAL_HANDLING_WORKERS },
      replenishment: { workers: REPLENISHMENT_WORKERS },
    },
    kits: [],
    flex: [],
  }

  // -- Validation --------------------------------------------------------
  const qtys = [fakQty, rakQty, uyakQty]
  if (!qtys.every((q) => Number.isInteger(q) && q >= 0)) {
    plan.errors.push('Quantities must be whole numbers of zero or more.')
  }
  if (!Number.isInteger(availableHeadcount) || availableHeadcount < 1 || availableHeadcount > MAX_HEADCOUNT) {
    plan.errors.push(`Headcount must be a whole number between 1 and ${MAX_HEADCOUNT}.`)
  } else if (availableHeadcount <= OVERHEAD_WORKERS) {
    plan.errors.push('Minimum 5 workers needed after overhead allocation.')
  }
  if (qtys.every((q) => q === 0)) {
    plan.errors.push('Enter at least one kit type quantity.')
  }
  if (plan.errors.length > 0) return { ...plan, ok: false }

  // -- Step 1: producing pool (overhead locked in first) -------------------
  const producingPool = availableHeadcount - OVERHEAD_WORKERS

  // -- Step 2: FAK/RAK manual line (priority 1) ---------------------------
  const fakRakDemand = fakQty > 0 || rakQty > 0
  const fakRakStaffed = fakRakDemand && producingPool >= FAK_RAK_CREW
  let remaining = producingPool

  const fakMinutes = minutesToProduce(fakQty, FAK_RAK_LINE_RATE)
  const rakMinutes = minutesToProduce(rakQty, FAK_RAK_LINE_RATE)

  if (fakRakDemand) {
    if (fakRakStaffed) {
      remaining -= FAK_RAK_CREW
      plan.areas.fakRak = {
        workers: FAK_RAK_CREW,
        fakStartMin: 0,
        fakCompletionMin: fakQty > 0 ? fakMinutes : null,
        rakStartMin: rakQty > 0 ? fakMinutes : null,
        rakCompletionMin: rakQty > 0 ? fakMinutes + rakMinutes : null,
      }
    } else {
      plan.warnings.push(
        'Insufficient headcount to run the FAK/RAK line. Minimum 9 total workers required (4 overhead + 5 FAK/RAK).'
      )
    }
  }

  // -- Step 3: UYAK + assembly (priority 2) --------------------------------
  // Largest station count whose whole bundle (stations + tape/scan + paired
  // assembly lines) fits the remaining pool. Scanning downward re-derives
  // tape/scan and the assembly pairing at every candidate, per the spec.
  let stations = 0
  if (uyakQty > 0) {
    for (let candidate = Math.min(UYAK_MAX_STATIONS, remaining); candidate >= 1; candidate--) {
      if (uyakBundleWorkers(candidate) <= remaining) {
        stations = candidate
        break
      }
    }

    const tapeScan = tapeScanWorkersFor(stations)
    const lines = assemblyLinesFor(stations)
    const assemblyWorkers = lines * ASSEMBLY_LINE_SIZE
    remaining -= uyakBundleWorkers(stations)

    const assemblyCompletionMin =
      stations > 0 ? -ASSEMBLY_PRESTART_MIN + minutesToProduce(uyakQty, ASSEMBLY_LINE_RATE * lines) : null
    // A kit can't be personalized before it's assembled; with the paired
    // allocation assembly always leads, but the guard keeps flex honest too.
    const uyakInitialMin =
      stations > 0
        ? Math.max(minutesToProduce(uyakQty, UYAK_STATION_RATE * stations), assemblyCompletionMin ?? 0)
        : null

    plan.areas.uyak = {
      stations,
      stationWorkers: stations,
      tapeScanWorkers: tapeScan,
      initialCompletionMin: uyakInitialMin,
      finalCompletionMin: uyakInitialMin,
    }
    if (stations > 0) {
      plan.areas.assembly = {
        lines,
        workers: assemblyWorkers,
        startMin: -ASSEMBLY_PRESTART_MIN,
        completionMin: assemblyCompletionMin,
      }
      plan.warnings.push(
        'Assembly output may not keep pace with UYAK demand. Recommend starting assembly 1 hour before UYAK.'
      )
    } else if (fakRakStaffed) {
      plan.warnings.push('No remaining headcount for UYAK. Add workers or run UYAK separately.')
    } else {
      plan.warnings.push('No headcount available to staff UYAK stations.')
    }
  }

  plan.headcount.producing = (fakRakStaffed ? FAK_RAK_CREW : 0) + uyakBundleWorkers(stations)
  plan.headcount.unassigned = producingPool - (fakRakStaffed ? FAK_RAK_CREW : 0) - uyakBundleWorkers(stations)

  // -- Step 4: flex simulation ---------------------------------------------
  // Process area completions in time order; each reassignment updates the
  // UYAK station timeline, and later events see the boosted state — so a
  // second early finish triggers a second recommendation, iteratively.
  const segments: Segment[] = stations > 0 ? [{ startMin: 0, stations }] : []
  const assemblyDoneMin = plan.areas.assembly?.completionMin ?? null
  let currentStations = stations
  let currentTapeScan = tapeScanWorkersFor(stations)

  type FreeingEvent = { atMin: number; workers: number; fromArea: string }
  const freeingEvents: FreeingEvent[] = []

  if (fakRakStaffed) {
    const crewFreeAt = rakQty > 0 ? fakMinutes + rakMinutes : fakMinutes
    freeingEvents.push({ atMin: crewFreeAt, workers: FAK_RAK_CREW, fromArea: 'FAK/RAK Manual' })
  }
  if (plan.areas.assembly && assemblyDoneMin !== null) {
    freeingEvents.push({
      atMin: assemblyDoneMin,
      workers: plan.areas.assembly.workers,
      fromArea: plan.areas.assembly.lines === 1 ? 'Assembly (Line 1)' : 'Assembly (Lines 1–2)',
    })
  }
  freeingEvents.sort((a, b) => a.atMin - b.atMin)

  if (fakRakStaffed && fakQty > 0 && rakQty > 0 && fakMinutes < SHIFT_MINUTES) {
    plan.flex.push({
      kind: 'pivot',
      triggerMin: fakMinutes,
      completionMin: fakMinutes,
      fromArea: 'FAK/RAK Manual',
      workers: FAK_RAK_CREW,
      stationsAdded: 0,
      tapeScanAdded: 0,
      stationRange: null,
      unplacedWorkers: 0,
      newCompletionMin: fakMinutes + rakMinutes,
      targetKit: 'RAK',
    })
  }

  for (const event of freeingEvents) {
    if (event.atMin >= SHIFT_MINUTES) continue
    if (currentStations <= 0) continue // flex can top up a running UYAK line, not start one
    const moveAt = Math.max(0, event.atMin)
    const remainingKits = uyakQty - producedBy(moveAt, segments, uyakQty)
    if (remainingKits <= 0) continue

    // Fit the movers: push station count as high as the freed heads allow,
    // re-deriving the tape/scan requirement at the new count.
    let nextStations = currentStations
    for (let candidate = currentStations + 1; candidate <= UYAK_MAX_STATIONS; candidate++) {
      const cost = candidate - currentStations + (tapeScanWorkersFor(candidate) - currentTapeScan)
      if (cost <= event.workers) nextStations = candidate
    }
    const stationsAdded = nextStations - currentStations
    if (stationsAdded <= 0) continue
    const tapeScanAdded = tapeScanWorkersFor(nextStations) - currentTapeScan
    const used = stationsAdded + tapeScanAdded

    segments.push({ startMin: moveAt, stations: nextStations })
    const stationRange: [number, number] = [currentStations + 1, nextStations]
    currentStations = nextStations
    currentTapeScan = tapeScanWorkersFor(nextStations)

    let newCompletion = completionFromSegments(uyakQty, segments)
    if (newCompletion !== null && assemblyDoneMin !== null) newCompletion = Math.max(newCompletion, assemblyDoneMin)

    plan.flex.push({
      kind: 'move',
      triggerMin: moveAt - FLEX_LEAD_MIN,
      completionMin: event.atMin,
      fromArea: event.fromArea,
      workers: used,
      stationsAdded,
      tapeScanAdded,
      stationRange,
      unplacedWorkers: event.workers - used,
      newCompletionMin: newCompletion,
      targetKit: 'UYAK',
    })
  }

  plan.flex.sort((a, b) => a.triggerMin - b.triggerMin || a.completionMin - b.completionMin)

  let uyakFinalMin: number | null = null
  if (plan.areas.uyak && currentStations > 0) {
    uyakFinalMin = completionFromSegments(uyakQty, segments)
    if (uyakFinalMin !== null && assemblyDoneMin !== null) uyakFinalMin = Math.max(uyakFinalMin, assemblyDoneMin)
    plan.areas.uyak.finalCompletionMin = uyakFinalMin
  }

  // -- Step 5: per-kit outcomes -------------------------------------------
  const kitsPerLineWithinProductive = (PRODUCTIVE_MINUTES / 60) * FAK_RAK_LINE_RATE // 600 at baseline

  if (fakQty > 0) {
    const completion = fakRakStaffed ? fakMinutes : null
    const status = statusFor(completion)
    plan.kits.push({
      kit: 'FAK',
      qty: fakQty,
      completionMin: completion,
      status,
      minutesOver: completion !== null && completion > SHIFT_MINUTES ? completion - SHIFT_MINUTES : null,
      optionA:
        status === 'on_track'
          ? null
          : fakRakStaffed
            ? { possible: false, reason: 'fixed_line' }
            : { possible: false, reason: 'not_staffed' },
      optionB:
        status === 'on_track'
          ? null
          : { achievableQty: fakRakStaffed ? Math.min(fakQty, Math.floor(kitsPerLineWithinProductive)) : 0 },
    })
  }

  if (rakQty > 0) {
    const completion = fakRakStaffed ? fakMinutes + rakMinutes : null
    const status = statusFor(completion)
    const rakCapacity = Math.max(
      0,
      Math.floor(kitsPerLineWithinProductive - Math.min(fakQty, kitsPerLineWithinProductive))
    )
    plan.kits.push({
      kit: 'RAK',
      qty: rakQty,
      completionMin: completion,
      status,
      minutesOver: completion !== null && completion > SHIFT_MINUTES ? completion - SHIFT_MINUTES : null,
      optionA:
        status === 'on_track'
          ? null
          : fakRakStaffed
            ? { possible: false, reason: 'fixed_line' }
            : { possible: false, reason: 'not_staffed' },
      optionB: status === 'on_track' ? null : { achievableQty: fakRakStaffed ? Math.min(rakQty, rakCapacity) : 0 },
    })
  }

  if (uyakQty > 0) {
    const status = statusFor(uyakFinalMin)
    let optionA: OptionA | null = null
    if (status !== 'on_track') {
      if (stations <= 0) {
        optionA = { possible: false, reason: 'not_staffed' }
      } else {
        const kitsPerStation = (PRODUCTIVE_MINUTES / 60) * UYAK_STATION_RATE // 600 at baseline
        const stationsNeeded = Math.ceil(uyakQty / kitsPerStation)
        if (stationsNeeded > UYAK_MAX_STATIONS) {
          optionA = { possible: false, reason: 'station_cap' }
        } else {
          const linesNeeded = assemblyLinesFor(stationsNeeded)
          const completionAtNeeded = Math.max(
            minutesToProduce(uyakQty, UYAK_STATION_RATE * stationsNeeded),
            -ASSEMBLY_PRESTART_MIN + minutesToProduce(uyakQty, ASSEMBLY_LINE_RATE * linesNeeded)
          )
          optionA = {
            possible: true,
            addWorkers: uyakBundleWorkers(stationsNeeded) - uyakBundleWorkers(stations),
            addStations: stationsNeeded - stations,
            totalStations: stationsNeeded,
            completionMin: completionAtNeeded,
          }
        }
      }
    }
    plan.kits.push({
      kit: 'UYAK',
      qty: uyakQty,
      completionMin: uyakFinalMin,
      status,
      minutesOver: uyakFinalMin !== null && uyakFinalMin > SHIFT_MINUTES ? uyakFinalMin - SHIFT_MINUTES : null,
      optionA,
      optionB:
        status === 'on_track' ? null : { achievableQty: Math.floor(producedBy(PRODUCTIVE_MINUTES, segments, uyakQty)) },
    })
  }

  // -- Unassigned flex positioning ----------------------------------------
  if (plan.headcount.unassigned > 0) {
    const fakRakDone = plan.areas.fakRak?.rakCompletionMin ?? plan.areas.fakRak?.fakCompletionMin ?? null
    if (uyakFinalMin !== null && (fakRakDone === null || uyakFinalMin >= fakRakDone)) {
      plan.headcount.backupArea = 'uyak'
    } else if (fakRakDone !== null) {
      plan.headcount.backupArea = 'fak_rak'
    } else if (plan.areas.uyak) {
      plan.headcount.backupArea = 'uyak'
    }
  }

  return plan
}
