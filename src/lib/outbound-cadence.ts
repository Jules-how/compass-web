import {
  inventoryCardId,
  type InventoryCard,
  type QueueRecontactGroup,
  type QueueRunwayRow
} from '@/lib/campaign-queue'
import { sydneyNineAmIso } from '@/lib/campaigns'

export type CadencePrefs = {
  target: number | null
  cap: number | null
}

export const CADENCE_STORAGE_KEY = 'compass.outbound.cadence.v1'

export const EMPTY_CADENCE: CadencePrefs = { target: null, cap: null }

function asCount(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

export function normalizeCadencePrefs(raw: Partial<CadencePrefs> | null | undefined): CadencePrefs {
  let target = asCount(raw?.target)
  let cap = asCount(raw?.cap)
  if (target != null && cap != null && cap < target) cap = target
  return { target, cap }
}

export function parseCadencePrefs(raw: string | null | undefined): CadencePrefs {
  if (!raw) return EMPTY_CADENCE
  try {
    return normalizeCadencePrefs(JSON.parse(raw) as Partial<CadencePrefs>)
  } catch {
    return EMPTY_CADENCE
  }
}

export function readCadencePrefs(): CadencePrefs {
  if (typeof window === 'undefined') return EMPTY_CADENCE
  try {
    return parseCadencePrefs(window.localStorage.getItem(CADENCE_STORAGE_KEY))
  } catch {
    return EMPTY_CADENCE
  }
}

export function writeCadencePrefs(prefs: CadencePrefs): CadencePrefs {
  const next = normalizeCadencePrefs(prefs)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CADENCE_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // quota / private mode
    }
  }
  return next
}

export type CadenceWeekLoad = {
  slots: number
  overCapacity: boolean
  underTarget: boolean
  label: string
}

/** Week fullness from prefs. No default cadence band. */
export function cadenceWeekLoad(slots: number, prefs: CadencePrefs): CadenceWeekLoad {
  const overCapacity = prefs.cap != null && slots > prefs.cap
  const underTarget = prefs.target != null && slots < prefs.target
  const bits = [`${slots} this week`]
  if (overCapacity) bits.push('over cap')
  else if (underTarget) bits.push('under target')
  return { slots, overCapacity, underTarget, label: bits.join(' · ') }
}

/**
 * How many recs to offer. Target/cap when set. If both null, up to
 * `suggestionCap` ranked cards with no fullness stop from cadence.
 */
export function cadenceTake(
  thisWeekSlots: number,
  prefs: CadencePrefs,
  suggestionCap = 3
): number {
  const { target, cap } = prefs
  const room = cap == null ? Number.POSITIVE_INFINITY : Math.max(0, cap - thisWeekSlots)
  if (target == null && cap == null) return suggestionCap
  if (target == null) return Math.min(suggestionCap, room)
  const need = Math.max(0, target - thisWeekSlots)
  return Math.min(need, room)
}

/** Filled bays plus empty add bays. Target sets N; otherwise one empty add bay. Cap limits empty bays. */
export function cassetteBayCount(filled: number, prefs: CadencePrefs): number {
  const filledSafe = Math.max(0, filled)
  const emptyWanted = prefs.target != null ? Math.max(0, prefs.target - filledSafe) : 1
  const emptyCapped =
    prefs.cap != null ? Math.min(emptyWanted, Math.max(0, prefs.cap - filledSafe)) : emptyWanted
  return filledSafe + emptyCapped
}

/** Next weekday 09:00 Sydney in the week starting `weekMonday` that is not already occupied. */
export function nextOpenWeekdayNineAm(
  weekMonday: string,
  occupiedDateOnly: ReadonlySet<string>
): string {
  const d = new Date(`${weekMonday}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return sydneyNineAmIso(weekMonday)
  for (let i = 0; i < 14; i++) {
    const dateOnly = d.toISOString().slice(0, 10)
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5 && !occupiedDateOnly.has(dateOnly)) {
      return sydneyNineAmIso(dateOnly)
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return sydneyNineAmIso(weekMonday)
}

/**
 * Ranked next launches using cadence prefs instead of the live week constants.
 * Promotable 90-day first, then fresh runway. One trade per week.
 */
export function rankNextSlotsWithPrefs(input: {
  runway: QueueRunwayRow[]
  recontactPool: QueueRecontactGroup[]
  thisWeekVerticals: string[]
  thisWeekSlots: number
  prefs: CadencePrefs
}): InventoryCard[] {
  const take = cadenceTake(input.thisWeekSlots, input.prefs)
  if (take <= 0) return []

  const booked = new Set(
    input.thisWeekVerticals.map((value) => value.trim().toLowerCase()).filter(Boolean)
  )
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
