/**
 * Campaign queue: week-level planning of upcoming cold campaigns plus the
 * 90-day recontact pool. Planning state only — nothing here activates sends;
 * activation stays in Instantly after Jules signs off.
 */

/** Minimum ready leads before a recontact cohort earns a campaign slot. */
export const RECONTACT_PROMOTE_MIN = 30

/** Rough wave size used to express runway in campaign counts. */
export const QUEUE_WAVE_SIZE = 50

export type QueueWeekBucket = 'this_week' | 'next_week' | 'later' | 'unscheduled'

/** Monday (YYYY-MM-DD) of the week containing the given date-only string. */
export function mondayOfWeek(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateOnly
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** Monday N weeks after the week containing `todayOnly`. */
export function mondayWeeksAhead(todayOnly: string, weeks: number): string {
  const monday = mondayOfWeek(todayOnly)
  const d = new Date(`${monday}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

export function queueWeekBucket(
  startDate: string | null | undefined,
  todayOnly: string
): QueueWeekBucket {
  const start = (startDate || '').trim()
  if (!start) return 'unscheduled'
  const startMonday = mondayOfWeek(start)
  const thisMonday = mondayOfWeek(todayOnly)
  const nextMonday = mondayWeeksAhead(todayOnly, 1)
  // Overdue plans stay visible in this week's lane rather than vanishing.
  if (startMonday <= thisMonday) return 'this_week'
  if (startMonday === nextMonday) return 'next_week'
  return 'later'
}

export type QueueCampaign = {
  id: string
  name: string
  status: string
  start_date: string | null
  priority: number
  vertical_tags: string[]
  location_tags: string[]
  copy_status: string
  bound: boolean
  cohort: number
  week: QueueWeekBucket
}

export type QueueRunwayRow = {
  vertical: string
  sendable: number
  recontactReady: number
  wavesLeft: number
}

export type QueueRecontactGroup = {
  vertical: string
  city: string | null
  count: number
  promotable: boolean
}

export type QueuePayload = {
  queue: QueueCampaign[]
  runway: QueueRunwayRow[]
  recontactPool: QueueRecontactGroup[]
  promoteMin: number
  waveSize: number
  generatedAt: string
}

/** Group (vertical, city) pairs into counted recontact cohorts, largest first. */
export function groupRecontactPool(
  rows: Array<{ vertical?: string | null; city?: string | null }>
): QueueRecontactGroup[] {
  const counts = new Map<string, { vertical: string; city: string | null; count: number }>()
  for (const row of rows) {
    const vertical = (row.vertical || '').trim().toLowerCase() || 'other'
    const city = (row.city || '').trim() || null
    const key = `${vertical}|${(city || '').toLowerCase()}`
    const entry = counts.get(key) ?? { vertical, city, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  return Array.from(counts.values())
    .map((g) => ({ ...g, promotable: g.count >= RECONTACT_PROMOTE_MIN }))
    .sort((a, b) => b.count - a.count || a.vertical.localeCompare(b.vertical))
}

/** Sendable + ready counts per vertical, largest sendable first. */
export function buildRunway(
  sendable: Array<{ vertical?: string | null }>,
  ready: Array<{ vertical?: string | null }>
): QueueRunwayRow[] {
  const rows = new Map<string, QueueRunwayRow>()
  const bump = (raw: string | null | undefined, field: 'sendable' | 'recontactReady') => {
    const vertical = (raw || '').trim().toLowerCase() || 'other'
    const entry =
      rows.get(vertical) ?? { vertical, sendable: 0, recontactReady: 0, wavesLeft: 0 }
    entry[field] += 1
    rows.set(vertical, entry)
  }
  for (const row of sendable) bump(row.vertical, 'sendable')
  for (const row of ready) bump(row.vertical, 'recontactReady')
  return Array.from(rows.values())
    .map((r) => ({ ...r, wavesLeft: Math.floor(r.sendable / QUEUE_WAVE_SIZE) }))
    .sort((a, b) => b.sendable - a.sendable)
}

export function recontactCampaignName(
  vertical: string,
  city: string | null,
  todayOnly: string
): string {
  const cap = (s: string) =>
    s
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(' ')
  const when = new Date(`${todayOnly}T00:00:00Z`)
  const label = Number.isNaN(when.getTime())
    ? todayOnly
    : when.toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return ['Recontact', cap(vertical), city ? cap(city) : null, label]
    .filter(Boolean)
    .join(' | ')
}
