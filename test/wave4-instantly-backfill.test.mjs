import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function leadEvidenceKeys(lead, campaignId) {
  const keys = []
  const leadId = lead.id
  const replies = Number(lead.email_reply_count) || 0
  if (replies > 0 || lead.timestamp_last_reply) {
    keys.push(`instantly:email.replied:${leadId}:${campaignId}`)
  }
  if (lead.lt_interest_status === 1) {
    keys.push(`instantly:lead.interested:${leadId}:${campaignId}`)
  }
  if (lead.lt_interest_status === 2 || lead.lt_interest_status === 3) {
    keys.push(`instantly:lead.meeting_booked:${leadId}:${campaignId}`)
  }
  return keys
}

function dailySentKey(campaignId, date) {
  return `instantly:email.sent_day:${campaignId}:${date}`
}

test('backfill modules and route exist', () => {
  assert.match(read('src/lib/instantly-backfill.ts'), /instantly:email.sent_day/)
  assert.match(read('src/lib/instantly-backfill.ts'), /instantly:lead.interested/)
  assert.match(read('src/app/api/agent/instantly/backfill/route.ts'), /runInstantlyBackfill/)
  assert.match(read('scripts/backfill-instantly.mjs'), /--dry-run/)
})

test('idempotency keys are stable per lead outcome', () => {
  const lead = {
    id: 'lead-abc',
    email_reply_count: 1,
    timestamp_last_reply: '2026-01-01',
    lt_interest_status: 1
  }
  const keys = leadEvidenceKeys(lead, 'camp-1')
  assert.deepEqual(keys, [
    'instantly:email.replied:lead-abc:camp-1',
    'instantly:lead.interested:lead-abc:camp-1'
  ])
  const again = leadEvidenceKeys(lead, 'camp-1')
  assert.deepEqual(keys, again)
})

test('daily sent idempotency is per campaign per date', () => {
  assert.equal(dailySentKey('c1', '2026-01-15'), 'instantly:email.sent_day:c1:2026-01-15')
  assert.notEqual(dailySentKey('c1', '2026-01-15'), dailySentKey('c1', '2026-01-16'))
})
