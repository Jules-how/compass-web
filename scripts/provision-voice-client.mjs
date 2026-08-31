#!/usr/bin/env node
/**
 * Per-client voice provisioning CLI.
 * Dry-run works without API keys. Live mode requires full env (see docs/VOICE.md).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

function parseArgs(argv) {
  const out = { dryRun: false }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--client-id') out.clientId = argv[++i]
    else if (arg === '--pack') out.pack = argv[++i]
    else if (arg === '--calendar') out.calendar = argv[++i]
    else if (arg === '--carrier') out.carrier = argv[++i]
    else if (arg === '--line-type') out.lineType = argv[++i]
  }
  return out
}

function voiceEnvReady() {
  const required = [
    'RETELL_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON'
  ]
  const missing = required.filter((key) => !process.env[key]?.trim())
  return { ok: missing.length === 0, missing }
}

function buildForwardingCard({ carrier, lineType, twilioNumber }) {
  const e164 = twilioNumber.startsWith('+') ? twilioNumber : `+61${twilioNumber.replace(/^0/, '')}`
  const domestic = e164.replace('+61', '0')
  const notes = [
    'Disable MessageBank/voicemail on no-answer before testing.',
    'Confirm forwarding with status codes on the live handset.'
  ]
  const gsm = (code) => `**${code}*${domestic}*11#`
  const gsmOff = (code) => `##${code}#`
  const codes =
    carrier === 'optus'
      ? [
          { label: 'No answer (20s)', dial: `**61*${e164}*20#`, off: gsmOff('61') },
          { label: 'Busy', dial: `**67*${e164}*20#`, off: gsmOff('67') }
        ]
      : [
          { label: 'No answer', dial: gsm('61'), off: gsmOff('61') },
          { label: 'Busy', dial: gsm('67'), off: gsmOff('67') },
          { label: 'Unreachable', dial: gsm('62'), off: gsmOff('62') }
        ]
  return { twilioNumber: e164, codes, notes }
}

function loadPack(packId) {
  const dirs = [
    process.env.VOICE_PACKS_DIR,
    resolve(process.cwd(), '../voice-agents/packs'),
    resolve(process.cwd(), 'voice-agents/packs')
  ].filter(Boolean)
  for (const dir of dirs) {
    const path = join(dir, `${packId}.json`)
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  }
  throw new Error(`pack_not_found: ${packId}`)
}

async function buyAuMobile() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const search = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/AU/Mobile.json?SmsEnabled=true&VoiceEnabled=true&PageSize=1`,
    { headers: { Authorization: `Basic ${auth}` } }
  )
  const available = await search.json()
  const candidate = available.available_phone_numbers?.[0]?.phone_number
  if (!candidate) throw new Error('no_au_mobile_available')
  const buy = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ PhoneNumber: candidate })
  })
  const bought = await buy.json()
  if (!buy.ok) throw new Error(bought.message || 'twilio_buy_failed')
  return bought.phone_number
}

async function importRetell(phoneNumber) {
  const apiKey = process.env.RETELL_API_KEY
  const agentId = process.env.RETELL_MASTER_AGENT_ID
  const host = process.env.COMPASS_PUBLIC_URL?.replace(/^https?:\/\//, '')
  const res = await fetch('https://api.retellai.com/v2/import-phone-number', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone_number: phoneNumber,
      termination_uri: 'sip:sip.retellai.com',
      inbound_agent_id: agentId,
      inbound_webhook_url: host ? `https://${host}/api/voice/inbound` : undefined
    })
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || 'retell_import_failed')
  return json.inbound_agent_id || agentId
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.clientId || !args.pack || !args.calendar) {
    console.error('Usage: --client-id ID --pack PACK_ID --calendar CALENDAR_ID [--dry-run]')
    process.exit(1)
  }

  loadPack(args.pack)
  const env = voiceEnvReady()
  if (!env.ok && !args.dryRun) {
    console.error('Missing env:', env.missing.join(', '))
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const steps = [`Loaded pack ${args.pack}`]
  let twilioNumber = '+61400000000'

  if (args.dryRun) {
    steps.push('Dry run: skipped Twilio purchase and Retell import')
    steps.push('Dry run: skipped calendar probe')
  } else {
    twilioNumber = await buyAuMobile()
    steps.push(`Purchased ${twilioNumber}`)
    const retellAgentId = await importRetell(twilioNumber)
    steps.push(`Retell import → ${retellAgentId}`)
    steps.push('Calendar probe: run manually via Compass or booking.probeCalendarGrant')
  }

  const voice = {
    twilio_number: twilioNumber,
    retell_agent_id: process.env.RETELL_MASTER_AGENT_ID || null,
    trade_pack_id: args.pack,
    calendar_id: args.calendar,
    transfer_enabled: true,
    owner_alert_mode: 'live',
    after_hours_mode: 'no_answer',
    probe_at: new Date().toISOString(),
    probe_ok: args.dryRun ? null : false
  }

  if (!args.dryRun) {
    const { data } = await supabase.from('compass_clients').select('voice').eq('id', args.clientId).maybeSingle()
    await supabase
      .from('compass_clients')
      .update({ voice: { ...(data?.voice ?? {}), ...voice }, updated_at: new Date().toISOString() })
      .eq('id', args.clientId)
    steps.push('Updated compass_clients.voice')
  }

  const card = buildForwardingCard({
    carrier: args.carrier || 'telstra',
    lineType: args.lineType || 'mobile',
    twilioNumber
  })

  console.log('\n=== Steps ===')
  steps.forEach((s) => console.log(`- ${s}`))
  console.log('\n=== Forwarding card ===')
  console.log(`Number: ${card.twilioNumber}`)
  card.codes.forEach((c) => console.log(`${c.label}: ${c.dial}`))
  card.notes.forEach((n) => console.log(`Note: ${n}`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
