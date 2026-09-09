import 'server-only'
import { createSign } from 'node:crypto'
import { candidateSlots, overlaps, type Busy } from './calendar'
import type { Appointment, DeliveryContext, DeliveryProviders, Slot } from './types'
import { ProviderError } from './worker'

type ProviderOptions = { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; busy?: (ctx: DeliveryContext) => Promise<Busy[]>; deadline?: number }

/** Demo providers have no network dependency and cannot send to a real phone or calendar. */
export function createDeliveryProviders(options: ProviderOptions = {}): DeliveryProviders {
  const fetcher = options.fetch ?? fetch; const env = options.env ?? process.env
  const live = (ctx: DeliveryContext) => {
    if (ctx.account.mode !== 'live' || env.COMPASS_DELIVERY_LIVE !== '1') throw new ProviderError('live_delivery_disabled')
  }
  const request = async (url: string, init: RequestInit = {}, mutation = false): Promise<Response> => {
    const remaining = options.deadline ? options.deadline - Date.now() : 12_000
    if (remaining < 1000) throw new ProviderError('worker_time_budget_reached', false, true)
    try { return await fetcher(url, { ...init, signal: AbortSignal.timeout(Math.min(12_000, remaining)), redirect: 'error' }) }
    catch { throw new ProviderError('provider_connection_failed', mutation, !mutation) }
  }
  const json = async (res: Response, mutation = false): Promise<Record<string, unknown>> => {
    try { return await res.json() as Record<string, unknown> }
    catch { throw new ProviderError('provider_response_unreadable', mutation, !mutation) }
  }
  let cachedToken: { value: string; expiresAt: number } | undefined
  const token = async () => {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
    let key: { client_email: string; private_key: string }
    try { key = JSON.parse(env.GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON || '') } catch { throw new ProviderError('calendar_credentials_missing') }
    if (!key.client_email || !key.private_key) throw new ProviderError('calendar_credentials_invalid')
    const now = Math.floor(Date.now() / 1000)
    const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/calendar', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
    const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')}`
    const res = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })
    if (!res.ok) throw new ProviderError('calendar_token_failed', false, res.status >= 500)
    const value = await json(res) as { access_token?: string; expires_in?: number }
    if (!value.access_token) throw new ProviderError('calendar_token_missing')
    cachedToken = { value: value.access_token, expiresAt: Date.now() + (value.expires_in ?? 300) * 1000 }
    return value.access_token
  }
  const calendarRequest = async (ctx: DeliveryContext, path: string, init: RequestInit = {}, mutation = false) => {
    live(ctx)
    if (!ctx.account.calendar_id) throw new ProviderError('calendar_not_configured')
    return request(`https://www.googleapis.com/calendar/v3${path}`, { ...init, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...init.headers } }, mutation)
  }
  const eventPath = (ctx: DeliveryContext, id?: string) => `/calendars/${encodeURIComponent(ctx.account.calendar_id!)}/events${id ? `/${encodeURIComponent(id)}` : ''}`
  const freeBusy = async (ctx: DeliveryContext, start: string, end: string): Promise<Busy[]> => {
    const res = await calendarRequest(ctx, '/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id: ctx.account.calendar_id }] }) })
    if (!res.ok) throw new ProviderError('calendar_availability_failed', false, res.status >= 500 || res.status === 429)
    const data = await json(res) as { calendars?: Record<string, { busy?: Busy[]; errors?: unknown[] }> }
    const calendar = data.calendars?.[ctx.account.calendar_id!]
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new ProviderError('calendar_availability_unknown')
    return calendar.busy
  }
  const assertEvent = (event: Record<string, unknown>, ctx: DeliveryContext, id: string) => {
    const props = (event.extendedProperties as { private?: Record<string, string> } | undefined)?.private
    if (event.id !== id || props?.compass_delivery_enquiry !== ctx.enquiry.id || props?.compass_delivery_account !== ctx.account.id) throw new ProviderError('calendar_event_identity_mismatch')
  }
  const eventBusy = async (ctx: DeliveryContext, start: string, end: string, ownId: string): Promise<Busy[]> => {
    const busy: Busy[] = []; let pageToken: string | undefined
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: 'true', maxResults: '250', ...(pageToken ? { pageToken } : {}) })
      const res = await calendarRequest(ctx, `${eventPath(ctx)}?${query}`)
      if (!res.ok) throw new ProviderError('calendar_availability_failed', false, res.status >= 500 || res.status === 429)
      const data = await json(res) as { items?: Array<Record<string, unknown>>; nextPageToken?: string }
      if (!Array.isArray(data.items)) throw new ProviderError('calendar_availability_unknown')
      for (const event of data.items) {
        if (event.id === ownId) { assertEvent(event, ctx, ownId); continue }
        if (event.status === 'cancelled' || event.transparency === 'transparent') continue
        const from = event.start as { dateTime?: string; date?: string } | undefined
        const until = event.end as { dateTime?: string; date?: string } | undefined
        if (from?.dateTime && until?.dateTime) busy.push({ start: from.dateTime, end: until.dateTime })
        // All-day dates carry no UTC offset; conservatively block the entire local date in any timezone.
        else if (from?.date && until?.date) busy.push({ start: new Date(Date.parse(from.date) - 14 * 3600_000).toISOString(), end: new Date(Date.parse(until.date) + 14 * 3600_000).toISOString() })
        else throw new ProviderError('calendar_availability_unknown')
      }
      pageToken = data.nextPageToken
      if (!pageToken) return busy
    }
    throw new ProviderError('calendar_availability_incomplete')
  }
  return {
    async slots(ctx) {
      const reserved = await options.busy?.(ctx) ?? []
      if (ctx.account.mode === 'demo') return candidateSlots(ctx.now, ctx.account.config, reserved)
      const end = new Date(Date.parse(ctx.now) + 22 * 86400_000).toISOString()
      const own = ctx.enquiry.state.appointment
      const busy = own?.status === 'confirmed' ? await eventBusy(ctx, ctx.now, end, own.id) : await freeBusy(ctx, ctx.now, end)
      return candidateSlots(ctx.now, ctx.account.config, [...reserved, ...busy])
    },
    async book(ctx, slot, appointmentId) {
      if (ctx.account.mode === 'demo') return { id: appointmentId, slot, status: 'confirmed' }
      const id = appointmentId.startsWith('sf') ? appointmentId : `sf${appointmentId.replace(/[^a-v0-9]/g, '')}`
      const existing = await calendarRequest(ctx, eventPath(ctx, id))
      let current: Record<string, unknown> | null = null
      if (existing.ok) {
        current = await json(existing); assertEvent(current!, ctx, id)
        const start = current!.start as { dateTime?: string }
        const end = current!.end as { dateTime?: string }
        if (current!.status !== 'cancelled' && Date.parse(start.dateTime ?? '') === Date.parse(slot.start) && Date.parse(end.dateTime ?? '') === Date.parse(slot.end)) return { id, slot, status: 'confirmed' }
      } else if (existing.status !== 404) throw new ProviderError('calendar_reconciliation_failed', false, existing.status >= 500)
      if (current?.status === 'cancelled') throw new ProviderError('calendar_event_cancelled_requires_review')
      const previous = ctx.enquiry.state.appointment
      if (current && previous?.status === 'confirmed' && (
        Date.parse((current.start as { dateTime?: string })?.dateTime ?? '') !== Date.parse(previous.slot.start) ||
        Date.parse((current.end as { dateTime?: string })?.dateTime ?? '') !== Date.parse(previous.slot.end))) throw new ProviderError('calendar_changed_by_staff')
      if (current && !current.etag) throw new ProviderError('calendar_version_missing')
      // Updating an existing appointment is constrained by ETag and verified provider identity.
      const buffered = { start: new Date(Date.parse(slot.start) - ctx.account.config.bufferMinutes * 60_000).toISOString(), end: new Date(Date.parse(slot.end) + ctx.account.config.bufferMinutes * 60_000).toISOString() }
      const busy = current ? await eventBusy(ctx, buffered.start, buffered.end, id) : await freeBusy(ctx, buffered.start, buffered.end)
      if (busy.some(b => overlaps(b, buffered))) throw new ProviderError('slot_unavailable')
      const body = {
        id, summary: `${ctx.account.config.businessName} — installation assessment`, location: ctx.enquiry.state.facts.address,
        description: `Homeowner: ${ctx.enquiry.name}\nPhone: ${ctx.enquiry.phone}\nService: ducted replacement\nTimeframe: ${ctx.enquiry.state.facts.timeframe}`,
        start: { dateTime: slot.start, timeZone: ctx.account.config.timezone }, end: { dateTime: slot.end, timeZone: ctx.account.config.timezone },
        extendedProperties: { private: { compass_delivery_enquiry: ctx.enquiry.id, compass_delivery_account: ctx.account.id } }
      }
      const res = await calendarRequest(ctx, eventPath(ctx, current ? id : undefined), {
        method: current ? 'PUT' : 'POST', headers: current?.etag ? { 'If-Match': String(current.etag) } : {}, body: JSON.stringify(body)
      }, true)
      if (!res.ok) throw new ProviderError(res.status === 412 ? 'calendar_changed_by_staff' : 'calendar_write_failed', res.status >= 500 || res.status === 409)
      const saved = await json(res, true)
      try {
        assertEvent(saved, ctx, id)
        if (saved.status === 'cancelled' || Date.parse((saved.start as { dateTime?: string })?.dateTime ?? '') !== Date.parse(slot.start) || Date.parse((saved.end as { dateTime?: string })?.dateTime ?? '') !== Date.parse(slot.end)) throw new Error('Unexpected calendar state')
      } catch { throw new ProviderError('calendar_write_result_unknown', true) }
      return { id, slot, status: 'confirmed' }
    },
    async cancel(ctx, appointment) {
      if (ctx.account.mode === 'demo') return
      const check = await calendarRequest(ctx, eventPath(ctx, appointment.id))
      if (check.status === 404 || check.status === 410) return
      if (!check.ok) throw new ProviderError('calendar_reconciliation_failed')
      const existing = await json(check); assertEvent(existing, ctx, appointment.id)
      if (existing.status === 'cancelled') return
      if (!existing.etag) throw new ProviderError('calendar_version_missing')
      const res = await calendarRequest(ctx, eventPath(ctx, appointment.id), { method: 'DELETE', headers: existing.etag ? { 'If-Match': String(existing.etag) } : {} }, true)
      if (!res.ok && res.status !== 404 && res.status !== 410) throw new ProviderError('calendar_cancel_failed', res.status >= 500)
    },
    async sms(ctx, body) {
      if (ctx.account.mode === 'demo') return { id: `demo-${ctx.job.id}`, status: 'delivered' }
      live(ctx)
      const sid = env.TWILIO_ACCOUNT_SID; const secret = env.TWILIO_AUTH_TOKEN; const origin = env.COMPASS_DELIVERY_PUBLIC_ORIGIN
      if (!sid || !secret || !origin || !ctx.account.twilio_number || ctx.account.twilio_account_sid !== sid) throw new ProviderError('messaging_credentials_not_bound')
      const callback = new URL('/api/delivery-engine/webhooks/twilio/status', origin)
      if (callback.protocol !== 'https:') throw new ProviderError('public_origin_requires_https')
      callback.searchParams.set('job', ctx.job.id)
      const res = await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${secret}`).toString('base64')}` },
        body: new URLSearchParams({ To: ctx.enquiry.phone, From: ctx.account.twilio_number, Body: body, StatusCallback: callback.toString() })
      }, true)
      if (!res.ok) throw new ProviderError('sms_provider_rejected', res.status >= 500)
      const sent = await json(res, true) as { sid?: string; status?: string }
      if (!sent.sid) throw new ProviderError('sms_provider_response_unknown', true)
      if (sent.status === 'failed' || sent.status === 'undelivered') throw new ProviderError('sms_delivery_failed')
      return { id: sent.sid, status: sent.status || 'accepted' }
    },
    async crm(ctx) {
      if (ctx.account.mode === 'demo') return { id: `demo-opportunity-${ctx.enquiry.id}`, status: 'synced' }
      return { id: ctx.enquiry.id, status: 'manual' }
    }
  }
}
