import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  jobTypesSpokenList,
  loadTradePack,
  type TradePack
} from '@/lib/voice-pack'

import type { ClientVoiceConfig } from '@/lib/types'

export type VoiceClientContext = {
  clientId: string
  name: string
  voice: ClientVoiceConfig
  pack: TradePack
  onboarding: Record<string, unknown>
}

const DEFAULT_DYNAMIC_VARS: Record<string, string> = {
  business_name: 'the business',
  pack_id: 'plumbing_gas',
  begin_message: 'Thanks for calling. I can take a message and someone will call you back.',
  recording_disclosure:
    'This call is recorded so we can book the job accurately. If you do not want that, say so and I will take a message instead.',
  recording_refusal_message:
    'No recording. I will take your name, number, suburb, and job and someone will call you back.',
  job_types_spoken: 'general enquiry',
  qualify_extra_prompt: '',
  callback_phrase: 'I have your details. Someone will call you back shortly.',
  calendar_broken_phrase:
    'I cannot see live availability right now. I will take your details and the team will call you back.',
  emergency_safety_line: 'If this is an emergency, call triple zero now.',
  emergency_utility_advice: '',
  transfer_phrase: 'Let me put you through now.',
  transfer_enabled: 'false',
  owner_mobile: '',
  owner_alert_mode: 'post_call',
  timezone: 'Australia/Sydney',
  compass_client_id: ''
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const digits = value.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`
  if (digits.startsWith('61')) return `+${digits}`
  return digits
}

export function buildDynamicVariables(ctx: VoiceClientContext): Record<string, string> {
  const pack = ctx.pack
  const businessName = ctx.name
  const ownerMobile =
    normalizePhone(ctx.voice.owner_mobile) ||
    normalizePhone(String(ctx.onboarding.owner_mobile ?? '')) ||
    ''
  const transferEnabled =
    ctx.voice.transfer_enabled ?? pack.transfer.default_enabled ?? pack.transfer.allowed

  return {
    business_name: businessName,
    pack_id: pack.pack_id,
    begin_message: pack.begin_message.replace(/\{\{business_name\}\}/g, businessName),
    recording_disclosure: pack.recording_disclosure,
    recording_refusal_message: pack.recording_refusal_message.replace(
      /\{\{business_name\}\}/g,
      businessName
    ),
    job_types_spoken: jobTypesSpokenList(pack),
    qualify_extra_prompt: (pack.qualify_extra ?? []).join(' '),
    callback_phrase: pack.escalation.callback_phrase.replace(/\{\{business_name\}\}/g, businessName),
    calendar_broken_phrase: pack.escalation.calendar_broken_phrase.replace(
      /\{\{business_name\}\}/g,
      businessName
    ),
    emergency_safety_line: pack.escalation.emergency.safety_line,
    emergency_utility_advice: pack.escalation.emergency.advise_utility ?? '',
    transfer_phrase: pack.transfer.phrase,
    transfer_enabled: transferEnabled ? 'true' : 'false',
    owner_mobile: ownerMobile,
    owner_alert_mode: String(ctx.voice.owner_alert_mode ?? 'post_call'),
    timezone: String(ctx.voice.timezone ?? pack.timezone),
    compass_client_id: ctx.clientId
  }
}

export function safeDefaultDynamicVariables(): Record<string, string> {
  return { ...DEFAULT_DYNAMIC_VARS }
}

export async function latestOnboardingAnswers(
  supabase: SupabaseClient,
  clientId: string
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('compass_onboarding_forms')
    .select('answers')
    .eq('client_id', clientId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.answers as Record<string, unknown>) ?? {}
}

export async function lookupClientByTwilioNumber(
  supabase: SupabaseClient,
  toNumber: string
): Promise<VoiceClientContext | null> {
  const normalized = normalizePhone(toNumber)
  if (!normalized) return null

  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name,voice')
    .contains('voice', { twilio_number: normalized })
    .is('archived_at', null)
    .maybeSingle()

  if (error || !data) {
    const alt = await supabase
      .from('compass_clients')
      .select('id,name,voice')
      .filter('voice->>twilio_number', 'eq', normalized)
      .is('archived_at', null)
      .maybeSingle()
    if (alt.error || !alt.data) return null
    return hydrateVoiceClient(supabase, alt.data as { id: string; name: string; voice: ClientVoiceConfig })
  }

  return hydrateVoiceClient(supabase, data as { id: string; name: string; voice: ClientVoiceConfig })
}

async function hydrateVoiceClient(
  supabase: SupabaseClient,
  row: { id: string; name: string; voice: ClientVoiceConfig }
): Promise<VoiceClientContext | null> {
  const voice = (row.voice ?? {}) as ClientVoiceConfig
  const packId = voice.trade_pack_id ?? 'plumbing_gas'
  try {
    const pack = loadTradePack(packId)
    const onboarding = await latestOnboardingAnswers(supabase, row.id)
    return {
      clientId: row.id,
      name: row.name,
      voice,
      pack,
      onboarding
    }
  } catch {
    return null
  }
}

export function isAustralianMobile(number: string | null | undefined): boolean {
  const n = normalizePhone(number)
  if (!n) return false
  return /^\+614\d{8}$/.test(n)
}

export { normalizePhone }
