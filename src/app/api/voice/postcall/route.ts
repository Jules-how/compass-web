import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { isAustralianMobile, lookupClientByTwilioNumber } from '@/lib/voice-client'
import { upsertVoiceCall, writeCallCommThread } from '@/lib/voice-calls'
import { sendRecoverySms } from '@/lib/voice-twilio'
import { verifyRetellSignature } from '@/lib/voice-webhook-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RetellCallPayload = {
  event?: string
  call?: {
    call_id?: string
    from_number?: string
    to_number?: string
    start_timestamp?: number
    end_timestamp?: number
    recording_url?: string
    transcript?: string
    call_analysis?: {
      call_summary?: string
      custom_analysis_data?: Record<string, unknown>
    }
    metadata?: Record<string, string>
  }
}

function analysisField(
  call: RetellCallPayload['call'],
  key: string
): string | null {
  const custom = call?.call_analysis?.custom_analysis_data
  const value = custom?.[key]
  return typeof value === 'string' ? value : null
}

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-retell-signature')
  const secret = process.env.RETELL_WEBHOOK_SECRET?.trim()
  if (secret && !verifyRetellSignature(raw, signature, secret)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: RetellCallPayload
  try {
    payload = JSON.parse(raw) as RetellCallPayload
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  if (payload.event !== 'call_analyzed' || !payload.call?.call_id) {
    return portalJson({ ok: true, skipped: true })
  }

  const call = payload.call
  const callId = call.call_id!
  const admin = getPortalAdminClient()

  try {
    const clientId = call.metadata?.compass_client_id
    let ctx = clientId
      ? await lookupClientByTwilioNumber(admin, call.to_number || '')
      : null
    if (!ctx && clientId) {
      const { data } = await admin
        .from('compass_clients')
        .select('id,name,voice')
        .eq('id', clientId)
        .maybeSingle()
      if (data) {
        ctx = await lookupClientByTwilioNumber(admin, String((data.voice as { twilio_number?: string })?.twilio_number ?? call.to_number))
      }
    }

    const outcome = analysisField(call, 'outcome') ?? 'no_action'
    const recordingRefused = analysisField(call, 'recording_refused') === 'true'
    const startedAt = call.start_timestamp
      ? new Date(call.start_timestamp).toISOString()
      : null
    const endedAt = call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null

    const row = await upsertVoiceCall(admin, {
      id: `vcall-${callId}`,
      client_id: ctx?.clientId ?? clientId ?? 'unknown',
      retell_call_id: callId,
      from_number: call.from_number ?? null,
      to_number: call.to_number ?? null,
      started_at: startedAt,
      ended_at: endedAt,
      outcome,
      job_type: analysisField(call, 'job_type_id'),
      suburb: analysisField(call, 'suburb'),
      urgency: analysisField(call, 'urgency'),
      slot_start: analysisField(call, 'slot_start'),
      calendar_event_id: analysisField(call, 'calendar_event_id'),
      recording_url: call.recording_url ?? null,
      transcript: call.transcript ?? call.call_analysis?.call_summary ?? null,
      recording_refused: recordingRefused,
      payload: payload as unknown as Record<string, unknown>
    })

    if (ctx) {
      const summary =
        call.call_analysis?.call_summary ||
        `Call ${outcome}${row.suburb ? ` · ${row.suburb}` : ''}`
      await writeCallCommThread(admin, {
        clientId: ctx.clientId,
        callId,
        fromNumber: call.from_number ?? null,
        body: summary,
        occurredAt: endedAt ?? startedAt ?? new Date().toISOString()
      })

      const fromMobile = isAustralianMobile(call.from_number)
      const twilioFrom = ctx.voice.twilio_number
      if (outcome !== 'booked' && fromMobile && twilioFrom && call.from_number) {
        await sendRecoverySms({
          supabase: admin,
          clientId: ctx.clientId,
          businessName: ctx.name,
          from: twilioFrom,
          to: call.from_number,
          packSmsRecovery: ctx.pack.sms.recovery
        })
      }
    }

    return portalJson({ ok: true, callId })
  } catch (err) {
    console.error('[voice/postcall]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'postcall_failed' }, { status: 500 })
  }
}

export async function GET() {
  return portalJson({ ok: true, service: 'voice-postcall', expects: 'call_analyzed' })
}
