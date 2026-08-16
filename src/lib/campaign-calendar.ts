import {
  addDays,
  diffDays,
  parseDateOnly,
  startOfDay,
  toDateOnly
} from '@/lib/campaign-timeline'

export type CalendarGrain = 'day' | 'week' | 'month'

export const CALENDAR_GRAINS: { id: CalendarGrain; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' }
]

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date)
  const mondayOffset = (day.getDay() + 6) % 7
  return addDays(day, -mondayOffset)
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function periodRange(cursor: Date, grain: CalendarGrain): { start: Date; end: Date } {
  if (grain === 'day') {
    const start = startOfDay(cursor)
    return { start, end: start }
  }
  if (grain === 'week') {
    const start = startOfWeek(cursor)
    return { start, end: addDays(start, 6) }
  }
  const start = startOfMonth(cursor)
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  return { start, end }
}

export function shiftCursor(cursor: Date, grain: CalendarGrain, direction: 1 | -1): Date {
  if (grain === 'day') return addDays(startOfDay(cursor), direction)
  if (grain === 'week') return addDays(startOfWeek(cursor), direction * 7)
  return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
}

export function datesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && aEnd >= bStart
}

type DatedItem = { id: string; start: Date; end: Date }

export function campaignOverlapsPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const a = parseDateOnly(start)
  const b = parseDateOnly(end)
  if (!a || !b) return false
  return datesOverlap(a, b, rangeStart, rangeEnd)
}

export function goLiveFallsInPeriod(
  goLiveAt: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  if (!goLiveAt) return false
  const date = new Date(goLiveAt)
  if (Number.isNaN(date.getTime())) return false
  const local = startOfDay(date)
  return local >= rangeStart && local <= rangeEnd
}

export function datedGoLiveCampaigns(
  rows: Array<{ id: string; go_live_at: string | null | undefined }>
): DatedItem[] {
  const items: DatedItem[] = []
  for (const row of rows) {
    if (!row.go_live_at) continue
    const date = new Date(row.go_live_at)
    if (Number.isNaN(date.getTime())) continue
    const day = startOfDay(date)
    items.push({ id: row.id, start: day, end: day })
  }
  return items
}

/** Six Monday-start weeks covering the month (and adjacent overflow days). */
export function monthWeeks(cursor: Date): Date[][] {
  const gridStart = startOfWeek(startOfMonth(cursor))
  const weeks: Date[][] = []
  let day = gridStart
  for (let week = 0; week < 6; week++) {
    const row: Date[] = []
    for (let i = 0; i < 7; i++) {
      row.push(day)
      day = addDays(day, 1)
    }
    weeks.push(row)
  }
  return weeks
}

export function weekDays(cursor: Date): Date[] {
  const start = startOfWeek(cursor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatPeriodLabel(cursor: Date, grain: CalendarGrain): string {
  if (grain === 'day') {
    return cursor.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }
  if (grain === 'week') {
    const { start, end } = periodRange(cursor, 'week')
    const sameMonth = start.getMonth() === end.getMonth()
    const startLabel = start.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: sameMonth ? undefined : 'short'
    })
    const endLabel = end.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    return `${startLabel} – ${endLabel}`
  }
  return cursor.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

export type CalendarBar = {
  campaignId: string
  lane: number
  colStart: number
  colSpan: number
}

export function layoutWeekBars(week: Date[], items: DatedItem[]): CalendarBar[] {
  const weekStart = week[0]
  const weekEnd = week[6]
  if (!weekStart || !weekEnd) return []

  const overlapping = items
    .filter((item) => datesOverlap(item.start, item.end, weekStart, weekEnd))
    .sort((a, b) => {
      const startCmp = a.start.getTime() - b.start.getTime()
      if (startCmp !== 0) return startCmp
      return diffDays(b.end, b.start) - diffDays(a.end, a.start)
    })

  const laneEnds: Date[] = []
  const bars: CalendarBar[] = []

  for (const item of overlapping) {
    const colStart = Math.max(0, diffDays(item.start, weekStart))
    const colEnd = Math.min(6, diffDays(item.end, weekStart))
    if (colEnd < colStart) continue

    let lane = laneEnds.findIndex((end) => end < item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }

    bars.push({
      campaignId: item.id,
      lane,
      colStart,
      colSpan: colEnd - colStart + 1
    })
  }

  return bars
}

export function datedCampaigns(
  rows: Array<{ id: string; start: string | null; end: string | null }>
): DatedItem[] {
  const items: DatedItem[] = []
  for (const row of rows) {
    const start = parseDateOnly(row.start)
    const end = parseDateOnly(row.end)
    if (!start || !end) continue
    items.push({ id: row.id, start, end })
  }
  return items
}

export { toDateOnly }
