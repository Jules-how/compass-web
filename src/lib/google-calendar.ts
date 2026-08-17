import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { decryptSecret, encryptSecret } from '@/lib/ad-token-crypto'

export const GOOGLE_CALENDAR_REFRESH_SETTING_ID = 'integrations.google_calendar.refresh_token'
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export type GoogleCalendarEventBody = {
  summary: string
  description?: string
  start: { date: string }
  end: { date: string }
  transparency: 'transparent'
  visibility?: 'private'
  reminders?: { useDefault: false; overrides: [] }
  extendedProperties?: { private?: Record<string, string> }
}

export function googleCalendarOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  )
}

export function googleCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary'
}

export function googleCalendarAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  if (!clientId) throw new Error('google_calendar_not_configured')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeGoogleCalendarCode(input: {
  code: string
  redirectUri: string
}): Promise<{ refreshToken: string }> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('google_calendar_not_configured')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code'
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.refresh_token) {
    throw new Error(body.error_description || body.error || 'google_calendar_token_exchange_failed')
  }
  return { refreshToken: body.refresh_token }
}

export async function loadGoogleCalendarRefreshToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('compass_settings')
    .select('value')
    .eq('id', GOOGLE_CALENDAR_REFRESH_SETTING_ID)
    .maybeSingle()
  const raw = typeof data?.value === 'string' ? data.value.trim() : ''
  if (!raw) return null
  try {
    return decryptSecret(raw)
  } catch {
    return raw
  }
}

export async function saveGoogleCalendarRefreshToken(
  supabase: SupabaseClient,
  refreshToken: string
): Promise<void> {
  const stamp = new Date().toISOString()
  const { error } = await supabase.from('compass_settings').upsert({
    id: GOOGLE_CALENDAR_REFRESH_SETTING_ID,
    value: encryptSecret(refreshToken),
    is_secret: 1,
    scope: 'integrations',
    updated_at: stamp,
    mirrored_at: stamp
  })
  if (error) throw new Error(error.message)
}

export async function clearGoogleCalendarRefreshToken(supabase: SupabaseClient): Promise<void> {
  await supabase.from('compass_settings').delete().eq('id', GOOGLE_CALENDAR_REFRESH_SETTING_ID)
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('google_calendar_not_configured')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || 'google_calendar_refresh_failed')
  }
  return body.access_token
}

async function calendarFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const calendarId = encodeURIComponent(googleCalendarId())
  return fetch(`${CALENDAR_API}/calendars/${calendarId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
}

export async function upsertGoogleCalendarEvent(input: {
  refreshToken: string
  eventId: string | null
  body: GoogleCalendarEventBody
}): Promise<string> {
  const accessToken = await accessTokenFromRefresh(input.refreshToken)
  if (input.eventId) {
    const patch = await calendarFetch(accessToken, `/events/${encodeURIComponent(input.eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input.body)
    })
    if (patch.ok) {
      const json = (await patch.json()) as { id?: string }
      if (json.id) return json.id
    }
    if (patch.status !== 404) {
      const detail = await patch.text().catch(() => '')
      throw new Error(detail || `google_calendar_patch_failed (${patch.status})`)
    }
  }

  const create = await calendarFetch(accessToken, '/events', {
    method: 'POST',
    body: JSON.stringify(input.body)
  })
  if (!create.ok) {
    const detail = await create.text().catch(() => '')
    throw new Error(detail || `google_calendar_create_failed (${create.status})`)
  }
  const json = (await create.json()) as { id?: string }
  if (!json.id) throw new Error('google_calendar_create_missing_id')
  return json.id
}

export async function deleteGoogleCalendarEvent(input: {
  refreshToken: string
  eventId: string
}): Promise<void> {
  const accessToken = await accessTokenFromRefresh(input.refreshToken)
  const res = await calendarFetch(accessToken, `/events/${encodeURIComponent(input.eventId)}`, {
    method: 'DELETE'
  })
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `google_calendar_delete_failed (${res.status})`)
  }
}
