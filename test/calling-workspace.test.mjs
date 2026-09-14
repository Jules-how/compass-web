import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const c = loadTypescript('src/lib/calling-workspace.ts')
const id = '00000000-0000-4000-8000-000000000001'
const now = new Date('2026-09-14T03:00:00Z')
const lead = { id: 'fixture-a', company: 'Fixture installer', phone: '0295550101', icp_status: 'pass', rhythm_revision: 3, rhythm_timezone: 'Australia/Perth', contact_restrictions: {} }
const detail = { lead, tasks: [], touches: [] }
test('captures use the selected canonical identity and current revision, with no task completion by default', () => {
  const draft = { ...c.newCallingDraft(lead), note: 'No answer', outcome: 'no_answer' }
  const command = c.callingCapture(detail, draft, id, now.toISOString())
  assert.equal(command.lead_id, lead.id)
  assert.equal(command.revision, 3)
  assert.equal(command.request_id, id)
  assert.equal(command.complete_task, undefined)
  assert.equal(command.disposition, 'unresolved')
  assert.equal(command.channel, 'call')
})
test('callback timezone, accepted promises and unresolved dates retain distinct meanings', () => {
  const draft = { ...c.newCallingDraft(lead), outcome: 'decision_maker', title: 'Call the owner', due: '2026-09-15T10:00', agreed: true }
  const p = c.callingCapture(detail, draft, id, now.toISOString())
  assert.equal(p.next.due, '2026-09-15T02:00:00.000Z')
  assert.equal(p.next.state, 'accepted')
  assert.equal(p.disposition, 'schedule')
  const unresolved = c.callingCapture(detail, { ...draft, due: '' }, id, now.toISOString())
  assert.equal(unresolved.next.state, 'proposed')
  assert.equal(unresolved.next.due, undefined)
  assert.equal(unresolved.disposition, 'unresolved')
})
test('saving a closure does not carry hidden follow-up fields into the command', () => {
  const p = c.callingCapture(detail, { ...c.newCallingDraft(lead), outcome: 'not_interested', disposition: 'closed', note: 'Does not want more work.', title: 'An old draft follow-up', due: 'invalid' }, id, now.toISOString())
  assert.equal(p.next, undefined)
  assert.equal(p.disposition, 'closed')
  const restriction = c.callingCapture(detail, { ...c.newCallingDraft(lead), outcome: 'do_not_contact', disposition: 'closed', note: 'Asked for no further contact.', title: 'An old draft follow-up' }, id, now.toISOString())
  assert.equal(restriction.next, undefined)
  assert.equal(restriction.restriction, 'unknown')
})
test('pending retries survive reload with the identical payload and cannot move to a different contact', () => {
  const draft = { ...c.newCallingDraft(lead), outcome: 'no_answer', note: 'Call notes' }
  const pending = c.callingCapture(detail, draft, id, now.toISOString())
  const raw = JSON.stringify({ draft, pending })
  assert.deepEqual(c.parseStoredCallingDraft(raw, lead.id), { draft, pending })
  assert.equal(c.parseStoredCallingDraft(raw, 'fixture-b'), null)
  assert.equal(c.parseStoredCallingDraft('not json', lead.id), null)
})
test('validation holds incomplete outcomes, ambiguous DST times, unauthorised texts and restrictions', () => {
  const d = { ...c.newCallingDraft(lead), outcome: 'decision_maker' }
  assert.throws(() => c.callingCapture(detail, { ...d, outcome: '' }, id, now.toISOString()), /Choose/)
  assert.throws(() => c.callingCapture(detail, { ...d, disposition: 'closed' }, id, now.toISOString()))
  assert.throws(() => c.callingCapture(detail, { ...d, title: 'Callback', timezone: 'Australia/Sydney', due: '2026-10-04T02:30' }, id, now.toISOString()), /does not exist/)
  assert.throws(() => c.callingCapture(detail, { ...d, nextChannel: 'sms', title: 'Text owner' }, id, now.toISOString()))
  assert.throws(() => c.callingCapture(detail, { ...d, outcome: 'do_not_contact', title: 'Callback' }, id, now.toISOString()), /restriction/)
})
test('existing follow-up completion is explicit and checked against current open tasks', () => {
  const task = { id: 'task-1', status: 'not-started', updated_at: '2026-09-14T01:00:00Z' }
  const draft = { ...c.newCallingDraft(lead), outcome: 'decision_maker', completeTask: task.id }
  assert.throws(() => c.callingCapture(detail, draft, id, now.toISOString()), /changed/)
  const p = c.callingCapture({ ...detail, tasks: [task] }, draft, id, now.toISOString())
  assert.equal(p.task_id, task.id)
  assert.equal(p.expected_updated_at, task.updated_at)
  assert.equal(p.complete_task, true)
})
test('due call promises lead the queue while restricted and missing phones stay held', () => {
  const blocked = { ...lead, id: 'blocked', contact_restrictions: { call: { note: 'Do not call' } } }
  const missing = { ...lead, id: 'missing', phone: null }
  const followup = { ...lead, id: 'followup' }
  const data = { leads: [lead, blocked, missing, followup], touches: [], tasks: [{ id: 'promise', lead_id: 'followup', outreach_channel: 'call', outreach_state: 'accepted', due: '2026-09-14T02:00:00Z', status: 'not-started' }] }
  assert.equal(c.sortedCallingQueue(data, now)[0].id, 'followup')
  assert.equal(c.callingQueueStatus(blocked, [], [], now).kind, 'held')
  assert.equal(c.callingQueueStatus(missing, [], [], now).kind, 'held')
})
test('recorded call metrics exclude emails, gatekeepers from buyer conversations and other days', () => {
  const touch = { contact_id: lead.id, channel: 'call', direction: 'outbound', contacted_at: now.toISOString() }
  const totals = c.callingMetrics([{ ...touch, outcome: 'no_answer' }, { ...touch, outcome: 'office_reached' }, { ...touch, outcome: 'decision_maker' }, { ...touch, outcome: 'meeting_agreed' }, { ...touch, outcome: 'email_sent', channel: 'email' }, { ...touch, outcome: 'decision_maker', contacted_at: '2026-09-10T01:00Z' }], now)
  assert.deepEqual(totals, { attempts: 4, conversations: 1, meetings: 1 })
})
test('research preserves real claims without fabricating size or advertising activity', () => {
  assert.deepEqual(c.callingFacts(null), [])
  const facts = c.callingFacts([{ kind: 'specialty', claim: 'Installs ducted systems.', url: 'https://example.test/services' }, { kind: 'about', claim: 'Five staff', url: 'javascript:alert(1)' }])
  assert.equal(facts[0].claim, 'Installs ducted systems.')
  assert.equal(facts[1].url, null)
  assert.equal(c.safeCallingUrl('tel:0295550101'), null)
})
