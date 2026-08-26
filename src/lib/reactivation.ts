import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/lead-import-shared'
import { loadReactivationPack, type ReactivationPack } from '@/lib/reactivation-pack'
import { appendEvidence } from '@/lib/events'

export type ReactivationImportRow = Record<string, string | undefined>

export type HygieneRejectReason =
  | 'no_mobile'
  | 'do_not_contact'
  | 'dup_mobile'
  | 'no_last_touch'
  | 'under_lapse'
  | 'no_consent'
  | 'invalid_consent_basis'

export type ParsedReactivationRow = {
  name: string
  mobile: string
  email: string
  last_touch_date: string | null
  source: string
  enquiry_type: string
  consent_basis: string
  do_not_contact: boolean
  raw: Record<string, string>
}

export type HygieneResult = {
  eligible: ParsedReactivationRow & { segment: string; consent_proof: Record<string, unknown> }
  rejected: { row: ParsedReactivationRow; reason: HygieneRejectReason } | null
}

/** Lowercase and collapse underscores/hyphens so `last_touch_date` matches "last touch date". */
function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function lookupField(
  raw: Record<string, string | undefined>,
  aliases: string[]
): string {
  for (const alias of aliases) {
    const normAlias = normalizeFieldKey(alias)
    for (const key of Object.keys(raw)) {
      if (normalizeFieldKey(key) === normAlias) {
        const val = raw[key]
        if (val != null && String(val).trim()) return String(val).trim()
      }
    }
  }
  for (const alias of aliases) {
    const lower = alias.toLowerCase()
    if (lower.length < 3) continue
    for (const key of Object.keys(raw)) {
      if (key.toLowerCase().includes(lower)) {
        const val = raw[key]
        if (val != null && String(val).trim()) return String(val).trim()
      }
    }
  }
  return ''
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function daysSince(dateIso: string): number {
  const then = new Date(`${dateIso}T12:00:00Z`).getTime()
  const now = Date.now()
  return Math.floor((now - then) / (24 * 60 * 60 * 1000))
}

function isTruthy(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'y'
}

export function mapReactivationRow(
  raw: ReactivationImportRow,
  pack: ReactivationPack
): ParsedReactivationRow {
  const map = pack.import_map
  const normalized: Record<string, string> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (val != null) normalized[key] = String(val).trim()
  }
  return {
    name: lookupField(raw, [...(map.name ?? []), 'name']),
    mobile: normalizePhone(lookupField(raw, [...(map.mobile ?? []), 'mobile'])),
    email: lookupField(raw, [...(map.email ?? []), 'email']).toLowerCase(),
    last_touch_date: parseDate(lookupField(raw, [...(map.last_touch_date ?? []), 'last_touch_date'])),
    source: lookupField(raw, [...(map.source ?? []), 'source']),
    enquiry_type: lookupField(raw, [...(map.enquiry_type ?? []), 'enquiry_type']),
    consent_basis: lookupField(raw, [...(map.consent_basis ?? []), 'consent_basis']).toLowerCase(),
    do_not_contact: isTruthy(lookupField(raw, [...(map.do_not_contact ?? []), 'do_not_contact'])),
    raw: normalized
  }
}

function normalizeConsentBasis(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
}

function isConsentValid(
  row: ParsedReactivationRow,
  pack: ReactivationPack
): { valid: boolean; proof: Record<string, unknown> } {
  const basis = normalizeConsentBasis(row.consent_basis)
  if (!basis) return { valid: false, proof: {} }

  const allowed = new Set(pack.consent_policy.allowed_bases.map((b) => b.toLowerCase()))
  if (!allowed.has(basis)) return { valid: false, proof: {} }

  const proof: Record<string, unknown> = {
    basis,
    source: row.source || null,
    captured_at: row.last_touch_date
  }

  if (basis === 'express') {
    return { valid: true, proof: { ...proof, type: 'express' } }
  }

  if (!row.last_touch_date) return { valid: false, proof: {} }
  const age = daysSince(row.last_touch_date)
  if (age > pack.consent_policy.max_inferred_age_days) {
    return { valid: false, proof: {} }
  }

  return { valid: true, proof: { ...proof, type: 'inferred', age_days: age } }
}

export function segmentForRow(
  row: Pick<ParsedReactivationRow, 'last_touch_date'>,
  pack: ReactivationPack
): string | null {
  if (!row.last_touch_date) return null
  const age = daysSince(row.last_touch_date)
  for (const seg of pack.segments) {
    if (age >= seg.min_days && (seg.max_days == null || age <= seg.max_days)) {
      return seg.id
    }
  }
  return null
}

export function runHygiene(
  row: ParsedReactivationRow,
  pack: ReactivationPack,
  seenMobiles: Set<string>
): HygieneResult {
  if (!row.mobile) {
    return { eligible: null as never, rejected: { row, reason: 'no_mobile' } }
  }
  if (row.do_not_contact) {
    return { eligible: null as never, rejected: { row, reason: 'do_not_contact' } }
  }
  if (seenMobiles.has(row.mobile)) {
    return { eligible: null as never, rejected: { row, reason: 'dup_mobile' } }
  }
  if (!row.last_touch_date) {
    return { eligible: null as never, rejected: { row, reason: 'no_last_touch' } }
  }
  const age = daysSince(row.last_touch_date)
  if (age < pack.lapse_floor_days) {
    return { eligible: null as never, rejected: { row, reason: 'under_lapse' } }
  }

  const consent = isConsentValid(row, pack)
  if (!consent.valid) {
    const reason: HygieneRejectReason = row.consent_basis
      ? 'invalid_consent_basis'
      : 'no_consent'
    return { eligible: null as never, rejected: { row, reason } }
  }

  const segment = segmentForRow(row, pack)
  if (!segment) {
    return { eligible: null as never, rejected: { row, reason: 'under_lapse' } }
  }

  seenMobiles.add(row.mobile)
  return {
    eligible: {
      ...row,
      segment,
      consent_proof: consent.proof
    },
    rejected: null
  }
}

export function firstName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0] || 'there'
}

export function renderReactivationTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return out
}

export function sampleMessages(
  pack: ReactivationPack,
  vars: Record<string, string>
): Array<{ touch_index: number; channel: string; template_id: string; body: string }> {
  return pack.sequence.map((touch) => ({
    touch_index: touch.touch_index,
    channel: touch.channel,
    template_id: touch.template_id,
    body: renderReactivationTemplate(touch.template, vars)
  }))
}

function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map((v) => Number(v))
  return { hour: h || 0, minute: m || 0 }
}

/** Compute next send time respecting quiet hours in client timezone. */
export function computeNextTouchAt(input: {
  baseDate: Date
  dayOffset: number
  quietHours: { start: string; end: string }
  timezone: string
}): Date {
  const target = new Date(input.baseDate.getTime())
  target.setUTCDate(target.getUTCDate() + input.dayOffset)

  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: input.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(target)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 10)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)

  const start = parseHm(input.quietHours.start)
  const end = parseHm(input.quietHours.end)
  const currentMinutes = hour * 60 + minute
  const startMinutes = start.hour * 60 + start.minute
  const endMinutes = end.hour * 60 + end.minute

  if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
    const adjustHours = currentMinutes < startMinutes ? start.hour - hour : 24 - hour + start.hour
    target.setUTCHours(target.getUTCHours() + adjustHours)
    target.setUTCMinutes(start.minute)
  }

  return target
}

export type ReactivationListCounts = {
  imported: number
  rejected: number
  no_consent: number
  eligible: number
  suppressed?: number
  replied?: number
  booked?: number
  showed?: number
  opted_out?: number
}

export async function emitReactivationEvent(
  supabase: SupabaseClient,
  input: {
    clientId: string
    type: string
    nativeId: string
    payload?: Record<string, unknown>
  }
): Promise<void> {
  await appendEvidence(supabase, {
    client_id: input.clientId,
    source: 'reactivation',
    type: input.type,
    native_id: input.nativeId,
    payload: input.payload ?? {}
  })
}

export function classifyInboundReply(
  body: string,
  pack: ReactivationPack
): 'stop' | 'book' | 'complaint' | 'question' | 'default' {
  const lower = body.trim().toLowerCase()
  if (/\b(stop|unsubscribe|opt\s*out|optout)\b/.test(lower)) return 'stop'

  const bookRule = pack.escalation_rules.book
  const bookKeywords = bookRule?.keywords ?? ['book', 'yes', 'y']
  if (bookKeywords.some((kw) => lower.includes(kw))) return 'book'

  if (/\b(wrong number|angry|sue|report|spam|complaint|stop calling)\b/.test(lower)) {
    return 'complaint'
  }
  if (lower.includes('?') || /\b(when|how|what|why|later|not ready)\b/.test(lower)) {
    return 'question'
  }
  return 'default'
}

export function clientTimezone(voice: Record<string, unknown> | null | undefined): string {
  const tz = voice?.timezone
  return typeof tz === 'string' && tz.trim() ? tz.trim() : 'Australia/Sydney'
}

/** Licensed broker display name for merge fields. */
export function resolveBrokerName(clientName: string, dealTerms: unknown): string {
  const root = dealTerms as Record<string, unknown> | null | undefined
  const delivery = root?.delivery as Record<string, unknown> | undefined
  const owner = delivery?.owner_name
  if (typeof owner === 'string' && owner.trim()) return owner.trim()
  return clientName
}

/** Local calendar month bounds in the client timezone. */
export function monthBoundsInTimezone(
  timezone: string,
  now = new Date()
): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)

  function localMidnightUtc(y: number, m: number): Date {
    for (let h = -14; h <= 14; h++) {
      const candidate = new Date(Date.UTC(y, m - 1, 1, h, 0, 0))
      const local = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        hour12: false
      }).formatToParts(candidate)
      const ly = Number(local.find((p) => p.type === 'year')?.value)
      const lm = Number(local.find((p) => p.type === 'month')?.value)
      const ld = Number(local.find((p) => p.type === 'day')?.value)
      const lh = Number(local.find((p) => p.type === 'hour')?.value)
      if (ly === y && lm === m && ld === 1 && lh === 0) return candidate
    }
    return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  }

  const start = localMidnightUtc(year, month)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = localMidnightUtc(nextYear, nextMonth)
  return { start, end }
}

export function capReachedDayKey(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

/** Distinct contacts whose first outbound message falls in the current calendar month. */
export async function countClientMonthlyNewTouches(
  supabase: SupabaseClient,
  clientId: string,
  timezone: string,
  now = new Date()
): Promise<number> {
  const { start, end } = monthBoundsInTimezone(timezone, now)

  const { data: lists } = await supabase
    .from('compass_reactivation_lists')
    .select('id')
    .eq('client_id', clientId)
  const listIds = (lists ?? []).map((row) => row.id)
  if (listIds.length === 0) return 0

  const { data: contacts } = await supabase
    .from('compass_reactivation_contacts')
    .select('id')
    .in('list_id', listIds)
  const contactIds = (contacts ?? []).map((row) => row.id)
  if (contactIds.length === 0) return 0

  const { data: thisMonth } = await supabase
    .from('compass_reactivation_messages')
    .select('contact_id')
    .eq('direction', 'outbound')
    .in('contact_id', contactIds)
    .gte('sent_at', start.toISOString())
    .lt('sent_at', end.toISOString())

  const touchedThisMonth = new Set((thisMonth ?? []).map((row) => row.contact_id))
  if (touchedThisMonth.size === 0) return 0

  const { data: prior } = await supabase
    .from('compass_reactivation_messages')
    .select('contact_id')
    .eq('direction', 'outbound')
    .in('contact_id', [...touchedThisMonth])
    .lt('sent_at', start.toISOString())

  const priorSet = new Set((prior ?? []).map((row) => row.contact_id))
  let count = 0
  for (const id of touchedThisMonth) {
    if (!priorSet.has(id)) count += 1
  }
  return count
}

export async function contactHasOutboundThisMonth(
  supabase: SupabaseClient,
  contactId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<boolean> {
  const { data } = await supabase
    .from('compass_reactivation_messages')
    .select('id')
    .eq('contact_id', contactId)
    .eq('direction', 'outbound')
    .gte('sent_at', monthStart.toISOString())
    .lt('sent_at', monthEnd.toISOString())
    .limit(1)
  return (data ?? []).length > 0
}

export async function contactHasOutboundBefore(
  supabase: SupabaseClient,
  contactId: string,
  before: Date
): Promise<boolean> {
  const { data } = await supabase
    .from('compass_reactivation_messages')
    .select('id')
    .eq('contact_id', contactId)
    .eq('direction', 'outbound')
    .lt('sent_at', before.toISOString())
    .limit(1)
  return (data ?? []).length > 0
}

export async function emitCapReachedEvent(
  supabase: SupabaseClient,
  input: {
    clientId: string
    listId: string
    timezone: string
    cap: number
    count: number
    now?: Date
  }
): Promise<void> {
  const now = input.now ?? new Date()
  const dayKey = capReachedDayKey(input.timezone, now)
  await appendEvidence(supabase, {
    client_id: input.clientId,
    source: 'reactivation',
    type: 'cap.reached',
    native_id: `cap-${input.listId}-${dayKey}`,
    idempotency_key: `reactivation:cap.reached:${input.listId}:${dayKey}`,
    payload: {
      list_id: input.listId,
      cap: input.cap,
      monthly_new_touches: input.count,
      day: dayKey
    }
  })
}

export async function rollupReactivationListCounts(
  supabase: SupabaseClient,
  listId: string,
  existing: ReactivationListCounts
): Promise<ReactivationListCounts> {
  const { data: contacts } = await supabase
    .from('compass_reactivation_contacts')
    .select('state')
    .eq('list_id', listId)

  const tallies = {
    suppressed: 0,
    replied: 0,
    booked: 0,
    showed: 0,
    opted_out: 0
  }
  for (const row of contacts ?? []) {
    if (row.state === 'suppressed') tallies.suppressed += 1
    else if (row.state === 'replied') tallies.replied += 1
    else if (row.state === 'booked') tallies.booked += 1
    else if (row.state === 'showed') tallies.showed += 1
    else if (row.state === 'opted_out') tallies.opted_out += 1
  }

  const merged: ReactivationListCounts = { ...existing, ...tallies }
  await supabase
    .from('compass_reactivation_lists')
    .update({ counts: merged, updated_at: new Date().toISOString() })
    .eq('id', listId)

  return merged
}

export async function activateReactivationList(
  supabase: SupabaseClient,
  input: {
    listId: string
    clientId: string
    licenseeSignoff?: boolean
  }
): Promise<{ ok: boolean; enrolled: number; error?: string }> {
  const { data: list, error } = await supabase
    .from('compass_reactivation_lists')
    .select('id,client_id,pack_id,status')
    .eq('id', input.listId)
    .eq('client_id', input.clientId)
    .maybeSingle()

  if (error || !list) return { ok: false, enrolled: 0, error: 'not_found' }
  if (list.status === 'active') return { ok: false, enrolled: 0, error: 'already_active' }

  const pack = loadReactivationPack(list.pack_id)
  if (pack.compliance_gate.licensee_signoff_required && !input.licenseeSignoff) {
    return { ok: false, enrolled: 0, error: 'licensee_signoff_required' }
  }

  const { data: client } = await supabase
    .from('compass_clients')
    .select('id,name,voice,deal_terms')
    .eq('id', input.clientId)
    .maybeSingle()
  if (!client) return { ok: false, enrolled: 0, error: 'client_not_found' }

  const timezone = clientTimezone((client.voice ?? {}) as Record<string, unknown>)
  const now = new Date()
  const activatedAt = now.toISOString()
  const cap = pack.caps.monthly_contact_cap ?? 1000
  const monthlyCount = await countClientMonthlyNewTouches(supabase, input.clientId, timezone, now)
  const enrollSlots = Math.max(0, cap - monthlyCount)

  const { data: contacts } = await supabase
    .from('compass_reactivation_contacts')
    .select('id,state,segment,last_touch_date')
    .eq('list_id', input.listId)
    .eq('state', 'pending')

  let enrolled = 0
  const firstTouch = pack.sequence[0]
  if (!firstTouch) return { ok: false, enrolled: 0, error: 'empty_sequence' }

  for (const contact of (contacts ?? []).slice(0, enrollSlots)) {
    const nextAt = computeNextTouchAt({
      baseDate: now,
      dayOffset: firstTouch.day_offset,
      quietHours: pack.quiet_hours,
      timezone
    })
    await supabase
      .from('compass_reactivation_contacts')
      .update({
        state: 'enrolled',
        touch_index: 0,
        next_touch_at: nextAt.toISOString(),
        last_event_at: activatedAt,
        updated_at: activatedAt
      })
      .eq('id', contact.id)

    await emitReactivationEvent(supabase, {
      clientId: input.clientId,
      type: 'sequence.enrolled',
      nativeId: `enroll-${contact.id}`,
      payload: { list_id: input.listId, contact_id: contact.id, segment: contact.segment }
    })
    enrolled += 1
  }

  const compliance =
    pack.compliance_gate.licensee_signoff_required && input.licenseeSignoff
      ? { licensee_signoff: true, signed_off_at: activatedAt }
      : {}

  await supabase
    .from('compass_reactivation_lists')
    .update({
      status: 'active',
      activated_at: activatedAt,
      compliance,
      updated_at: activatedAt
    })
    .eq('id', input.listId)

  return { ok: true, enrolled }
}

export { loadReactivationPack, type ReactivationPack }
