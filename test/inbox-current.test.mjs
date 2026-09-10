import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const ui = loadTypescript('src/lib/inbox-ui.ts')
const now = Date.parse('2026-09-10T09:00Z')
const lead = { id:'fixture', name:'Fixture', outbound_status:'replied', updated_at:'2026-09-10T08:00Z', instantly_synced_at:'2026-09-10T08:00Z', mirrored_at:'2026-09-10T08:00Z' }
test('metadata sync never makes an undated reply current', () => {
  const item = ui.projectInstantlyInboxItem(lead, undefined, now)
  assert.equal(item.occurredAt, '')
  assert.equal(ui.inboxScope(item, now), 'earlier')
})
test('source reply timestamp, not sync, determines current and history', () => {
  const old = ui.projectInstantlyInboxItem(lead, undefined, now, { at:'2026-07-10T08:00Z' })
  const fresh = ui.projectInstantlyInboxItem(lead, undefined, now, { at:'2026-09-10T08:00Z', note:'A real reply excerpt' })
  assert.equal(ui.inboxScope(old, now), 'earlier')
  assert.equal(ui.inboxScope(fresh, now), 'current')
  assert.equal(fresh.body, 'A real reply excerpt')
  assert.match(fresh.crmHref, /lead=fixture/)
})
test('only a genuinely newer reply reopens Done', () => {
  const lookup = new Map([['instantly:fixture', { triage:'done', updated_at:'2026-09-09T09:00Z' }]])
  assert.equal(ui.projectInstantlyInboxItem(lead, lookup, now).triage, 'done')
  assert.equal(ui.projectInstantlyInboxItem(lead, lookup, now, {at:'2026-09-08T09:00Z'}).triage, 'done')
  assert.equal(ui.projectInstantlyInboxItem(lead, lookup, now, {at:'2026-09-10T08:00Z'}).triage, 'unread')
})
test('external waits do not claim to need an operator decision', () => {
  const task = {id:'wait', title:'Await customer', status:'blocked', updated_at:'2026-09-10T08:00Z'}
  assert.equal(ui.inboxScope(ui.projectAgentInboxItem(task, undefined, now), now), 'earlier')
  const request = {...task, execution_contract:JSON.stringify({attention:{kind:'operator_decision',question:'Choose scope'}})}
  assert.equal(ui.inboxScope(ui.projectAgentInboxItem(request, undefined, now), now), 'current')
})
test('snoozed and completed remain distinct accessible scopes', () => {
  const item = ui.projectInstantlyInboxItem(lead, undefined, now, {at:'2026-09-10T08:00Z'})
  assert.equal(ui.inboxScope({...item,triage:'done'},now),'done')
  assert.equal(ui.inboxScope({...item,triage:'snoozed',snoozedUntil:'2026-09-11T08:00Z'},now),'snoozed')
  assert.equal(ui.inboxScope({...item,triage:'snoozed',snoozedUntil:'2026-09-10T08:00Z'},now),'current')
})
