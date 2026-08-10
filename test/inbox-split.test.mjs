import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirrors src/lib/inbox-ui.ts parseInboxTab */
function parseInboxTab(value) {
  if (value === 'website') return 'leads'
  if (value === 'gmails' || value === 'gmail') return 'leads'
  const tabs = ['agents', 'instantly', 'leads']
  if (value && tabs.includes(value)) return value
  return 'leads'
}

/** Mirrors src/lib/inbox-ui.ts formatInboxRelative */
function formatInboxRelative(iso, nowMs = Date.now()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const abs = Math.abs(nowMs - date.getTime())
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs < minute) return 'now'
  if (abs < hour) return `${Math.round(abs / minute)}m`
  if (abs < day) return `${Math.round(abs / hour)}h`
  if (abs < 7 * day) return `${Math.round(abs / day)}d`
  return 'dated'
}

/** Mirrors src/lib/inbox-triage.ts scoring helpers */
function instantlyStatusWeight(status) {
  switch ((status || '').toLowerCase()) {
    case 'meeting_booked':
      return 100
    case 'interested':
    case 'replied_positive':
      return 80
    case 'replied':
      return 55
    case 'out_of_office':
      return 45
    case 'not_interested':
    case 'replied_negative':
    case 'wrong_person':
      return 35
    default:
      return 40
  }
}

function scoreInboxItem(input, now = Date.now()) {
  let score = 0
  if (input.tab === 'agents') score += input.agentStatus === 'blocked' ? 92 : 28
  else if (input.tab === 'instantly') score += instantlyStatusWeight(input.instantlyStatus)
  else score += 68
  const hours = Math.max(0, (now - Date.parse(input.occurredAt)) / 3_600_000)
  if (hours < 6) score += 10
  else if (hours < 24) score += 6
  if (input.unread) score += 5
  return score
}

function isTriageActionable(triage, snoozedUntil, now = Date.now()) {
  const state = triage ?? 'unread'
  if (state === 'done') return false
  if (state === 'snoozed') {
    if (!snoozedUntil) return false
    const until = Date.parse(snoozedUntil)
    if (Number.isNaN(until)) return false
    return until <= now
  }
  return true
}

function inboxIdentityKey(email, phone) {
  const normalizedEmail = (email ?? '').trim().toLowerCase()
  if (normalizedEmail && normalizedEmail.includes('@')) return `email:${normalizedEmail}`
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 8) return `phone:${digits}`
  return null
}

test('inbox UI exposes triage work-queue tabs without empty Gmail', () => {
  const panel = read('src/components/InboxPanel.tsx')
  const page = read('src/app/(console)/inbox/page.tsx')
  const api = read('src/app/api/inbox/route.ts')
  const lib = read('src/lib/inbox-ui.ts')
  const triageLib = read('src/lib/inbox-triage.ts')
  const triageApi = read('src/app/api/inbox/triage/route.ts')
  const suggestApi = read('src/app/api/inbox/suggest/route.ts')
  const migration = read('supabase/migrations/0033_inbox_triage.sql')

  assert.match(page, /flush/)
  assert.match(panel, /INBOX_TAB_LABELS/)
  assert.match(panel, /INBOX_TABS/)
  assert.match(panel, /Needs you/)
  assert.match(panel, /Suggested next step/)
  assert.match(panel, /Mark read/)
  assert.match(panel, /Create task/)
  assert.match(panel, /Contacted/)
  assert.match(lib, /INBOX_TABS = \['agents', 'instantly', 'leads'\]/)
  assert.match(lib, /gmails/)
  assert.match(lib, /pickNeedsYou/)
  assert.match(lib, /countActionableBadge/)
  assert.match(api, /badgeTotal/)
  assert.match(api, /needsYou/)
  assert.match(api, /channels/)
  assert.match(api, /Promise\.all/)
  assert.match(api, /lead_contacts/)
  assert.match(api, /portal_inbound_leads/)
  assert.match(api, /compass_tasks/)
  assert.match(api, /portal_inbox_triage/)
  assert.match(panel, /INBOX_CACHE_KEY/)
  assert.match(panel, /itemsForInboxTab/)
  assert.match(panel, /applyOptimisticInboxUpdate|writeQueryCache/)
  assert.match(panel, /AbortController/)
  assert.match(panel, /startTransition/)
  assert.match(lib, /INBOX_CACHE_KEY/)
  assert.match(lib, /channels: InboxChannels/)
  assert.match(lib, /itemsForInboxTab/)
  assert.match(triageApi, /portal_inbox_triage/)
  assert.match(triageApi, /lifecycle_status/)
  assert.match(suggestApi, /suggestInboxNextStep/)
  assert.match(triageLib, /scoreInboxItem/)
  assert.match(triageLib, /inboxIdentityKey/)
  assert.match(migration, /create table if not exists public\.portal_inbox_triage/i)
  assert.match(migration, /lifecycle_status/)
  assert.match(migration, /portal_is_operator\(\)/)
})

test('inbox tab parsing defaults to leads and hides gmail', () => {
  assert.equal(parseInboxTab(null), 'leads')
  assert.equal(parseInboxTab('agents'), 'agents')
  assert.equal(parseInboxTab('instantly'), 'instantly')
  assert.equal(parseInboxTab('website'), 'leads')
  assert.equal(parseInboxTab('gmails'), 'leads')
  assert.equal(parseInboxTab('nope'), 'leads')
})

test('inbox relative time formatter stays compact', () => {
  const now = Date.parse('2026-08-06T12:00:00.000Z')
  assert.equal(formatInboxRelative('2026-08-06T11:59:30.000Z', now), 'now')
  assert.equal(formatInboxRelative('2026-08-06T11:30:00.000Z', now), '30m')
  assert.equal(formatInboxRelative('2026-08-06T09:00:00.000Z', now), '3h')
  assert.equal(formatInboxRelative('2026-08-04T12:00:00.000Z', now), '2d')
})

test('ranking prefers meeting booked and blocked agents', () => {
  const now = Date.parse('2026-08-06T12:00:00.000Z')
  const meeting = scoreInboxItem(
    {
      tab: 'instantly',
      occurredAt: '2026-08-06T11:00:00.000Z',
      instantlyStatus: 'meeting_booked',
      unread: true
    },
    now
  )
  const replied = scoreInboxItem(
    {
      tab: 'instantly',
      occurredAt: '2026-08-06T11:00:00.000Z',
      instantlyStatus: 'replied',
      unread: true
    },
    now
  )
  const blocked = scoreInboxItem(
    {
      tab: 'agents',
      occurredAt: '2026-08-06T11:00:00.000Z',
      agentStatus: 'blocked',
      unread: true
    },
    now
  )
  const completed = scoreInboxItem(
    {
      tab: 'agents',
      occurredAt: '2026-08-06T11:00:00.000Z',
      agentStatus: 'completed',
      unread: true
    },
    now
  )
  assert.ok(meeting > replied)
  assert.ok(blocked > completed)
})

test('triage actionable rules honor done and snooze windows', () => {
  const now = Date.parse('2026-08-06T12:00:00.000Z')
  assert.equal(isTriageActionable('done', null, now), false)
  assert.equal(isTriageActionable('unread', null, now), true)
  assert.equal(isTriageActionable('snoozed', '2026-08-07T12:00:00.000Z', now), false)
  assert.equal(isTriageActionable('snoozed', '2026-08-05T12:00:00.000Z', now), true)
})

test('identity keys normalize email and phone', () => {
  assert.equal(inboxIdentityKey('Ada@Example.com', null), 'email:ada@example.com')
  assert.equal(inboxIdentityKey(null, '+61 400 123 456'), 'phone:61400123456')
  assert.equal(inboxIdentityKey(null, '123'), null)
})
