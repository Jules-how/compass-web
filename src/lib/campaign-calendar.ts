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

/** Pixel height of one hour row in week/day calendars. */
export const CALENDAR_HOUR_HEIGHT = 80
export const CALENDAR_HOURS = 24
export const CALENDAR_GUTTER_PX = 64
/** One campaign fills one hour row, with a small gap so stacked cards stay readable. */
export const CALENDAR_EVENT_HEIGHT = 72
/** Week columns stay wide enough for name + tags instead of clipping. */
export const CALENDAR_DAY_COL_MIN_PX = 248
export const CALENDAR_SCROLL_HOUR = 7

export function minutesFromMidnight(iso: string | null | undefined): number | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

export function hourLabel(hour: number): string {
  const date = new Date(2000, 0, 1, hour, 0, 0)
  return date.toLocaleTimeString('en-AU', { hour: 'numeric' })
}

/** Local wall-clock go-live for a calendar square (day column + hour row). */
export function goLiveAtFromSlot(day: Date, hour: number, minute = 0): string {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hour,
    minute,
    0,
    0
  ).toISOString()
}

export function formatSlotHeading(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'New campaign'
  return date.toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function eventOffsetPx(minutes: number): number {
  const clamped = Math.min(CALENDAR_HOURS * 60 - 1, Math.max(0, minutes))
  return (clamped / 60) * CALENDAR_HOUR_HEIGHT
}

export function hourFromOffsetPx(offsetY: number): number {
  return Math.max(0, Math.min(CALENDAR_HOURS - 1, Math.floor(offsetY / CALENDAR_HOUR_HEIGHT)))
}

/** Hours already taken on a local calendar day. */
export function occupiedHoursOnDay(
  day: Date,
  isos: Array<string | null | undefined>
): Set<number> {
  const key = toDateOnly(day)
  const hours = new Set<number>()
  for (const iso of isos) {
    if (!iso) continue
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) continue
    if (toDateOnly(date) !== key) continue
    hours.add(date.getHours())
  }
  return hours
}

/** Next free hour on that day, walking forward then backward from the preferred hour. */
export function nextOpenGoLiveAt(
  day: Date,
  preferredHour: number,
  occupiedIsos: Array<string | null | undefined>,
  ignoreIso?: string | null
): string {
  const occupied = occupiedHoursOnDay(
    day,
    occupiedIsos.filter((iso) => iso && iso !== ignoreIso)
  )
  const start = Math.max(0, Math.min(CALENDAR_HOURS - 1, Math.floor(preferredHour)))
  if (!occupied.has(start)) return goLiveAtFromSlot(day, start)
  for (let hour = start + 1; hour < CALENDAR_HOURS; hour++) {
    if (!occupied.has(hour)) return goLiveAtFromSlot(day, hour)
  }
  for (let hour = start - 1; hour >= 0; hour--) {
    if (!occupied.has(hour)) return goLiveAtFromSlot(day, hour)
  }
  return goLiveAtFromSlot(day, start)
}

/** Map a pointer on a timed grid to a go-live, including days past the visible columns. */
export function slotFromGridPoint(
  firstDay: Date,
  columnCount: number,
  grid: { left: number; top: number; width: number },
  clientX: number,
  clientY: number,
  occupiedIsos: Array<string | null | undefined>,
  ignoreIso?: string | null
): string {
  const cols = Math.max(1, columnCount)
  const colW = grid.width / cols
  const dayIndex = Math.floor((clientX - grid.left) / colW)
  const day = addDays(firstDay, Number.isFinite(dayIndex) ? dayIndex : 0)
  const hour = hourFromOffsetPx(clientY - grid.top)
  return nextOpenGoLiveAt(day, hour, occupiedIsos, ignoreIso)
}

/** Map a pointer on the 7×6 month grid, including cells past the visible month. */
export function dayFromMonthGridPoint(
  gridStart: Date,
  grid: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): Date {
  const colW = grid.width / 7
  const rowH = grid.height / 6
  const col = Math.floor((clientX - grid.left) / colW)
  const row = Math.floor((clientY - grid.top) / rowH)
  return addDays(gridStart, row * 7 + col)
}

export type TimedLane = {
  id: string
  minutes: number
  lane: number
  laneCount: number
}

/** Pack same-day go-live cards that would overlap vertically into columns. */
export function layoutTimedEvents(
  events: Array<{ id: string; minutes: number }>,
  durationMinutes = Math.round((CALENDAR_EVENT_HEIGHT / CALENDAR_HOUR_HEIGHT) * 60)
): TimedLane[] {
  const sorted = events
    .slice()
    .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id))
  const laneEnds: number[] = []
  const placed: Array<{ id: string; minutes: number; lane: number; end: number }> = []

  for (const event of sorted) {
    const end = event.minutes + durationMinutes
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= event.minutes)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    placed.push({ id: event.id, minutes: event.minutes, lane, end })
  }

  return placed.map((item) => {
    const overlapping = placed.filter(
      (other) => other.minutes < item.end && other.end > item.minutes
    )
    const laneCount = overlapping.reduce((max, row) => Math.max(max, row.lane + 1), 1)
    return { id: item.id, minutes: item.minutes, lane: item.lane, laneCount }
  })
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
