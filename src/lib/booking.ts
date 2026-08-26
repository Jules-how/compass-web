import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TradePack, UrgencyValue } from '@/lib/voice-pack'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type BookingSlot = {
  start: string
  end: string
  spoken: string
}

export type BookingClientConfig = {
  clientId: string
  calendarId: string
  timezone: string
  businessName: string
}

type ServiceAccountKey = {
  client_email: string
  private_key: string
  token_uri?: string
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null
const slotLocks = new Map<string, number>()
const LOCK_TTL_MS = 30_000

export function bookingGrantEmail(): string {
  return process.env.BOOKING_GRANT_EMAIL?.trim() || 'bookings@switchflow.agency'
}

function serviceAccountKey(): ServiceAccountKey | null {
  const raw =
    process.env.GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServiceAccountKey
  } catch {
    return null
  }
}

export function bookingAuthConfigured(): boolean {
  return Boolean(serviceAccountKey())
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }
  const key = serviceAccountKey()
  if (!key?.client_email || !key.private_key) throw new Error('booking_auth_not_configured')

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claim = Buffer.from(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: key.token_uri || TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  ).toString('base64url')

  const crypto = await import('node:crypto')
  const signInput = `${header}.${claim}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signInput)
  const signature = signer.sign(key.private_key, 'base64url')
  const jwt = `${signInput}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error || 'booking_token_failed')
  }
  cachedAccessToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000
  }
  return body.access_token
}

function isGrantBrokenStatus(status: number): boolean {
  return status === 403 || status === 404
}

export async function markCalendarGrantBroken(
  supabase: SupabaseClient,
  clientId: string
): Promise<void> {
  const { data } = await supabase.from('compass_clients').select('voice').eq('id', clientId).maybeSingle()
  const voice = (data?.voice as Record<string, unknown>) ?? {}
  await supabase
    .from('compass_clients')
    .update({
      voice: {
        ...voice,
        calendar_grant_broken: true,
        probe_ok: false
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', clientId)
}

async function calendarFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
}

export type FreeBusyResult =
  | { ok: true; busy: Array<{ start: string; end: string }> }
  | { ok: false; grantBroken: boolean }

export async function queryFreeBusy(
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<FreeBusyResult> {
  const accessToken = await getAccessToken()
  const res = await calendarFetch(accessToken, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }]
    })
  })
  if (!res.ok) {
    return { ok: false, grantBroken: isGrantBrokenStatus(res.status) }
  }
  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>
  }
  const busy = json.calendars?.[calendarId]?.busy ?? []
  return { ok: true, busy }
}

function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

function weekdayShort(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short' }).format(date).toLowerCase()
}

function parseHourMinute(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { hour: h ?? 0, minute: m ?? 0 }
}

function zonedParts(date: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute')
  }
}

function makeZonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offset = tzOffsetMinutes(guess, tz)
  return new Date(guess.getTime() - offset * 60_000)
}

function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = zonedParts(date, tz)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return (asUtc - date.getTime()) / 60_000
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart
}

function formatSpokenSlot(start: Date, tz: string): string {
  const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long' }).format(start)
  const time = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(start)
  return `${weekday} at ${time}`
}

function urgencyWindow(
  urgency: UrgencyValue,
  tz: string,
  pack: TradePack
): { timeMin: Date; timeMax: Date } {
  const now = new Date()
  const parts = zonedParts(now, tz)
  let start = makeZonedDate(parts.year, parts.month, parts.day, parts.hour, parts.minute, tz)
  if (urgency === 'today') {
    if (parts.hour >= pack.booking_rules.same_day_cutoff_hour) {
      start = new Date(start.getTime() + 24 * 60 * 60_000)
    }
    const end = new Date(start.getTime() + 24 * 60 * 60_000)
    return { timeMin: now, timeMax: end }
  }
  if (urgency === 'this_week') {
    return { timeMin: now, timeMax: new Date(now.getTime() + 7 * 24 * 60 * 60_000) }
  }
  return { timeMin: now, timeMax: new Date(now.getTime() + 21 * 24 * 60 * 60_000) }
}

export function acquireSlotLock(clientId: string, slotStart: string): boolean {
  const key = `${clientId}:${slotStart}`
  const now = Date.now()
  const existing = slotLocks.get(key)
  if (existing && existing > now) return false
  slotLocks.set(key, now + LOCK_TTL_MS)
  return true
}

export function releaseSlotLock(clientId: string, slotStart: string): void {
  slotLocks.delete(`${clientId}:${slotStart}`)
}

/** Exported for tests */
export function clearSlotLocks(): void {
  slotLocks.clear()
}

export async function findAvailableSlots(input: {
  config: BookingClientConfig
  pack: TradePack
  urgency: UrgencyValue
  limit?: number
}): Promise<{ slots: BookingSlot[]; grantBroken: boolean }> {
  const { config, pack, urgency } = input
  const limit = input.limit ?? 3
  const tz = config.timezone || pack.timezone
  const { timeMin, timeMax } = urgencyWindow(urgency, tz, pack)
  const freeBusy = await queryFreeBusy(config.calendarId, timeMin.toISOString(), timeMax.toISOString())
  if (!freeBusy.ok) {
    return { slots: [], grantBroken: freeBusy.grantBroken }
  }

  const busy = freeBusy.busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
  const slotMs = pack.booking_rules.slot_minutes * 60_000
  const bufferMs = pack.booking_rules.buffer_minutes * 60_000
  const slots: BookingSlot[] = []

  let cursor = new Date(timeMin)
  while (cursor < timeMax && slots.length < limit) {
    const wd = weekdayShort(cursor, tz)
    const hours = pack.booking_rules.hours[wd.slice(0, 3)] ?? pack.booking_rules.hours[wd]
    if (!hours || hours.length < 2) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
      continue
    }
    const open = parseHourMinute(hours[0])
    const close = parseHourMinute(hours[1])
    const parts = zonedParts(cursor, tz)
    let slotStart = makeZonedDate(parts.year, parts.month, parts.day, open.hour, open.minute, tz)
    const dayClose = makeZonedDate(parts.year, parts.month, parts.day, close.hour, close.minute, tz)

    while (slotStart < dayClose && slots.length < limit) {
      if (slotStart < timeMin) {
        slotStart = new Date(slotStart.getTime() + slotMs + bufferMs)
        continue
      }
      const slotEnd = new Date(slotStart.getTime() + slotMs)
      const bufferedEnd = new Date(slotEnd.getTime() + bufferMs)
      const conflict = busy.some((b) => overlaps(slotStart, bufferedEnd, b.start, b.end))
      if (!conflict && slotEnd <= dayClose) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          spoken: formatSpokenSlot(slotStart, tz)
        })
      }
      slotStart = new Date(slotStart.getTime() + slotMs + bufferMs)
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
    cursor = makeZonedDate(
      zonedParts(cursor, tz).year,
      zonedParts(cursor, tz).month,
      zonedParts(cursor, tz).day,
      0,
      0,
      tz
    )
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
  }

  return { slots, grantBroken: false }
}

export async function insertCalendarEvent(input: {
  config: BookingClientConfig
  pack: TradePack
  slotStart: string
  slotEnd: string
  jobTypeLabel: string
  suburb: string
  urgency: string
  callerName?: string
  callerPhone?: string
  callId?: string
  notes?: string
}): Promise<{ ok: true; eventId: string } | { ok: false; grantBroken: boolean; reason?: string }> {
  const lockKey = input.config.clientId
  if (!acquireSlotLock(lockKey, input.slotStart)) {
    return { ok: false, grantBroken: false, reason: 'slot_taken' }
  }

  try {
    const accessToken = await getAccessToken()
    const tz = input.config.timezone || input.pack.timezone
    const summary = `${input.config.businessName} job — ${input.suburb}`
    const description = [
      `Job: ${input.jobTypeLabel}`,
      `Urgency: ${input.urgency}`,
      input.callerName ? `Caller: ${input.callerName}` : null,
      input.callerPhone ? `Phone: ${input.callerPhone}` : null,
      input.notes ? `Notes: ${input.notes}` : null
    ]
      .filter(Boolean)
      .join('\n')

    const res = await calendarFetch(
      accessToken,
      `/calendars/${encodeURIComponent(input.config.calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: input.slotStart, timeZone: tz },
          end: { dateTime: input.slotEnd, timeZone: tz },
          extendedProperties: {
            private: {
              switchflow_client_id: input.config.clientId,
              switchflow_call_id: input.callId ?? ''
            }
          }
        })
      }
    )
    if (!res.ok) {
      return { ok: false, grantBroken: isGrantBrokenStatus(res.status) }
    }
    const json = (await res.json()) as { id?: string }
    if (!json.id) return { ok: false, grantBroken: false, reason: 'missing_event_id' }
    return { ok: true, eventId: json.id }
  } finally {
    releaseSlotLock(lockKey, input.slotStart)
  }
}

export async function deleteCalendarEvent(calendarId: string, eventId: string): Promise<boolean> {
  const accessToken = await getAccessToken()
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  )
  return res.ok || res.status === 404
}

export async function probeCalendarGrant(
  calendarId: string
): Promise<{ ok: boolean; grantBroken: boolean; eventId?: string }> {
  const now = new Date()
  const end = new Date(now.getTime() + 15 * 60_000)
  const freeBusy = await queryFreeBusy(calendarId, now.toISOString(), end.toISOString())
  if (!freeBusy.ok) return { ok: false, grantBroken: freeBusy.grantBroken }

  const accessToken = await getAccessToken()
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: 'Switchflow calendar probe',
        start: { dateTime: now.toISOString(), timeZone: 'Australia/Sydney' },
        end: { dateTime: end.toISOString(), timeZone: 'Australia/Sydney' },
        visibility: 'private'
      })
    }
  )
  if (!res.ok) return { ok: false, grantBroken: isGrantBrokenStatus(res.status) }
  const json = (await res.json()) as { id?: string }
  if (!json.id) return { ok: false, grantBroken: false }
  await deleteCalendarEvent(calendarId, json.id)
  return { ok: true, grantBroken: false, eventId: json.id }
}

/** Exported for tests */
export { slotLocks, LOCK_TTL_MS, overlaps, urgencyWindow }
