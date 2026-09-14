import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const { decideLeadCommit } = loadTypescript('src/lib/lead-commit.ts', {
  '@/lib/events': {}, '@/lib/lead-mark': {}
})
const now = '2026-09-14T03:00:00Z'
const old = { id: 'real-id', email: 'typo@example.com', company: 'Acme AC', city: 'Sydney', company_domain: 'example.com', outbound_status: 'uncontacted', icp_status: 'pass', email_verify_status: 'invalid', updated_at: '2026-09-13T00:00:00Z' }
const review = { kind: 'replace_invalid_email', existing_id: old.id, expected_email: old.email, source_url: 'https://example.com/contact', reason: 'Published corrected company inbox', reviewed_at: now, email_verified_at: '2026-09-13T00:00:00Z', prior_contact_checked: true, prior_contact_found: false }
function decide(row = {}, previous = {}) {
  const existing = { ...old, ...previous }
  return decideLeadCommit({ id: old.id, company: old.company, email: 'correct@example.com', email_verify_status: 'valid', identity_review: review, ...row }, {
    byId: new Map([[old.id, existing]]), byEmail: new Map([[existing.email, existing]]), byDomain: new Map([[old.company_domain, existing]]), byCompanyCity: new Map()
  }, { now })
}
test('published valid correction preserves explicit old snapshot and verification date', () => {
  const result = decide()
  assert.equal(result.action, 'update')
  assert.equal(result.previous.email, old.email)
  assert.equal(result.patch.email_verified_at, review.email_verified_at)
})
test('unreviewed, stale, conflicting identity and previously contacted changes remain blocked', () => {
  for (const row of [ { identity_review: undefined }, { company: 'Other business' }, { identity_review: { ...review, expected_email: 'wrong@example.com' } }, { identity_review: { ...review, email_verified_at: '2025-01-01' } }, { identity_review: { ...review, prior_contact_found: true } } ]) assert.equal(decide(row).action, 'skip')
  for (const previous of [{ email_verify_status: 'valid' }, { outbound_status: 'sent' }, { suppression_reason: 'unsubscribe' }, { is_archived: true }, { recontact_ok: 0 }]) assert.equal(decide({}, previous).action, 'skip')
})
test('distinct branch requires reviewed real collision and different company and city', () => {
  const row = { id: undefined, company: 'Acme Hume', city: 'Hume', identity_review: { ...review, kind: 'distinct_branch' } }
  assert.equal(decide(row).action, 'insert')
  assert.equal(decide({ ...row, city: 'Sydney' }).action, 'company_dupe')
  assert.equal(decide({ ...row, identity_review: { ...row.identity_review, existing_id: 'fake' } }).action, 'company_dupe')
})
function fakeDb({ reserved = false, changed = false } = {}) {
  const writes = []
  return { writes, from(table) {
    let mutation, filters = []
    const query = {
      select() { return this }, in(...args) { filters.push(args); return this }, eq(...args) { filters.push(args); return this }, limit() { return this },
      update(patch) { mutation = patch; return this },
      then(resolve) {
        if (mutation) { writes.push({ table, patch: mutation, filters }); return Promise.resolve(resolve({ data: changed ? [] : [{ id: old.id }], error: null })) }
        const data = table === 'lead_contacts' ? [old] : table === 'compass_outbound_reservations' && reserved ? [{ identity_key: 'email:' + old.email }] : []
        return Promise.resolve(resolve({ data, error: null }))
      }
    }
    return query
  } }
}
const input = { rows: [{ id: old.id, company: old.company, email: 'correct@example.com', email_verify_status: 'valid', identity_review: { ...review, reviewed_at: new Date().toISOString(), email_verified_at: new Date().toISOString() } }] }
test('review audit failure and outstanding reservation prevent address mutation', async () => {
  const mod = loadTypescript('src/lib/lead-commit.ts', { '@/lib/events': { appendEvidence: async () => { throw new Error('audit unavailable') } }, '@/lib/lead-mark': {} })
  const db = fakeDb()
  const result = await mod.commitLeadRows(db, input)
  assert.equal(result.updated, 0); assert.equal(db.writes.length, 0)
  assert.equal(result.failed[0].error, 'audit unavailable')
  const reserved = fakeDb({ reserved: true })
  const held = await mod.commitLeadRows(reserved, input)
  assert.equal(held.updated, 0); assert.match(held.failed[0].error, /reservation/)
})
test('conditional correction cannot overwrite concurrent lead changes', async () => {
  const audit = []
  const mod = loadTypescript('src/lib/lead-commit.ts', { '@/lib/events': { appendEvidence: async (...args) => audit.push(args[1]) }, '@/lib/lead-mark': {} })
  const db = fakeDb({ changed: true })
  const result = await mod.commitLeadRows(db, input)
  assert.equal(result.updated, 0); assert.equal(result.failed[0].error, 'lead_changed_since_review')
  assert.deepEqual(db.writes[0].filters, [['id', old.id], ['email', old.email], ['updated_at', old.updated_at]])
  assert.equal(audit[0].payload.previous.email, old.email)
})

test('reviewed unknown email replacement preserves unknown status and cannot replace verified or risky inboxes', () => {
  const row = { identity_review: { ...review, kind: 'replace_unverified_email' } }
  for (const status of [null, undefined, 'none']) {
    const result = decide(row, { email_verify_status: status })
    assert.equal(result.action, 'update')
    assert.equal(result.previous.email_verify_status, status)
  }
  for (const status of ['valid', 'invalid', 'catch_all', 'risky']) assert.equal(decide(row, { email_verify_status: status }).action, 'skip')
  assert.equal(decide(row, { email_verify_status: null, outbound_status: 'sent' }).action, 'skip')
})
