export type TimelineZoom = 'year' | 'quarter' | 'month' | 'week'

export const ZOOM_OPTIONS: { id: TimelineZoom; label: string; shortcut: string }[] = [
  { id: 'year', label: 'Year', shortcut: 'Y' },
  { id: 'quarter', label: 'Quarter', shortcut: 'Q' },
  { id: 'month', label: 'Month', shortcut: 'M' },
  { id: 'week', label: 'Week', shortcut: 'W' }
]

/** Pixels per day at each zoom. */
export function pxPerDay(zoom: TimelineZoom): number {
  switch (zoom) {
    case 'year':
      return 2.2
    case 'quarter':
      return 8
    case 'month':
      return 18
    case 'week':
      return 48
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
    : addDays(today, -60)
  let max = parsed.length
    ? new Date(Math.max(...parsed.map((d) => d.getTime()), today.getTime()))
    : addDays(today, 180)

  // Pad so Today and campaigns have breathing room.
  const padBefore = zoom === 'year' ? 120 : zoom === 'quarter' ? 45 : zoom === 'month' ? 21 : 7
  const padAfter = zoom === 'year' ? 240 : zoom === 'quarter' ? 90 : zoom === 'month' ? 45 : 21
  min = addDays(min, -padBefore)
  max = addDays(max, padAfter)

  const days = Math.max(30, diffDays(max, min) + 1)
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
  sublabel?: string
  x: number
  width: number
}

export function buildHeaderTicks(range: TimelineRange, zoom: TimelineZoom): HeaderTick[] {
  const ticks: HeaderTick[] = []
  const cursor = new Date(range.start)

  if (zoom === 'year' || zoom === 'quarter') {
    cursor.setDate(1)
    while (cursor <= range.end) {
      const monthStart = new Date(cursor)
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const x = dateToX(monthStart, range, zoom)
      const width = dateToX(next > range.end ? addDays(range.end, 1) : next, range, zoom) - x
      const label = monthStart.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
      const showYear = monthStart.getMonth() === 0 || ticks.length === 0
      ticks.push({
        key: toDateOnly(monthStart),
        label: showYear ? `${label} ${monthStart.getFullYear()}` : label,
        x,
        width
      })
      cursor.setTime(next.getTime())
    }
    return ticks
  }

  // Month / week: weekly ticks
  const day = cursor.getDay()
  cursor.setDate(cursor.getDate() - day)
  while (cursor <= range.end) {
    const weekStart = new Date(cursor)
    const next = addDays(weekStart, 7)
    const x = dateToX(weekStart, range, zoom)
    const width = dateToX(next > range.end ? addDays(range.end, 1) : next, range, zoom) - x
    ticks.push({
      key: toDateOnly(weekStart),
      label: String(weekStart.getDate()),
      sublabel: weekStart.getDate() <= 7
        ? weekStart.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
        : undefined,
      x,
      width
    })
    cursor.setTime(next.getTime())
  }
  return ticks
}
