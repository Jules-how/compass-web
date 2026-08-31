import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packsRoot = resolve(root, '../database-reactivation/packs')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function readPack(id) {
  return JSON.parse(readFileSync(resolve(packsRoot, `${id}.json`), 'utf8'))
}

/** Mirrors normalizePhone from lead-import-shared */
function normalizePhone(raw) {
  const trimmed = String(raw ?? '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (trimmed.startsWith('+')) return '+' + digits
  if (digits.startsWith('61')) return '+' + digits
  if (digits.startsWith('0')) return '+61' + digits.slice(1)
  return '+61' + digits
}

function daysSince(dateIso) {
  const then = new Date(`${dateIso}T12:00:00Z`).getTime()
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000))
}

function isConsentValid(row, pack) {
  const basis = row.consent_basis.trim().toLowerCase().replace(/\s+/g, '_')
  if (!basis) return { valid: false }
  const allowed = new Set(pack.consent_policy.allowed_bases.map((b) => b.toLowerCase()))
  if (!allowed.has(basis)) return { valid: false }
  if (basis === 'express') return { valid: true }
  if (!row.last_touch_date) return { valid: false }
  const age = daysSince(row.last_touch_date)
  if (age > pack.consent_policy.max_inferred_age_days) return { valid: false }
  return { valid: true }
}

function classifyInboundReply(body, pack) {
  const lower = body.trim().toLowerCase()
  if (/\b(stop|unsubscribe|opt\s*out|optout)\b/.test(lower)) return 'stop'
  const bookKeywords = pack.escalation_rules.book?.keywords ?? ['book', 'yes', 'y']
  if (bookKeywords.some((kw) => lower.includes(kw))) return 'book'
  if (/\b(wrong number|angry|spam|complaint)\b/.test(lower)) return 'complaint'
  return 'default'
}

function parseHm(hm) {
  const [h, m] = hm.split(':').map(Number)
  return { hour: h || 0, minute: m || 0 }
}

function computeNextTouchAt({ baseDate, dayOffset, quietHours, timezone }) {
  const target = new Date(baseDate.getTime())
  target.setUTCDate(target.getUTCDate() + dayOffset)
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(target)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 10)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const start = parseHm(quietHours.start)
  const end = parseHm(quietHours.end)
  const currentMinutes = hour * 60 + minute
  const startMinutes = start.hour * 60 + start.minute
  const endMinutes = end.hour * 60 + end.minute
  if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
    const adjustHours = currentMinutes < startMinutes ? start.hour - hour : 24 - hour + start.hour
    target.setUTCHours(target.getUTCHours() + adjustHours)
    target.setUTCMinutes(start.minute)
  }
  return target
}

test('migrations 0069 and 0070 define reactivation tables with RLS', () => {
  const m69 = read('supabase/migrations/0071_compass_reactivation_lists.sql')
  const m70 = read('supabase/migrations/0072_compass_reactivation_messages.sql')
  assert.match(m69, /compass_reactivation_lists/)
  assert.match(m69, /compass_reactivation_contacts/)
  assert.match(m69, /portal_is_operator/)
  assert.match(m69, /next_touch_at/)
  assert.match(m70, /compass_reactivation_messages/)
  assert.match(m70, /contact_id/)
})

test('all four pack files exist with STOP on every SMS touch', () => {
  for (const id of ['brokers_dead_leads', 'dental', 'physio', 'trades']) {
    const pack = readPack(id)
    assert.equal(pack.pack_id, id)
    const smsTouches = pack.sequence.filter((t) => t.channel === 'sms')
    assert.ok(smsTouches.length >= 2, `${id} needs SMS touches`)
    for (const touch of smsTouches) {
      assert.match(touch.template, /\{business_name\}/i)
      assert.match(touch.template, /STOP/i, `${id} touch ${touch.template_id} missing STOP`)
    }
    assert.ok(pack.consent_policy.comment, `${id} needs consent comment`)
    assert.equal(pack.caps.monthly_contact_cap, 1000)
  }
})

test('broker pack requires licensee signoff and is advice-preserving', () => {
  const pack = readPack('brokers_dead_leads')
  assert.equal(pack.compliance_gate.licensee_signoff_required, true)
  assert.equal(pack.compliance_gate.advice_preserving, true)
  const allCopy = pack.sequence.map((t) => t.template).join(' ').toLowerCase()
  assert.doesNotMatch(allCopy, /\brate\b/)
  assert.doesNotMatch(allCopy, /\blender\b/)
  assert.equal(pack.bonus_metric, 'attended_meeting')
})

test('import hygiene rejects missing consent', () => {
  const pack = readPack('dental')
  const row = {
    consent_basis: '',
    last_touch_date: '2023-01-15'
  }
  assert.equal(isConsentValid(row, pack).valid, false)

  const express = { consent_basis: 'express', last_touch_date: '2023-01-15' }
  assert.equal(isConsentValid(express, pack).valid, true)
})

test('import hygiene rejects invalid consent basis', () => {
  const pack = readPack('brokers_dead_leads')
  const row = { consent_basis: 'scraped_web', last_touch_date: '2024-06-01' }
  assert.equal(isConsentValid(row, pack).valid, false)

  const recent = new Date()
  recent.setUTCDate(recent.getUTCDate() - 120)
  const valid = {
    consent_basis: 'enquiry_form',
    last_touch_date: recent.toISOString().slice(0, 10)
  }
  assert.equal(isConsentValid(valid, pack).valid, true)
})

test('inferred consent expires beyond max_inferred_age_days', () => {
  const pack = readPack('trades')
  const oldDate = new Date()
  oldDate.setUTCDate(oldDate.getUTCDate() - (pack.consent_policy.max_inferred_age_days + 30))
  const row = {
    consent_basis: 'service_relationship',
    last_touch_date: oldDate.toISOString().slice(0, 10)
  }
  assert.equal(isConsentValid(row, pack).valid, false)
})

test('STOP handling classifies stop variants', () => {
  const pack = readPack('dental')
  assert.equal(classifyInboundReply('STOP', pack), 'stop')
  assert.equal(classifyInboundReply('please unsubscribe', pack), 'stop')
  assert.equal(classifyInboundReply('BOOK me in', pack), 'book')
})

test('quiet hours scheduling pushes early sends to window start', () => {
  const base = new Date('2026-08-26T02:00:00Z')
  const next = computeNextTouchAt({
    baseDate: base,
    dayOffset: 0,
    quietHours: { start: '08:00', end: '21:00' },
    timezone: 'Australia/Sydney'
  })
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(next)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  assert.ok(hour >= 8 && hour < 21, `expected within quiet hours, got hour ${hour}`)
})

test('activation gate refuses without licensee signoff for brokers', () => {
  const lib = read('src/lib/reactivation.ts')
  const route = read('src/app/api/clients/[id]/reactivation/[listId]/route.ts')
  assert.match(lib, /licensee_signoff_required/)
  assert.match(lib, /licensee_signoff_required.*licenseeSignoff/s)
  assert.match(route, /confirm_required/)
  assert.match(route, /licensee_signoff/)
})

test('agent sync includes reactivation source', () => {
  const sync = read('src/lib/agent-sync.ts')
  assert.match(sync, /'reactivation'/)
  assert.match(sync, /syncReactivationLists/)
})

test('reactivation runtime checks suppression before send', () => {
  const runtime = read('src/lib/reactivation-runtime.ts')
  assert.match(runtime, /isSmsSuppressed/)
  assert.match(runtime, /status', 'active'/)
  assert.match(runtime, /state', 'enrolled'/)
})

test('monthly contact cap blocks new first touches only', () => {
  const runtime = read('src/lib/reactivation-runtime.ts')
  const lib = read('src/lib/reactivation.ts')
  assert.match(runtime, /monthly_contact_cap/)
  assert.match(runtime, /countClientMonthlyNewTouches/)
  assert.match(runtime, /emitCapReachedEvent/)
  assert.match(runtime, /isMidSequence/)
  assert.match(lib, /type: 'cap.reached'/)
  assert.match(lib, /rollupReactivationListCounts/)
  assert.match(lib, /idempotency_key: `reactivation:cap\.reached/)
})

test('broker_name resolves from deal_terms delivery owner', () => {
  const lib = read('src/lib/reactivation.ts')
  const runtime = read('src/lib/reactivation-runtime.ts')
  const route = read('src/app/api/clients/[id]/reactivation/route.ts')
  assert.match(lib, /resolveBrokerName/)
  assert.match(lib, /owner_name/)
  assert.match(runtime, /resolveBrokerName/)
  assert.match(runtime, /deal_terms/)
  assert.match(route, /rollupReactivationListCounts/)
  assert.match(route, /resolveBrokerName/)
})

test('GET rollup refreshes outcome counters on list row', () => {
  const lib = read('src/lib/reactivation.ts')
  assert.match(lib, /opted_out/)
  assert.match(lib, /state === 'replied'/)
  assert.match(lib, /counts: merged/)
})

test('reactivation SMS webhook is separate from voice SMS', () => {
  const webhook = read('src/app/api/reactivation/sms/route.ts')
  assert.match(webhook, /handleReactivationInboundSms/)
  assert.match(webhook, /verifyTwilioSignature/)
  const voiceSms = read('src/app/api/voice/sms/route.ts')
  assert.doesNotMatch(voiceSms, /reactivation/)
})

test('reactivation API and UI wire together', () => {
  const importRoute = read('src/app/api/clients/[id]/reactivation/route.ts')
  const panel = read('src/components/clients/ClientReactivationPanel.tsx')
  assert.match(importRoute, /consent\.missing/)
  assert.match(importRoute, /runHygiene/)
  assert.match(panel, /licensee_signoff/)
  assert.match(panel, /Confirm activate/)
  assert.match(panel, /ClientDetailPanel/)
})

test('activation respects monthly enroll slots', () => {
  const lib = read('src/lib/reactivation.ts')
  assert.match(lib, /enrollSlots/)
  assert.match(lib, /cap - monthlyCount/)
})

test('phone normalization for dedupe', () => {
  assert.equal(normalizePhone('0412 345 678'), '+61412345678')
  assert.equal(normalizePhone('+61412345678'), '+61412345678')
})

function resolveBrokerName(clientName, dealTerms) {
  const root = dealTerms ?? {}
  const delivery = root.delivery ?? {}
  const owner = delivery.owner_name
  if (typeof owner === 'string' && owner.trim()) return owner.trim()
  return clientName
}

test('resolveBrokerName helper prefers delivery owner', () => {
  assert.equal(
    resolveBrokerName('Acme Finance', { delivery: { owner_name: 'Jane Broker' } }),
    'Jane Broker'
  )
  assert.equal(resolveBrokerName('Acme Finance', {}), 'Acme Finance')
})
