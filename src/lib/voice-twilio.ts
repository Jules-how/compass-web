import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { renderPackSms } from '@/lib/voice-pack'

export async function isSmsSuppressed(
  supabase: SupabaseClient,
  clientId: string,
  phone: string
): Promise<boolean> {
  const { data } = await supabase
    .from('sms_suppressions')
    .select('phone')
    .eq('client_id', clientId)
    .eq('phone', phone)
    .maybeSingle()
  return Boolean(data)
}

export async function suppressSms(
  supabase: SupabaseClient,
  clientId: string,
  phone: string,
  reason = 'stop'
): Promise<void> {
  await supabase.from('sms_suppressions').upsert({
    phone,
    client_id: clientId,
    reason,
    created_at: new Date().toISOString()
  })
}

export async function sendTwilioSms(input: {
  to: string
  from: string
  body: string
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const token = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!sid || !token) return { ok: false, error: 'twilio_not_configured' }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      To: input.to,
      From: input.from,
      Body: input.body
    })
  })
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string }
  if (!res.ok) return { ok: false, error: json.message || `twilio_${res.status}` }
  return { ok: true, sid: json.sid }
}

export async function sendRecoverySms(input: {
  supabase: SupabaseClient
  clientId: string
  businessName: string
  from: string
  to: string
  packSmsRecovery: string
}): Promise<{ sent: boolean; reason?: string }> {
  if (await isSmsSuppressed(input.supabase, input.clientId, input.to)) {
    return { sent: false, reason: 'suppressed' }
  }
  const body = input.packSmsRecovery.replace(/\{BusinessName\}/g, input.businessName)
  const result = await sendTwilioSms({ to: input.to, from: input.from, body })
  return { sent: result.ok, reason: result.error }
}

export async function sendOwnerAlertSms(input: {
  ownerMobile: string
  from: string
  context: string
  callerPhone?: string
  businessName: string
}): Promise<{ ok: boolean }> {
  const lines = [
    `${input.businessName} call alert:`,
    input.context,
    input.callerPhone ? `Caller: ${input.callerPhone}` : null
  ].filter(Boolean)
  const result = await sendTwilioSms({
    to: input.ownerMobile,
    from: input.from,
    body: lines.join(' ')
  })
  return { ok: result.ok }
}

export function formatConfirmSms(
  pack: { sms: { confirm: string } },
  vars: { businessName: string; weekday: string; time: string; suburb: string }
): string {
  return renderPackSms(pack as Parameters<typeof renderPackSms>[0], 'confirm', {
    BusinessName: vars.businessName,
    weekday: vars.weekday,
    time: vars.time,
    suburb: vars.suburb
  })
}
