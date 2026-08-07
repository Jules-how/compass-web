/** Shared timeline helpers for project/task planning views. */

export interface TimelineBounds {
  start: Date
  end: Date
  today: Date
}

export function computeTimelineBounds(
  dates: Array<string | null | undefined>,
  today = new Date()
): TimelineBounds {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const end = new Date(today.getFullYear() + 1, today.getMonth() + 2, 1)
  for (const value of dates) {
    if (!value) continue
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue
    if (date < start) start.setTime(date.getTime())
    if (date > end) end.setTime(date.getTime())
  }
  return { start, end, today }
}

export function dateToTimelinePercent(
  value: string | null | undefined,
  bounds: TimelineBounds
): number | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`).getTime()
  if (Number.isNaN(date)) return null
  const start = bounds.start.getTime()
  const end = bounds.end.getTime()
  if (end <= start) return 0
  return Math.min(100, Math.max(0, ((date - start) / (end - start)) * 100))
}

export function timelineBarLayout(
  startDate: string | null | undefined,
  targetDate: string | null | undefined,
  bounds: TimelineBounds,
  fallbackPercent: number
): { left: number; width: number } {
  const startPct = dateToTimelinePercent(startDate, bounds) ?? fallbackPercent
  const endPct = dateToTimelinePercent(targetDate, bounds) ?? startPct + 4
  const left = Math.min(startPct, endPct)
  const width = Math.max(3, Math.abs(endPct - startPct))
  return { left, width }
}
