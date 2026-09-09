import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac, generateKeyPairSync } from 'node:crypto'
import { harness, DEMO, START, qualifiedFacts, source, createDeliveryProviders, ProviderError } from './helpers/delivery-harness.mjs'

test('real migration and worker: qualify, offer, selected booking, CRM, explicit attendance', async t => {
  const h = await harness(); t.after(() => h.close())
  const input = { externalId: 'same-google-form' }
  const { id } = await h.intake(input)
  assert.equal((await h.intake(input)).id, id)
  await h.run()
  assert.equal((await h.get(id)).state.awaiting, 'service')
  for (const reply of ['Yes', 'Ryde', 'Yes', 'Next month', '10 Example Street']) {
    await h.reply(id, reply); await h.run()
  }
  const ready = await h.get(id)
  assert.equal(ready.state.stage, 'qualified')
  assert.equal(ready.state.offeredSlots.length, 2)
  assert.equal(ready.state.appointment, undefined)
  await h.reply(id, '2', { providerId: 'same-sms' }); await h.reply(id, '2', { providerId: 'same-sms' })
  await h.run()
  const booked = await h.get(id)
  assert.equal(booked.state.stage, 'booked')
  assert.equal(booked.state.appointment.slot.start, ready.state.offeredSlots[1].start)
  let snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.crm.length, 1)
  assert.equal(snapshot.events.filter(e => e.type === 'appointment.created').length, 1)
  h.advance(24 * 10); await h.run()
  snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.metrics.attended, 0, 'Time passing is not attendance')
  await h.store.command(DEMO, id, 'attendance-1', 'outcome', { stage: 'attended', evidence: 'Demo office confirmed attendance', occurredAt: h.now, actor: 'test' }, h.now)
  await h.run()
  assert.equal((await h.store.snapshot(DEMO, id)).metrics.attended, 1)
})

test('bare STOP suppresses every enquiry for the contact, including later intakes', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake({ facts: qualifiedFacts }); await h.run()
  await h.reply(id, 'STOP'); await h.run()
  const before = (await h.store.snapshot(DEMO)).messages.filter(m => m.direction === 'outbound').length
  const other = await h.intake(); await h.run(); h.advance(96); await h.run()
  assert.equal((await h.get(id)).control, 'stopped')
  assert.equal((await h.get(other.id)).control, 'stopped')
  assert.equal((await h.store.snapshot(DEMO)).messages.filter(m => m.direction === 'outbound').length, before)
  await assert.rejects(h.store.command(DEMO, id, 'resume', 'operator', { action: 'resume' }, h.now), /contact_opted_out/)
})

test('closed weekdays validate, quiet windows and structured facts are bounded', () => {
  const { configSchema, demoConfig } = source('src/lib/delivery-engine/config.ts')
  assert.deepEqual(configSchema.parse(demoConfig).hours.sun, [])
  const { nextContactTime } = source('src/lib/delivery-engine/rules.ts')
  assert.equal(nextContactTime('2026-09-09T12:00:00.000Z', 'Australia/Sydney', [9,18]), '2026-09-09T23:00:00.000Z')
})

test('restart retains the next action, and a stale worker cannot commit', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compass-delivery-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let h = await harness({ directory })
  const { id } = await h.intake()
  const abandoned = await h.store.claim(h.now, DEMO)
  assert.ok(abandoned)
  assert.equal(await h.store.claim(h.now, DEMO), null, 'Only one lease per enquiry')
  await h.close()
  h = await harness({ directory, existing: true }); t.after(() => h.close())
  h.advance(3 / 60)
  const replacement = await h.store.claim(h.now, DEMO)
  assert.equal(replacement.job.id, abandoned.job.id)
  assert.notEqual(replacement.job.lease_token, abandoned.job.lease_token)
  assert.equal(await h.store.finish(abandoned, { state: { corrupted: true } }, h.now), false)
  const { transition } = source('src/lib/delivery-engine/rules.ts')
  await h.store.finish(replacement, transition(replacement), h.now)
  await h.run()
  assert.equal((await h.get(id)).state.awaiting, 'service')
  assert.equal((await h.store.snapshot(DEMO, id)).messages.filter(m => m.direction === 'outbound').length, 1)
})

test('an interrupted SMS is uncertain and never blindly resent', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake(); await h.run({ limit: 1 })
  const sending = await h.store.claim(h.now, DEMO)
  assert.equal(sending.job.kind, 'sms')
  assert.equal(await h.store.gate(sending, true, h.now), true)
  h.advance(3 / 60); await h.run(); h.advance(96); await h.run()
  const snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.jobs.find(j => j.id === sending.job.id).status, 'uncertain')
  assert.equal(snapshot.messages.length, 0)
  assert.equal(snapshot.enquiries[0].control, 'human')
  assert.match(snapshot.enquiries[0].state.handoff.reason, /Interrupted delivery/)
  await assert.rejects(h.store.command(DEMO, id, 'unsafe-resume', 'operator', { action: 'resume' }, h.now), /provider_reconciliation_required/)
})

test('STOP during a provider send persists the actual result but fences later messages', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake()
  let calls = 0
  await h.run({ providers: { ...h.providers, sms: async () => { calls++; await h.reply(id, 'STOP'); return { id: 'sent-before-stop', status: 'sent' } } } })
  h.advance(96); await h.run()
  assert.equal(calls, 1)
  const snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.enquiries[0].control, 'stopped')
  assert.equal(snapshot.messages.filter(m => m.direction === 'outbound').length, 1)
})

test('delivery callbacks arriving before the send response are replayed and monotonic', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake()
  await h.run({ providers: { ...h.providers, sms: async () => {
    await h.store.rpc('delivery_message_status', { p_account_id: DEMO, p_provider_id: 'early-receipt', p_status: 'undelivered', p_now: h.now })
    return { id: 'early-receipt', status: 'queued' }
  } } })
  await h.store.rpc('delivery_message_status', { p_account_id: DEMO, p_provider_id: 'early-receipt', p_status: 'sent', p_now: h.now })
  const snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.messages.find(m => m.direction === 'outbound').status, 'undelivered')
  assert.equal(snapshot.enquiries[0].control, 'human')
  assert.equal(snapshot.events.filter(e => e.type === 'sms.undelivered').length, 1)
})

test('multiple queued replies produce one current response, with no obsolete questions', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake(); await h.run()
  const before = (await h.store.snapshot(DEMO, id)).messages.length
  await h.reply(id, 'Yes'); await h.reply(id, 'Ryde'); await h.run()
  const snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.enquiries[0].state.awaiting, 'homeowner')
  assert.equal(snapshot.messages.length, before + 3, 'Two replies and one current outgoing question')
  assert.match(snapshot.messages.at(-1).body, /homeowner or authorised/)
})

test('competing choices cannot reserve the same assessment resource', async t => {
  const h = await harness(); t.after(() => h.close())
  const first = await h.intake({ facts: qualifiedFacts, phone: '0400000001' })
  const second = await h.intake({ facts: qualifiedFacts, phone: '0400000002' })
  await h.run()
  assert.equal((await h.get(first.id)).state.offeredSlots[0].start, (await h.get(second.id)).state.offeredSlots[0].start)
  await h.reply(first.id, '1'); await h.reply(second.id, '1'); await h.run()
  const entries = (await h.store.snapshot(DEMO)).enquiries
  assert.equal(entries.filter(e => e.state.appointment?.status === 'confirmed').length, 1)
  assert.equal(entries.filter(e => e.control === 'human').length, 1)
  const third = await h.intake({ facts: qualifiedFacts, phone: '0400000003' }); await h.run()
  const booked = entries.find(e => e.state.appointment?.status === 'confirmed').state.appointment.slot
  assert.ok((await h.get(third.id)).state.offeredSlots.every(s => s.start !== booked.start))
})

test('rescheduling preserves the booking until replacement; cancellation releases capacity', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake({ facts: qualifiedFacts }); await h.run()
  await h.reply(id, '1'); await h.run()
  const original = (await h.get(id)).state.appointment
  await h.reply(id, 'reschedule'); await h.run()
  assert.equal((await h.get(id)).state.appointment.slot.start, original.slot.start)
  await h.reply(id, '2'); await h.run()
  const moved = (await h.get(id)).state.appointment
  assert.equal(moved.id, original.id)
  assert.notEqual(moved.slot.start, original.slot.start)
  await h.reply(id, 'cancel appointment'); await h.run()
  assert.equal((await h.get(id)).state.appointment.status, 'cancelled')
  assert.equal((await h.get(id)).control, 'active', 'Cancel appointment is not an SMS opt-out')
  assert.equal((await h.db.query("select count(*)::int as n from delivery_reservations where status<>'released'")).rows[0].n, 0)
  await h.reply(id, 'ducted replacement'); await h.run(); await h.reply(id, '1'); await h.run()
  assert.notEqual((await h.get(id)).state.appointment.id, original.id, 'New booking after cancellation has a new provider ID')
})

test('failed calendar writes retain old booking and never send a new confirmation', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake({ facts: qualifiedFacts }); await h.run(); await h.reply(id, '1'); await h.run()
  const original = (await h.get(id)).state.appointment
  await h.reply(id, 'reschedule'); await h.run(); await h.reply(id, '2')
  await h.run({ providers: { ...h.providers, book: async () => { throw new ProviderError('calendar_write_result_unknown', true) } } })
  const snapshot = await h.store.snapshot(DEMO, id)
  assert.deepEqual(snapshot.enquiries[0].state.appointment, original)
  assert.equal(snapshot.enquiries[0].control, 'human')
  assert.equal(snapshot.events.filter(e => e.type === 'appointment.rescheduled').length, 0)
  assert.equal(snapshot.jobs.filter(j => j.status === 'uncertain').length, 1)
})

test('human takeover immediately fences automation and persists a named owner', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake(); await h.run({ limit: 1 })
  await h.store.command(DEMO, id, 'takeover-1', 'operator', { action: 'takeover', reason: 'Office calling the homeowner', actor: 'test-operator' }, h.now)
  await h.run(); h.advance(96); await h.run()
  const snapshot = await h.store.snapshot(DEMO, id)
  assert.equal(snapshot.messages.length, 0)
  assert.equal(snapshot.enquiries[0].state.handoff.owner, 'Demo office')
  await h.store.command(DEMO, id, 'office-send-1', 'operator', { action: 'send', body: 'Demo office: Here is the update.', actor: 'test-operator' }, h.now)
  await h.run()
  assert.equal((await h.store.snapshot(DEMO, id)).messages.length, 1)
})

test('finite follow-ups are 24 and 72 hours from the latest question', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake(); await h.run()
  h.advance(24); await h.run()
  assert.equal((await h.get(id)).state.followups, 1)
  h.advance(48); await h.run()
  assert.equal((await h.get(id)).state.followups, 2)
  h.advance(24 * 30); await h.run()
  assert.equal((await h.store.snapshot(DEMO, id)).messages.filter(m => m.direction === 'outbound').length, 3)
})

test('unknown or ambiguous replies remain assignable and cannot cross account or phone boundaries', async t => {
  const h = await harness(); t.after(() => h.close())
  const one = await h.intake(); await h.intake()
  const received = await h.store.receive({ accountId: DEMO, providerId: 'ambiguous', phone: '+61400000001', body: 'Yes', stop: false }, h.now)
  assert.equal(received.unassigned, true)
  const wrongPhone = await h.intake({ phone: '0400000009' })
  await assert.rejects(h.store.rpc('delivery_assign_reply', { p_message_id: received.id, p_enquiry_id: wrongPhone.id, p_now: h.now }), /enquiry_not_found/)
  const otherAccount = 'd0000000-0000-4000-8000-000000000002'
  await h.db.query("insert into delivery_accounts(id,mode,enabled,config,crm_kind) select $1,'demo',true,config,'demo' from delivery_accounts where id=$2", [otherAccount, DEMO])
  const other = await h.intake({ accountId: otherAccount })
  await assert.rejects(h.store.command(DEMO, other.id, 'wrong-account', 'operator', { action: 'takeover' }, h.now), /enquiry_not_found/)
  await assert.rejects(h.store.rpc('delivery_assign_reply', { p_message_id: received.id, p_enquiry_id: other.id, p_now: h.now }), /enquiry_not_found/)
  assert.equal(await h.store.rpc('delivery_assign_reply', { p_message_id: received.id, p_enquiry_id: one.id, p_now: h.now }), true)
  assert.equal((await h.store.snapshot(DEMO)).unassigned.length, 0)
})

test('database browser roles cannot execute delivery mutations or read other clients as customers', async t => {
  const h = await harness(); t.after(() => h.close())
  await h.intake()
  await h.db.exec('set role authenticated')
  assert.equal((await h.db.query('select count(*)::int as n from delivery_enquiries')).rows[0].n, 0)
  await assert.rejects(h.db.query('select delivery_snapshot()'), /permission denied/)
  await assert.rejects(h.db.query("update delivery_enquiries set control='active'"), /permission denied/)
  await h.db.exec("set test.operator='true'")
  assert.equal((await h.db.query('select count(*)::int as n from delivery_enquiries')).rows[0].n, 1)
  await assert.rejects(h.db.query('select delivery_claim(now())'), /permission denied/)
  await h.db.exec('reset role; set role anon')
  await assert.rejects(h.db.query('select * from delivery_enquiries'), /permission denied/)
  await h.db.exec('reset role')
})

test('demo time advance is idempotent and cannot target a live client', async t => {
  const h = await harness(); t.after(() => h.close())
  await h.db.query('update delivery_accounts set demo_now=$1 where id=$2', [START, DEMO])
  const args = { p_account_id: DEMO, p_hours: 24, p_key: 'advance-1' }
  assert.equal(new Date(await h.store.rpc('delivery_demo_advance', args)).toISOString(), '2026-09-10T00:00:00.000Z')
  assert.equal(new Date(await h.store.rpc('delivery_demo_advance', args)).toISOString(), '2026-09-10T00:00:00.000Z')
  await h.db.query("insert into compass_clients(id) values('test-client')")
  await h.db.query("update delivery_accounts set mode='live',client_id='test-client',crm_kind='manual' where id=$1", [DEMO])
  await assert.rejects(h.store.rpc('delivery_demo_advance', { ...args, p_key: 'advance-2' }), /demo_only/)
})

test('qualification does not confuse a neighbouring suburb or manufacture an outcome', () => {
  const { interpret, validateOutcome } = source('src/lib/delivery-engine/rules.ts')
  const { initialState, intakeSchema } = source('src/lib/delivery-engine/config.ts')
  const state = initialState(); state.awaiting = 'suburb'
  assert.equal(interpret('West Ryde', state, ['Ryde']).facts.suburb, 'West Ryde')
  assert.equal(interpret('How much will it cost?', state, ['Ryde']).intent, 'human')
  assert.equal(intakeSchema.safeParse({ accountId: DEMO, externalId: 'test', name: 'Demo', phone: 'not a phone', facts: {}, consent: { sms: true, wording: 'demo', source: 'demo', recordedAt: START }, attribution: { source: 'google_search' } }).success, false)
  assert.throws(() => validateOutcome(state, { stage: 'won', evidence: 'Guess', occurredAt: START }, START), /No confirmed/)
})

test('live actions require the global gate and SMS permission cannot be overridden by office controls', async t => {
  const h = await harness(); t.after(() => h.close())
  const { id } = await h.intake({ consent: { sms: false, wording: 'Demo did not agree to SMS', source: 'demo', recordedAt: START } })
  await h.run()
  assert.equal((await h.store.snapshot(DEMO, id)).messages.length, 0)
  await assert.rejects(h.store.command(DEMO, id, 'send-without-consent', 'operator', { action: 'send', body: 'Hello' }, h.now), /sms_permission_missing/)
  await h.intake({ phone: '0400000009' })
  await h.db.query("insert into compass_clients(id) values('test-live-client')")
  await h.db.query("update delivery_accounts set mode='live',client_id='test-live-client',crm_kind='manual' where id=$1", [DEMO])
  let called = false
  const result = await h.run({ limit: 1, providers: { ...h.providers, sms: async () => { called = true; throw Error('Unexpected live send') } } })
  assert.equal(result.deferred, 1)
  assert.equal(called, false)
})

test('Twilio signatures bind all form fields and query parameters, and missing secrets fail closed', async () => {
  const { verifiedTwilioForm, boundedText } = source('src/lib/delivery-engine/http.ts')
  const env = { TWILIO_AUTH_TOKEN: 'test-secret-only', TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, COMPASS_DELIVERY_PUBLIC_ORIGIN: 'https://example.com' }
  const url = 'https://example.com/api/delivery-engine/webhooks/twilio?edge=one'
  const form = new URLSearchParams({ AccountSid: env.TWILIO_ACCOUNT_SID, MessageSid: `SM${'2'.repeat(32)}`, From: '+61400000001', To: '+61400000002', Body: 'Yes', NewTwilioField: 'must-be-signed' })
  const canonical = [...form].sort(([a],[b]) => a < b ? -1 : 1).reduce((s,[k,v]) => s + k + v, url)
  const signature = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(canonical).digest('base64')
  const request = (path = url, body = form.toString()) => new Request(path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body })
  assert.equal((await verifiedTwilioForm(request(), env)).get('Body'), 'Yes')
  await assert.rejects(verifiedTwilioForm(request(url.replace('one', 'two')), env), /Invalid webhook signature/)
  await assert.rejects(verifiedTwilioForm(request(url, form.toString().replace('Body=Yes', 'Body=STOP')), env), /Invalid webhook signature/)
  await assert.rejects(verifiedTwilioForm(request(), {}), /not configured/)
  await assert.rejects(boundedText(new Request(url, { method: 'POST', body: 'x'.repeat(100) }), 50), /too large/)
})

test('Google adapter reconciles retries, checks buffered availability and uses one stable ID', async () => {
  const { demoConfig, initialState } = source('src/lib/delivery-engine/config.ts')
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  const env = { COMPASS_DELIVERY_LIVE: '1', GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'test@example.com', private_key: privateKey }) }
  const state = initialState(); state.facts = qualifiedFacts
  const ctx = { now: START, account: { id: DEMO, mode: 'live', config: demoConfig, calendar_id: 'test-calendar' }, enquiry: { id: 'd0000000-0000-4000-8000-000000000099', name: 'Demo', phone: '+61400000001', state }, job: { id: 'test-job' } }
  const slot = { start: '2026-09-10T02:00:00.000Z', end: '2026-09-10T03:00:00.000Z', label: 'Demo Thursday' }
  let saved = null; let writes = 0; const checked = []
  const fetcher = async (url, options) => {
    if (url.includes('/token')) return Response.json({ access_token: 'test-token', expires_in: 3600 })
    if (url.endsWith('/freeBusy')) { checked.push(JSON.parse(options.body)); return Response.json({ calendars: { 'test-calendar': { busy: [] } } }) }
    if (url.includes('/events?')) return Response.json({ items: saved ? [saved] : [] })
    if (options.method === 'POST' || options.method === 'PUT') { writes++; saved = { ...JSON.parse(options.body), etag: 'test-etag', status: 'confirmed' }; return Response.json(saved) }
    return saved ? Response.json(saved) : new Response('', { status: 404 })
  }
  const provider = createDeliveryProviders({ env, fetch: fetcher })
  const first = await provider.book(ctx, slot, '0123456789abcdef')
  assert.equal(first.id, 'sf0123456789abcdef')
  assert.equal(checked[0].timeMin, '2026-09-10T01:30:00.000Z')
  await provider.book(ctx, slot, '0123456789abcdef')
  assert.equal(writes, 1, 'Provider reconciliation prevents a duplicate event')
  ctx.enquiry.state.appointment = first
  const next = { ...slot, start: '2026-09-10T02:30:00.000Z', end: '2026-09-10T03:30:00.000Z' }
  await provider.book(ctx, next, first.id)
  assert.equal(saved.id, first.id, 'No double sf prefix during rescheduling')
  assert.equal(writes, 2)
  // A staff change to the existing booking is not overwritten automatically.
  saved.start.dateTime = '2026-09-11T02:00:00.000Z'
  await assert.rejects(provider.book(ctx, slot, first.id), /calendar_changed_by_staff/)
})
