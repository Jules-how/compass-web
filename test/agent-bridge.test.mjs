import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of mapInstantlyInterestToOutboundStatus for contract tests. */
function mapInstantlyInterestToOutboundStatus(lead) {
  const interest = lead.lt_interest_status
  switch (interest) {
    case 4:
      return 'converted'
    case 3:
    case 2:
      return 'meeting_booked'
    case 1:
      return 'interested'
    case 0:
      return 'out_of_office'
    case -1:
    case -3:
    case -4:
      return 'not_interested'
    case -2:
      return 'wrong_person'
    default:
      break
  }
  if (lead.status === -1 || lead.status === -2 || lead.status === -3) {
    return 'suppressed'
  }
  const replies = Number(lead.email_reply_count) || 0
  if (replies > 0 || lead.timestamp_last_reply) return 'replied'
  return 'in_instantly'
}

function buildLeadDisplayName(lead) {
  const first = (lead.first_name || '').trim()
  const last = (lead.last_name || '').trim()
  const joined = [first, last].filter(Boolean).join(' ')
  if (joined) return joined
  const payload = lead.payload || {}
  const fromPayload = [payload.firstName, payload.lastName].filter(Boolean).join(' ')
  return fromPayload || null
}

function parseSyncSources(input) {
  const ALL = ['ads', 'instantly', 'instantly_leads']
  if (!Array.isArray(input) || input.length === 0) return [...ALL]
  const allowed = new Set(ALL)
  const out = []
  for (const value of input) {
    if (typeof value !== 'string') continue
    if (!allowed.has(value)) continue
    if (!out.includes(value)) out.push(value)
  }
  return out.length > 0 ? out : [...ALL]
}

function secretsMatch(provided, expected) {
  if (!provided || provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

test('Instantly interest statuses map into Compass outbound lanes', () => {
  assert.equal(mapInstantlyInterestToOutboundStatus({ lt_interest_status: 1 }), 'interested')
  assert.equal(mapInstantlyInterestToOutboundStatus({ lt_interest_status: 2 }), 'meeting_booked')
  assert.equal(mapInstantlyInterestToOutboundStatus({ lt_interest_status: 4 }), 'converted')
  assert.equal(mapInstantlyInterestToOutboundStatus({ lt_interest_status: 0 }), 'out_of_office')
  assert.equal(mapInstantlyInterestToOutboundStatus({ email_reply_count: 2 }), 'replied')
  assert.equal(mapInstantlyInterestToOutboundStatus({ timestamp_last_reply: '2026-01-01' }), 'replied')
  assert.equal(mapInstantlyInterestToOutboundStatus({}), 'in_instantly')
  assert.equal(mapInstantlyInterestToOutboundStatus({ lt_interest_status: -1 }), 'not_interested')
  assert.equal(mapInstantlyInterestToOutboundStatus({ lt_interest_status: -2 }), 'wrong_person')
})

test('lead display name prefers Instantly name fields', () => {
  assert.equal(buildLeadDisplayName({ first_name: 'Ada', last_name: 'Lovelace' }), 'Ada Lovelace')
  assert.equal(
    buildLeadDisplayName({ payload: { firstName: 'Grace', lastName: 'Hopper' } }),
    'Grace Hopper'
  )
  assert.equal(buildLeadDisplayName({}), null)
})

test('parseSyncSources defaults to full daily set and dedupes', () => {
  assert.deepEqual(parseSyncSources(undefined), ['ads', 'instantly', 'instantly_leads'])
  assert.deepEqual(parseSyncSources(['instantly_leads', 'instantly_leads', 'nope']), [
    'instantly_leads'
  ])
})

test('agent secret compare is length-safe', () => {
  assert.equal(secretsMatch('abc', 'abc'), true)
  assert.equal(secretsMatch('ab', 'abc'), false)
  assert.equal(secretsMatch(null, 'abc'), false)
})

test('agent bridge routes and cron are wired', () => {
  const brief = read('src/app/api/agent/brief/route.ts')
  const sync = read('src/app/api/agent/sync/route.ts')
  const leads = read('src/app/api/agent/leads/route.ts')
  const campaigns = read('src/app/api/agent/campaigns/route.ts')
  const cron = read('src/app/api/cron/daily-sync/route.ts')
  const vercel = read('vercel.json')

  assert.match(brief, /requireAgentAuth/)
  assert.match(sync, /runAgentSync/)
  assert.match(leads, /lead_contacts/)
  assert.match(campaigns, /compass_pipeline_campaigns/)
  assert.match(cron, /requireCronAuth/)
  assert.match(cron, /runAgentSync/)
  assert.match(vercel, /\/api\/cron\/daily-sync/)
  assert.match(vercel, /15 20 \* \* \*/)
})

test('instantly leads sync targets inbox-relevant filters', () => {
  const src = read('src/lib/instantly-leads-sync.ts')
  assert.match(src, /FILTER_VAL_REPLIED/)
  assert.match(src, /FILTER_LEAD_INTERESTED/)
  assert.match(src, /FILTER_LEAD_MEETING_BOOKED/)
  assert.match(src, /FILTER_LEAD_NOT_INTERESTED/)
  assert.match(src, /FILTER_LEAD_OUT_OF_OFFICE/)
  assert.match(src, /lead_contacts/)
  assert.match(src, /resolveInstantlyApiKey/)
  assert.match(src, /INSTANTLY_INBOX_OUTBOUND_STATUSES/)
})

test('compass-agent skill documents lean brief-first workflow', () => {
  const skill = read('.cursor/skills/compass-agent/SKILL.md')
  assert.match(skill, /\/api\/agent\/brief/)
  assert.match(skill, /COMPASS_AGENT_SECRET/)
  assert.match(skill, /instantly_leads/)
})
