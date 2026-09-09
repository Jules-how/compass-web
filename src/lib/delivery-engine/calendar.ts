import type { AccountConfig, Slot } from './types'

export type Busy = { start: string; end: string }
export function overlaps(a: Busy, b: Busy): boolean { return Date.parse(a.start) < Date.parse(b.end) && Date.parse(a.end) > Date.parse(b.start) }

/** Enumerate real UTC instants, then apply local business hours; DST is handled by Intl. */
export function candidateSlots(now: string, config: AccountConfig, busy: Busy[], limit = 2): Slot[] {
  const result: Slot[] = []
  const minimum = Date.parse(now) + config.minimumNoticeMinutes * 60_000
  let cursor = Math.ceil(minimum / (15 * 60_000)) * 15 * 60_000
  const deadline = cursor + 21 * 86400_000
  const formatter = new Intl.DateTimeFormat('en-AU', { timeZone: config.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const label = new Intl.DateTimeFormat('en-AU', { timeZone: config.timezone, weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  while (cursor < deadline && result.length < limit) {
    const parts = formatter.formatToParts(new Date(cursor))
    const field = (key: string) => parts.find(p => p.type === key)?.value ?? ''
    const hours = config.hours[field('weekday').toLowerCase()]
    const localMinute = Number(field('hour')) * 60 + Number(field('minute'))
    const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
    if (hours?.length === 2 && localMinute >= minute(hours[0]) && localMinute + config.slotMinutes <= minute(hours[1]) &&
        (localMinute - minute(hours[0])) % (config.slotMinutes + config.bufferMinutes) === 0) {
      const slot = { start: new Date(cursor).toISOString(), end: new Date(cursor + config.slotMinutes * 60_000).toISOString(), label: label.format(new Date(cursor)) }
      const buffered = { start: new Date(cursor - config.bufferMinutes * 60_000).toISOString(), end: new Date(Date.parse(slot.end) + config.bufferMinutes * 60_000).toISOString() }
      if (!busy.some(b => overlaps(buffered, b))) result.push(slot)
    }
    cursor += 15 * 60_000
  }
  return result
}
