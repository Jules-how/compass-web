import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import {
  findAvailableSlots,
  insertCalendarEvent,
  markCalendarGrantBroken,
  type BookingClientConfig
} from '@/lib/booking'
import { lookupClientByTwilioNumber } from '@/lib/voice-client'
import { sendOwnerAlertSms } from '@/lib/voice-twilio'
import { verifyRetellSignature } from '@/lib/voice-webhook-auth'
import type { UrgencyValue } from '@/lib/voice-pack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RetellToolRequest = {
  call?: {
    call_id?: string
    from_number?: string
    to_number?: string
    metadata?: Record<string, string>
  }
  name?: string
  args?: Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asUrgency(value: unknown): UrgencyValue {
  const v = asString(value)
  if (v === 'today' || v === 'this_week' || v === 'flexible') return v
  return 'flexible'
}

async function resolveContext(call: RetellToolRequest['call']) {
  const admin = getPortalAdminClient()
  const clientId = call?.metadata?.compass_client_id
  if (clientId) {
    const { data } = await admin
      .from('compass_clients')
      .select('id,name,voice')
      .eq('id', clientId)
      .maybeSingle()
    if (data?.voice) {
      const twilio = (data.voice as { twilio_number?: string }).twilio_number
      const ctx = await lookupClientByTwilioNumber(admin, twilio || call?.to_number || '')
      if (ctx) return ctx
    }
  }
  return lookupClientByTwilioNumber(admin, asString(call?.to_number))
}

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-retell-signature')
  const secret = process.env.RETELL_WEBHOOK_SECRET?.trim()
  if (secret && !verifyRetellSignature(raw, signature, secret)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: RetellToolRequest
  try {
    payload = JSON.parse(raw) as RetellToolRequest
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const name = asString(payload.name)
  const args = payload.args ?? {}
  const call = payload.call

  try {
    const ctx = await resolveContext(call)
    if (!ctx) {
      return portalJson({ error: 'client_not_found' }, { status: 404 })
    }

    const admin = getPortalAdminClient()
    const calendarId =
      asString(ctx.voice.calendar_id) || asString(ctx.onboarding.google_calendar_id)
    const bookingConfig: BookingClientConfig = {
      clientId: ctx.clientId,
      calendarId,
      timezone: asString(ctx.voice.timezone) || ctx.pack.timezone,
      businessName: ctx.name
    }
    const fromNumber = asString(call?.from_number)
    const callId = asString(call?.call_id)
    const twilioFrom = asString(ctx.voice.twilio_number)

    if (name === 'check_availability') {
      if (!calendarId) {
        return portalJson({ slots: [], calendar_ok: false })
      }
      const urgency = asUrgency(args.urgency)
      const result = await findAvailableSlots({
        config: bookingConfig,
        pack: ctx.pack,
        urgency
      })
      if (result.grantBroken) {
        await markCalendarGrantBroken(admin, ctx.clientId)
        return portalJson({ slots: [], calendar_ok: false })
      }
      return portalJson({
        slots: result.slots.map((s) => ({ start: s.start, spoken: s.spoken })),
        calendar_ok: true
      })
    }

    if (name === 'book_slot') {
      const slotStart = asString(args.slot_start)
      const jobTypeId = asString(args.job_type_id)
      const suburb = asString(args.suburb)
      const urgency = asUrgency(args.urgency)
      const callerName = asString(args.caller_name)
      const job = ctx.pack.job_types.find((jt) => jt.id === jobTypeId)
      const slotMinutes = ctx.pack.booking_rules.slot_minutes
      const slotEnd = new Date(new Date(slotStart).getTime() + slotMinutes * 60_000).toISOString()

      const inserted = await insertCalendarEvent({
        config: bookingConfig,
        pack: ctx.pack,
        slotStart,
        slotEnd,
        jobTypeLabel: job?.label ?? jobTypeId,
        suburb,
        urgency,
        callerName,
        callerPhone: fromNumber,
        callId
      })
      if (!inserted.ok) {
        if (inserted.grantBroken) await markCalendarGrantBroken(admin, ctx.clientId)
        return portalJson({ ok: false, reason: inserted.reason ?? 'book_failed' })
      }
      return portalJson({
        ok: true,
        event_id: inserted.eventId,
        spoken_confirm: `Booked ${suburb}`
      })
    }

    if (name === 'capture_callback') {
      return portalJson({
        ok: true,
        captured: {
          name: asString(args.name),
          phone: asString(args.phone) || fromNumber,
          suburb: asString(args.suburb),
          job_type_id: asString(args.job_type_id),
          urgency: asUrgency(args.urgency),
          notes: asString(args.notes)
        }
      })
    }

    if (name === 'notify_owner') {
      const ownerMobile =
        asString(ctx.voice.owner_mobile) || asString(ctx.onboarding.owner_mobile)
      if (!ownerMobile || !twilioFrom) {
        return portalJson({ ok: false, reason: 'owner_or_from_missing' })
      }
      const context = asString(args.context) || 'Inbound call needs attention'
      const result = await sendOwnerAlertSms({
        ownerMobile,
        from: twilioFrom,
        context,
        callerPhone: fromNumber,
        businessName: ctx.name
      })
      return portalJson({ ok: result.ok })
    }

    return portalJson({ error: 'unknown_tool' }, { status: 400 })
  } catch (err) {
    console.error('[voice/tools]', name, err instanceof Error ? err.message : err)
    return portalJson({ error: 'tool_failed' }, { status: 500 })
  }
}

export async function GET() {
  return portalJson({
    ok: true,
    tools: ['check_availability', 'book_slot', 'capture_callback', 'notify_owner']
  })
}
