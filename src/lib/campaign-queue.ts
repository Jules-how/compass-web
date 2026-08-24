/**
 * Campaign queue: week-level planning of upcoming cold campaigns plus the
 * 90-day recontact pool. Planning state only — nothing here activates sends;
 * activation stays in Instantly after Jules signs off.
 */

/** Minimum ready leads before a recontact cohort earns a campaign slot. */
export const RECONTACT_PROMOTE_MIN = 30

/** Rough wave size used to express runway in campaign counts. */
export const QUEUE_WAVE_SIZE = 50

/** Weekly cadence band: aim for at least this many campaign launches per week. */
export const QUEUE_WEEK_SLOT_MIN = 3

/** Weekly cadence ceiling — more launches than this overloads inbox capacity. */
export const QUEUE_WEEK_SLOT_MAX = 5

/** Lead ceiling per week, derived from max launches at one wave each. */
export const QUEUE_WEEK_LEAD_CAPACITY = QUEUE_WEEK_SLOT_MAX * QUEUE_WAVE_SIZE

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

export type QueueReadiness = {
  ready: boolean
  /** Human-readable launch blockers, empty when ready. */
  blockers: string[]
}

/**
 * Launch checklist: a campaign is pushable when it has a big-enough cohort,
 * finished copy, and an Instantly binding. Everything else is a named blocker.
 */
export function campaignReadiness(
  c: Pick<QueueCampaign, 'cohort' | 'copy_status' | 'bound'>
): QueueReadiness {
  const blockers: string[] = []
  if (c.cohort === 0) blockers.push('no leads')
  else if (c.cohort < RECONTACT_PROMOTE_MIN) blockers.push(`thin cohort (<${RECONTACT_PROMOTE_MIN})`)
  if (c.copy_status !== 'ready' && c.copy_status !== 'live') {
    blockers.push(c.copy_status === 'draft' ? 'copy in draft' : 'no copy')
  }
  if (!c.bound) blockers.push('not bound')
  return { ready: blockers.length === 0, blockers }
}

export type QueueWeekLoad = {
  slots: number
  leads: number
  /** Below the 3-a-week cadence floor. */
  underCadence: boolean
  /** Above the 5-a-week ceiling or the weekly lead capacity. */
  overCapacity: boolean
}

/** Booked slots and leads for one week lane, flagged against the cadence band. */
export function weekLoad(lane: ReadonlyArray<Pick<QueueCampaign, 'cohort'>>): QueueWeekLoad {
  const slots = lane.length
  const leads = lane.reduce((sum, c) => sum + c.cohort, 0)
  return {
    slots,
    leads,
    underCadence: slots < QUEUE_WEEK_SLOT_MIN,
    overCapacity: slots > QUEUE_WEEK_SLOT_MAX || leads > QUEUE_WEEK_LEAD_CAPACITY
  }
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

function titleCaseTrade(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

function monthYearLabel(todayOnly: string): string {
  const when = new Date(`${todayOnly}T00:00:00Z`)
  if (Number.isNaN(when.getTime())) return todayOnly
  return when.toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function recontactCampaignName(
  vertical: string,
  city: string | null,
  todayOnly: string
): string {
  return ['Recontact', titleCaseTrade(vertical), city ? titleCaseTrade(city) : null, monthYearLabel(todayOnly)]
    .filter(Boolean)
    .join(' | ')
}

export function freshCampaignName(
  vertical: string,
  city: string | null,
  todayOnly: string
): string {
  return [titleCaseTrade(vertical), city ? titleCaseTrade(city) : null, monthYearLabel(todayOnly)]
    .filter(Boolean)
    .join(' | ')
}

export const INVENTORY_DRAG_MIME = 'application/x-compass-inventory'

export type InventoryKind = 'recontact' | 'fresh'

export type InventoryCard = {
  id: string
  kind: InventoryKind
  vertical: string
  city: string | null
  count: number
  reason: string
}

export function inventoryCardId(
  kind: InventoryKind,
  vertical: string,
  city: string | null
): string {
  return `${kind}:${vertical.trim().toLowerCase()}:${(city || '').trim().toLowerCase()}`
}

export function parseInventoryDrag(raw: string | null | undefined): InventoryCard | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<InventoryCard>
    if (parsed.kind !== 'recontact' && parsed.kind !== 'fresh') return null
    const vertical = typeof parsed.vertical === 'string' ? parsed.vertical.trim() : ''
    if (!vertical) return null
    const city =
      typeof parsed.city === 'string' && parsed.city.trim() ? parsed.city.trim() : null
    const count = typeof parsed.count === 'number' && Number.isFinite(parsed.count) ? parsed.count : 0
    return {
      id: inventoryCardId(parsed.kind, vertical, city),
      kind: parsed.kind,
      vertical,
      city,
      count,
      reason: typeof parsed.reason === 'string' ? parsed.reason : ''
    }
  } catch {
    return null
  }
}

/**
 * Ranked next launches. Promotable 90-day batches first, then fresh runway
 * with at least one wave. One trade per week. Fills toward 3–5 slots, never past 5.
 */
export function rankNextSlots(input: {
  runway: QueueRunwayRow[]
  recontactPool: QueueRecontactGroup[]
  thisWeekVerticals: string[]
  thisWeekSlots: number
}): InventoryCard[] {
  const booked = new Set(
    input.thisWeekVerticals.map((value) => value.trim().toLowerCase()).filter(Boolean)
  )
  const room = Math.max(0, QUEUE_WEEK_SLOT_MAX - input.thisWeekSlots)
  const need = Math.max(0, QUEUE_WEEK_SLOT_MIN - input.thisWeekSlots)
  const take = Math.min(room, Math.max(need, Math.min(3, room)))
  if (take <= 0) return []

  const recs: InventoryCard[] = []
  const used = new Set(booked)

  for (const group of input.recontactPool) {
    if (recs.length >= take) break
    if (!group.promotable) continue
    const vertical = group.vertical.trim().toLowerCase()
    if (!vertical || used.has(vertical)) continue
    recs.push({
      id: inventoryCardId('recontact', vertical, group.city),
      kind: 'recontact',
      vertical,
      city: group.city,
      count: group.count,
      reason: `${group.count} past 90-day cooldown`
    })
    used.add(vertical)
  }

  for (const row of input.runway) {
    if (recs.length >= take) break
    const vertical = row.vertical.trim().toLowerCase()
    if (!vertical || used.has(vertical)) continue
    if (row.wavesLeft < 1) continue
    recs.push({
      id: inventoryCardId('fresh', vertical, null),
      kind: 'fresh',
      vertical,
      city: null,
      count: row.sendable,
      reason: `${row.sendable} sendable · ≈${row.wavesLeft} waves`
    })
    used.add(vertical)
  }

  return recs
}

/** Promotable 90-day batches that are not already in the rec list. */
export function inventoryPoolCards(
  pool: QueueRecontactGroup[],
  recs: InventoryCard[]
): InventoryCard[] {
  const recIds = new Set(recs.map((card) => card.id))
  return pool
    .filter((group) => group.promotable)
    .map((group) => ({
      id: inventoryCardId('recontact', group.vertical, group.city),
      kind: 'recontact' as const,
      vertical: group.vertical,
      city: group.city,
      count: group.count,
      reason: `${group.count} past 90-day cooldown`
    }))
    .filter((card) => !recIds.has(card.id))
}
