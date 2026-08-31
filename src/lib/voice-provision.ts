import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { probeCalendarGrant } from '@/lib/booking'
import { loadTradePack } from '@/lib/voice-pack'
import type { ClientVoiceConfig } from '@/lib/types'

export type ForwardingCarrier = 'telstra' | 'optus' | 'vodafone' | 'tpg' | 'other'
export type ForwardingLineType = 'mobile' | 'landline'

export type ForwardingCard = {
  carrier: ForwardingCarrier
  lineType: ForwardingLineType
  twilioNumber: string
  codes: Array<{ label: string; dial: string; off?: string }>
  notes: string[]
}

const RETELL_SIP_ORIGINATION = 'sip:sip.retellai.com'
const RETELL_SBC_ALLOWLIST = '18.98.16.120/30'

export function voiceEnvReady(): { ok: boolean; missing: string[] } {
  const required = [
    'RETELL_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON'
  ]
  const missing = required.filter((key) => !process.env[key]?.trim())
  return { ok: missing.length === 0, missing }
}

export function buildForwardingCard(input: {
  carrier: ForwardingCarrier
  lineType: ForwardingLineType
  twilioNumber: string
}): ForwardingCard {
  const num = input.twilioNumber.replace(/\s/g, '')
  const e164 = num.startsWith('+') ? num : `+61${num.replace(/^0/, '')}`
  const domestic = e164.replace('+61', '0')
  const notes = [
    'Disable MessageBank/voicemail on no-answer before testing.',
    'Confirm forwarding with status codes on the live handset.',
    'After hours is not a carrier condition: use no-answer forward or unconditional at close.'
  ]

  if (input.lineType === 'landline' && input.carrier === 'telstra') {
    return {
      carrier: input.carrier,
      lineType: input.lineType,
      twilioNumber: e164,
      codes: [
        { label: 'Immediate (all calls)', dial: `*21${domestic}#`, off: '#21#' },
        { label: 'Busy', dial: `*24${domestic}#`, off: '#24#' },
        { label: 'No answer', dial: `*61${domestic}#`, off: '#61#' }
      ],
      notes
    }
  }

  const gsm = (code: string) => `**${code}*${domestic}*11#`
  const gsmOff = (code: string) => `##${code}#`
  const optusStyle = (code: string, seconds = 20) => `**${code}*${e164}*${seconds}#`

  const codes =
    input.carrier === 'optus'
      ? [
          { label: 'No answer (20s)', dial: optusStyle('61', 20), off: gsmOff('61') },
          { label: 'Busy', dial: optusStyle('67', 20), off: gsmOff('67') },
          { label: 'Unreachable', dial: optusStyle('62', 20), off: gsmOff('62') },
          { label: 'All calls', dial: `**21*${e164}#`, off: '##21#' }
        ]
      : input.carrier === 'vodafone'
        ? [
            { label: 'Busy', dial: `**67*${e164}#`, off: '#67#' },
            { label: 'No answer', dial: `**61*${e164}#`, off: '#61#' },
            { label: 'Unreachable', dial: `**62*${e164}#`, off: '#62#' },
            { label: 'All calls', dial: `**21*${e164}#`, off: 'Dial 1213 to cancel unconditional' }
          ]
        : [
            { label: 'No answer', dial: gsm('61'), off: gsmOff('61') },
            { label: 'Busy', dial: gsm('67'), off: gsmOff('67') },
            { label: 'Unreachable', dial: gsm('62'), off: gsmOff('62') },
            { label: 'All calls', dial: gsm('21'), off: gsmOff('21') }
          ]

  if (input.carrier === 'tpg') {
    codes.push({
      label: 'Extend no-answer ring (30s)',
      dial: `**61*121**30#`,
      off: '#61#'
    })
  }

  return {
    carrier: input.carrier,
    lineType: input.lineType,
    twilioNumber: e164,
    codes,
    notes
  }
}

export type ProvisionVoiceInput = {
  clientId: string
  tradePackId: string
  calendarId: string
  carrier?: ForwardingCarrier
  lineType?: ForwardingLineType
  afterHoursMode?: 'no_answer' | 'unconditional'
  transferEnabled?: boolean
  ownerAlertMode?: 'live' | 'post_call'
  dryRun?: boolean
}

export type ProvisionVoiceResult = {
  dryRun: boolean
  twilioNumber?: string
  retellAgentId?: string
  forwardingCard?: ForwardingCard
  probeOk?: boolean
  voice?: ClientVoiceConfig
  steps: string[]
}

export async function provisionVoiceClient(
  supabase: SupabaseClient,
  input: ProvisionVoiceInput
): Promise<ProvisionVoiceResult> {
  const env = voiceEnvReady()
  const steps: string[] = []
  if (!env.ok && !input.dryRun) {
    throw new Error(`missing_env: ${env.missing.join(', ')}`)
  }

  loadTradePack(input.tradePackId)
  steps.push(`Loaded pack ${input.tradePackId}`)

  const dryRun = Boolean(input.dryRun)
  let twilioNumber = dryRun ? '+61400000000' : undefined
  let retellAgentId = process.env.RETELL_MASTER_AGENT_ID?.trim() || undefined

  if (!dryRun) {
    twilioNumber = await buyAuMobileNumber()
    steps.push(`Purchased AU mobile ${twilioNumber}`)
    await attachNumberToSipTrunk(twilioNumber)
    steps.push('Attached number to Elastic SIP trunk')
    retellAgentId = await importNumberToRetell(twilioNumber)
    steps.push(`Imported to Retell agent ${retellAgentId}`)
  } else {
    steps.push('Dry run: skipped Twilio purchase and Retell import')
  }

  let probeOk = false
  if (!dryRun && input.calendarId) {
    const probe = await probeCalendarGrant(input.calendarId)
    probeOk = probe.ok && !probe.grantBroken
    steps.push(probeOk ? 'Calendar probe passed' : 'Calendar probe failed')
    if (probe.grantBroken) {
      await supabase
        .from('compass_clients')
        .update({
          voice: {
            calendar_grant_broken: true,
            probe_ok: false
          }
        })
        .eq('id', input.clientId)
    }
  } else {
    steps.push('Dry run: skipped calendar probe')
  }

  const voice: ClientVoiceConfig = {
    twilio_number: twilioNumber,
    retell_agent_id: retellAgentId,
    trade_pack_id: input.tradePackId,
    calendar_id: input.calendarId,
    after_hours_mode: input.afterHoursMode ?? 'no_answer',
    transfer_enabled: input.transferEnabled ?? true,
    owner_alert_mode: input.ownerAlertMode ?? 'live',
    probe_at: new Date().toISOString(),
    probe_ok: probeOk,
    calendar_grant_broken: !probeOk && !dryRun
  }

  if (!dryRun) {
    const { data } = await supabase.from('compass_clients').select('voice').eq('id', input.clientId).maybeSingle()
    const existing = (data?.voice as ClientVoiceConfig) ?? {}
    await supabase
      .from('compass_clients')
      .update({
        voice: { ...existing, ...voice },
        updated_at: new Date().toISOString()
      })
      .eq('id', input.clientId)
    steps.push('Updated compass_clients.voice')
  }

  const forwardingCard = twilioNumber
    ? buildForwardingCard({
        carrier: input.carrier ?? 'telstra',
        lineType: input.lineType ?? 'mobile',
        twilioNumber
      })
    : undefined

  return {
    dryRun,
    twilioNumber,
    retellAgentId,
    forwardingCard,
    probeOk,
    voice,
    steps
  }
}

async function buyAuMobileNumber(): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const token = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!sid || !token) throw new Error('twilio_not_configured')

  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const search = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/AU/Mobile.json?SmsEnabled=true&VoiceEnabled=true&PageSize=1`,
    { headers: { Authorization: `Basic ${auth}` } }
  )
  const available = (await search.json()) as {
    available_phone_numbers?: Array<{ phone_number: string }>
  }
  const candidate = available.available_phone_numbers?.[0]?.phone_number
  if (!candidate) throw new Error('no_au_mobile_available')

  const buy = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ PhoneNumber: candidate })
  })
  const bought = (await buy.json()) as { phone_number?: string; message?: string }
  if (!buy.ok || !bought.phone_number) {
    throw new Error(bought.message || 'twilio_buy_failed')
  }
  return bought.phone_number
}

async function attachNumberToSipTrunk(phoneNumber: string): Promise<void> {
  const trunkSid = process.env.TWILIO_SIP_TRUNK_SID?.trim()
  if (!trunkSid) {
    console.warn('[voice-provision] TWILIO_SIP_TRUNK_SID not set; attach manually')
    return
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const token = process.env.TWILIO_AUTH_TOKEN!.trim()
  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  await fetch(`https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ PhoneNumber: phoneNumber })
  })
}

async function importNumberToRetell(phoneNumber: string): Promise<string> {
  const apiKey = process.env.RETELL_API_KEY?.trim()
  const agentId = process.env.RETELL_MASTER_AGENT_ID?.trim()
  const compassHost = process.env.COMPASS_PUBLIC_URL?.trim() || process.env.VERCEL_URL?.trim()
  if (!apiKey) throw new Error('retell_not_configured')

  const res = await fetch('https://api.retellai.com/v2/import-phone-number', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      termination_uri: RETELL_SIP_ORIGINATION,
      inbound_agent_id: agentId,
      inbound_webhook_url: compassHost ? `https://${compassHost.replace(/^https?:\/\//, '')}/api/voice/inbound` : undefined
    })
  })
  const json = (await res.json()) as { inbound_agent_id?: string; message?: string }
  if (!res.ok) throw new Error(json.message || 'retell_import_failed')
  return json.inbound_agent_id || agentId || 'master'
}

export const VOICE_PLATFORM = {
  retellSipOrigination: RETELL_SIP_ORIGINATION,
  retellSbcAllowlist: RETELL_SBC_ALLOWLIST
}
