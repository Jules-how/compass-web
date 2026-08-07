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

/** Pixels per day at each zoom. */
export function pxPerDay(zoom: TimelineZoom): number {
  switch (zoom) {
    case 'year':
      return 2.4
    case 'quarter':
      return 9
    case 'month':
      return 22
    case 'week':
      return 56
  }
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
}

export function buildTimelineRange(
  dates: Array<string | null | undefined>,
  zoom: TimelineZoom,
  today = startOfDay(new Date())
): TimelineRange {
  const parsed = dates.map(parseDateOnly).filter((d): d is Date => Boolean(d))
  let min = parsed.length
    ? new Date(Math.min(...parsed.map((d) => d.getTime()), today.getTime()))
    : addDays(today, -90)
  let max = parsed.length
    ? new Date(Math.max(...parsed.map((d) => d.getTime()), today.getTime()))
    : addDays(today, 270)

  const padBefore = zoom === 'year' ? 150 : zoom === 'quarter' ? 60 : zoom === 'month' ? 28 : 10
  const padAfter = zoom === 'year' ? 300 : zoom === 'quarter' ? 120 : zoom === 'month' ? 60 : 21
  min = addDays(min, -padBefore)
  max = addDays(max, padAfter)

  const days = Math.max(45, diffDays(max, min) + 1)
  return {
    start: min,
    end: max,
    today,
    widthPx: Math.ceil(days * pxPerDay(zoom))
  }
}

export function dateToX(date: Date, range: TimelineRange, zoom: TimelineZoom): number {
  return diffDays(date, range.start) * pxPerDay(zoom)
}

export function xToDate(x: number, range: TimelineRange, zoom: TimelineZoom): Date {
  const days = Math.round(x / pxPerDay(zoom))
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
      const width = pxPerDay(zoom)
      const isWeekend = day.getDay() === 0 || day.getDay() === 6
      if (zoom === 'week' || day.getDay() === 1 || day.getDate() === 1 || secondary.length === 0) {
        secondary.push({
          key: `d-${toDateOnly(day)}`,
          label: String(day.getDate()),
          x,
          width: zoom === 'week' ? width : width * (zoom === 'month' ? 1 : 1),
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
