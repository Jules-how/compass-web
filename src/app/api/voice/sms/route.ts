import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import {
  findAvailableSlots,
  insertCalendarEvent,
  markCalendarGrantBroken,
  type BookingClientConfig
} from '@/lib/booking'
import { lookupClientByTwilioNumber, normalizePhone } from '@/lib/voice-client'
import { advanceSmsSession, getSmsSessionStore, isStopMessage, urgencyFromTimeHint } from '@/lib/voice-sms'
import { formatConfirmSms, isSmsSuppressed, sendTwilioSms, suppressSms } from '@/lib/voice-twilio'
import { renderPackSms } from '@/lib/voice-pack'
import { formBodyToRecord, verifyTwilioSignature } from '@/lib/voice-webhook-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const smsSessions = getSmsSessionStore()

function sessionKey(clientId: string, phone: string): string {
  return `${clientId}:${phone}`
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
  const signature = request.headers.get('x-twilio-signature')
  const form = await request.formData()
  const params = formBodyToRecord(form)

  const url = process.env.COMPASS_PUBLIC_URL
    ? `https://${process.env.COMPASS_PUBLIC_URL.replace(/^https?:\/\//, '')}/api/voice/sms`
    : request.url

  if (authToken && !verifyTwilioSignature(authToken, signature, url, params)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const from = normalizePhone(params.From) ?? params.From
  const to = normalizePhone(params.To) ?? params.To
  const body = params.Body ?? ''

  const admin = getPortalAdminClient()
  const ctx = await lookupClientByTwilioNumber(admin, to)
  if (!ctx || !from) {
    return twiml('')
  }

  const businessName = ctx.name
  const published =
    String(ctx.onboarding.public_number ?? ctx.voice.public_number ?? '') ||
    businessName

  if (isStopMessage(body)) {
    await suppressSms(admin, ctx.clientId, from, 'stop')
    const ack = renderPackSms(ctx.pack, 'stop_ack', {
      BusinessName: businessName,
      PublishedNumber: published
    })
    return twiml(ack)
  }

  if (await isSmsSuppressed(admin, ctx.clientId, from)) {
    return twiml('')
  }

  const key = sessionKey(ctx.clientId, from)
  const opener = renderPackSms(ctx.pack, 'inbound_opener', { BusinessName: businessName })
  const prior = smsSessions.get(key) ?? null
  const transition = advanceSmsSession(prior, body, opener)
  smsSessions.set(key, transition.session)

  if (transition.readyToBook && transition.parsed.suburb && transition.parsed.job_type) {
    const calendarId =
      String(ctx.voice.calendar_id ?? ctx.onboarding.google_calendar_id ?? '')
    const urgency = urgencyFromTimeHint(transition.parsed.time_hint ?? 'flexible')
    const bookingConfig: BookingClientConfig = {
      clientId: ctx.clientId,
      calendarId,
      timezone: String(ctx.voice.timezone ?? ctx.pack.timezone),
      businessName
    }
    const slots = await findAvailableSlots({
      config: bookingConfig,
      pack: ctx.pack,
      urgency,
      limit: 1
    })
    if (slots.grantBroken) {
      await markCalendarGrantBroken(admin, ctx.clientId)
      return twiml('We cannot book by text right now. Someone will call you back.')
    }
    const slot = slots.slots[0]
    if (!slot) {
      return twiml('No slots available right now. Someone will call you back to book.')
    }
    const booked = await insertCalendarEvent({
      config: bookingConfig,
      pack: ctx.pack,
      slotStart: slot.start,
      slotEnd: slot.end,
      jobTypeLabel: transition.parsed.job_type,
      suburb: transition.parsed.suburb,
      urgency,
      callerPhone: from
    })
    if (!booked.ok) {
      return twiml('That slot was just taken. Reply with another time and we will try again.')
    }
    const weekday = new Intl.DateTimeFormat('en-AU', {
      timeZone: bookingConfig.timezone,
      weekday: 'long'
    }).format(new Date(slot.start))
    const time = new Intl.DateTimeFormat('en-AU', {
      timeZone: bookingConfig.timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(slot.start))
    const confirm = formatConfirmSms(ctx.pack, {
      businessName,
      weekday,
      time,
      suburb: transition.parsed.suburb
    })
    smsSessions.delete(key)
    return twiml(confirm)
  }

  if (transition.reply) {
    return twiml(transition.reply)
  }

  return twiml('')
}

function twiml(message: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' }
  })
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET() {
  return portalJson({ ok: true, service: 'voice-sms' })
}
