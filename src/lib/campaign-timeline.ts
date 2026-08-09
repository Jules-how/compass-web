export type TimelineZoom = 'year' | 'quarter' | 'month' | 'week'

export const ZOOM_OPTIONS: { id: TimelineZoom; label: string; shortcut: string }[] = [
  { id: 'year', label: 'Year', shortcut: 'Y' },
  { id: 'quarter', label: 'Quarter', shortcut: 'Q' },
  { id: 'month', label: 'Month', shortcut: 'M' },
  { id: 'week', label: 'Week', shortcut: 'W' }
]

export const ZOOM_LEVELS: TimelineZoom[] = ZOOM_OPTIONS.map((option) => option.id)

/** Move one step toward week (more detail). */
export function zoomIn(zoom: TimelineZoom): TimelineZoom {
  const index = ZOOM_LEVELS.indexOf(zoom)
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, index + 1)] ?? zoom
}

/** Move one step toward year (less detail). */
export function zoomOut(zoom: TimelineZoom): TimelineZoom {
  const index = ZOOM_LEVELS.indexOf(zoom)
  return ZOOM_LEVELS[Math.max(0, index - 1)] ?? zoom
}

/** Step toward a more micro (+1) or macro (-1) timeline scale. */
export function stepTimelineZoom(current: TimelineZoom, direction: 1 | -1): TimelineZoom {
  return direction > 0 ? zoomIn(current) : zoomOut(current)
}

/** Pixels per day at each named zoom level. */
export const PX_PER_DAY: Record<TimelineZoom, number> = {
  year: 2.4,
  quarter: 9,
  month: 22,
  week: 56
}

export const MIN_PX_PER_DAY = PX_PER_DAY.year
export const MAX_PX_PER_DAY = PX_PER_DAY.week

/** Pixels per day at each zoom. */
export function pxPerDay(zoom: TimelineZoom): number {
  return PX_PER_DAY[zoom]
}

/** Keep continuous density inside the Year↔Week envelope. */
export function clampPxPerDay(value: number): number {
  if (!Number.isFinite(value)) return MIN_PX_PER_DAY
  return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, value))
}

/**
 * Map a continuous density to the nearest named zoom for chrome (dropdown, headers).
 * Midpoints sit halfway between adjacent levels on a log scale so transitions feel even.
 */
export function zoomFromPxPerDay(density: number): TimelineZoom {
  const px = clampPxPerDay(density)
  const logPx = Math.log(px)
  let best: TimelineZoom = 'year'
  let bestDist = Infinity
  for (const level of ZOOM_LEVELS) {
    const dist = Math.abs(logPx - Math.log(PX_PER_DAY[level]))
    if (dist < bestDist) {
      best = level
      bestDist = dist
    }
  }
  return best
}

/**
 * Apply a wheel/pinch delta to density. Exponential scaling keeps Year→Week
 * perceptually even; returns the clamped next density.
 */
export function scalePxPerDay(current: number, deltaY: number): number {
  // Trackpads emit many small deltas; mouse wheels emit larger steps.
  const factor = Math.exp(-deltaY * 0.0018)
  return clampPxPerDay(current * factor)
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function toDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return startOfDay(next)
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}

export function clampDateOrder(start: string, end: string): { start: string; end: string } {
  if (end < start) return { start, end: start }
  return { start, end }
}

export function formatHoverDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export interface TimelineRange {
  start: Date
  end: Date
  today: Date
  widthPx: number
  /** Continuous pixels-per-day used for layout (may sit between named zooms). */
  pxPerDay: number
}

/** Stable day padding so zooming does not jump the coordinate origin. */
const RANGE_PAD_BEFORE = 120
const RANGE_PAD_AFTER = 240

export function buildTimelineRange(
  dates: Array<string | null | undefined>,
  zoom: TimelineZoom,
  today = startOfDay(new Date()),
  /** Optional continuous density; defaults to the named zoom's px/day. */
  density?: number
): TimelineRange {
  const parsed = dates.map(parseDateOnly).filter((d): d is Date => Boolean(d))
  let min = parsed.length
    ? new Date(Math.min(...parsed.map((d) => d.getTime()), today.getTime()))
    : addDays(today, -90)
  let max = parsed.length
    ? new Date(Math.max(...parsed.map((d) => d.getTime()), today.getTime()))
    : addDays(today, 270)

  min = addDays(min, -RANGE_PAD_BEFORE)
  max = addDays(max, RANGE_PAD_AFTER)

  const ppd = clampPxPerDay(density ?? pxPerDay(zoom))
  const days = Math.max(45, diffDays(max, min) + 1)
  return {
    start: min,
    end: max,
    today,
    pxPerDay: ppd,
    widthPx: Math.ceil(days * ppd)
  }
}

function densityOf(range: TimelineRange, zoom?: TimelineZoom): number {
  if (range.pxPerDay > 0) return range.pxPerDay
  return zoom ? pxPerDay(zoom) : MIN_PX_PER_DAY
}

export function dateToX(date: Date, range: TimelineRange, zoom?: TimelineZoom): number {
  return diffDays(date, range.start) * densityOf(range, zoom)
}

export function xToDate(x: number, range: TimelineRange, zoom?: TimelineZoom): Date {
  const days = Math.round(x / densityOf(range, zoom))
  return addDays(range.start, days)
}

export interface HeaderTick {
  key: string
  label: string
  x: number
  width: number
  isWeekend?: boolean
}

export interface TimelineHeaderModel {
  primary: HeaderTick[]
  secondary: HeaderTick[]
  weekends: HeaderTick[]
}

export function buildHeaderModel(
  range: TimelineRange,
  zoom: TimelineZoom,
  showWeekNumbers = true
): TimelineHeaderModel {
  const primary: HeaderTick[] = []
  const secondary: HeaderTick[] = []
  const weekends: HeaderTick[] = []

  if (zoom === 'year' || zoom === 'quarter') {
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1)
    while (cursor <= range.end) {
      const monthStart = new Date(cursor)
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const x = dateToX(monthStart, range, zoom)
      const width = dateToX(next > range.end ? addDays(range.end, 1) : next, range, zoom) - x
      const label = monthStart.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
      const showYear = monthStart.getMonth() === 0 || primary.length === 0
      primary.push({
        key: `m-${toDateOnly(monthStart)}`,
        label: showYear ? `${label} ${monthStart.getFullYear()}` : label,
        x,
        width
      })
      cursor.setTime(next.getTime())
    }

    if (showWeekNumbers) {
      const weekCursor = startOfDay(range.start)
      weekCursor.setDate(weekCursor.getDate() - ((weekCursor.getDay() + 6) % 7))
      while (weekCursor <= range.end) {
        const weekStart = new Date(weekCursor)
        const next = addDays(weekStart, 7)
        const x = dateToX(weekStart, range, zoom)
        const width = dateToX(next > range.end ? addDays(range.end, 1) : next, range, zoom) - x
        secondary.push({
          key: `w-${toDateOnly(weekStart)}`,
          label: String(isoWeekNumber(weekStart)),
          x,
          width
        })
        weekCursor.setTime(next.getTime())
      }
    }
  } else {
    // Month / week: primary = month bands, secondary = days or week starts
    const monthCursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1)
    while (monthCursor <= range.end) {
      const monthStart = new Date(monthCursor)
      const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)
      const x = Math.max(0, dateToX(monthStart, range, zoom))
      const endX = dateToX(next > range.end ? addDays(range.end, 1) : next, range, zoom)
      primary.push({
        key: `m-${toDateOnly(monthStart)}`,
        label: monthStart.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        x,
        width: Math.max(1, endX - x)
      })
      monthCursor.setTime(next.getTime())
    }

    const dayCursor = startOfDay(range.start)
    while (dayCursor <= range.end) {
      const day = new Date(dayCursor)
      const next = addDays(day, 1)
      const x = dateToX(day, range, zoom)
      const width = densityOf(range, zoom)
      const isWeekend = day.getDay() === 0 || day.getDay() === 6
      if (zoom === 'week' || day.getDay() === 1 || day.getDate() === 1 || secondary.length === 0) {
        secondary.push({
          key: `d-${toDateOnly(day)}`,
          label: String(day.getDate()),
          x,
          width: zoom === 'week' ? width : width,
          isWeekend
        })
      }
      if (isWeekend) {
        weekends.push({
          key: `we-${toDateOnly(day)}`,
          label: '',
          x,
          width,
          isWeekend: true
        })
      }
      dayCursor.setTime(next.getTime())
    }
  }

  return { primary, secondary, weekends }
}

/** @deprecated use buildHeaderModel */
export function buildHeaderTicks(range: TimelineRange, zoom: TimelineZoom): HeaderTick[] {
  return buildHeaderModel(range, zoom).primary
}
