import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { loadTypescript } from './helpers/load-typescript.mjs'
import { fixture } from './helpers/outbound-fixture.mjs'
const p = loadTypescript('src/lib/outbound-preparation.ts')
const server = loadTypescript('src/lib/outbound-preparation-server.ts', {
  './instantly': {},
  './instantly-write': {}
})
const fixturePath = 'test/fixtures/outbound-worker-renders.json'
const renders = fs.existsSync(fixturePath)
  ? JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  : {}
if (process.env.RECORD_OUTBOUND_RENDER_FIXTURES === '1')
  process.on('exit', () =>
    fs.writeFileSync(fixturePath, JSON.stringify(renders, null, 2) + '\n')
  )
function render(context, candidates) {
  const key = p.digest([context, candidates])
  const root = process.env.SWITCHFLOW_WORKSPACE
  if (!root) {
    assert.ok(renders[key], 'Missing Python-produced fixture ' + key)
    return structuredClone(renders[key])
  }
  const result = spawnSync(
    'python3',
    [
      '-c',
      `import json,sys;sys.path.insert(0,${JSON.stringify(path.join(root, 'cold-email/openers'))});from generate_openers import render_preparation_ticket; print(json.dumps(render_preparation_ticket(json.load(sys.stdin))))`
    ],
    { input: JSON.stringify({ context, candidates }), encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  if (process.env.RECORD_OUTBOUND_RENDER_FIXTURES === '1') renders[key] = output
  else
    assert.deepEqual(
      output,
      renders[key],
      'Production worker changed: review and regenerate fixtures'
    )
  return output
}
function bundle(f = fixture()) {
  return p.prepareBundle(
    f.context,
    [f.candidate],
    f.ledger,
    render(f.context, [f.candidate])
  )
}
function remote(b) {
  return {
    ...p.instantlyExpected(b),
    status: 0,
    campaign_schedule: {
      schedules: [
        {
          timezone: 'Australia/Sydney',
          timing: { from: '09:00', to: '17:00' },
          days: {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true
          }
        }
      ]
    }
  }
}
function recipient(b) {
  const v = b.records[0].rendered.values
  return {
    id: 'provider-1',
    email: v.email,
    first_name: v.first_name,
    company_name: v.company_name,
    personalization: v.personalization,
    custom_variables: { ...v }
  }
}

test('production Python output is accepted and full emails retain signature and opt-out', () => {
  const b = bundle()
  assert.deepEqual(b.counts, { total: 1, pass: 1, hold: 0, exclude: 0 })
  assert.match(b.records[0].rendered.steps[0].body, /Jules, Switchflow/)
  assert.match(b.records[0].rendered.steps[0].body, /Unsubscribe/)
  assert.equal(b.records[0].rendered.values.first_name, '')
  assert.match(b.records[0].rendered.values.opener, /^Saw/)
  assert.equal(b.records[0].rendered.steps[1].subject, '')
  assert.equal(p.instantlyExpected(b).sequences[0].steps[0].delay, 2)
})
test('missing inbox, source facts, unpublished name and pending verification remain holds', () => {
  for (const mutate of [
    (f) => (f.candidate.email = ''),
    (f) => (f.candidate.evidence = []),
    (f) => delete f.candidate.verification,
    (f) => (f.candidate.identity_reviewed = false),
    (f) => (f.ledger[0].suppression_reason = 'opted_out'),
    (f) => (f.ledger[0].outbound_status = 'contacted')
  ]) {
    const f = fixture()
    mutate(f)
    const b = bundle(f)
    assert.equal(b.counts.hold, 1)
    assert.equal(b.counts.total, 1)
  }
})
test('only valid verification passes; uncertain results retain their labels', () => {
  for (const status of ['catch_all', 'unknown', 'risky', 'error']) {
    const f = fixture()
    f.candidate.verification.status = status
    assert.equal(bundle(f).counts.pass, 0)
  }
  const f = fixture()
  f.candidate.verification.checked_at = ''
  assert.equal(bundle(f).counts.pass, 0)
})
test('contradictory, invalid or missing quoted evidence cannot pass', () => {
  for (const value of ['split systems', 'ducted installation']) {
    const f = fixture()
    f.candidate.evidence.push({
      kind: 'service',
      value,
      quote: value,
      url: value === 'split systems' ? 'https://example.test' : '',
      observed_at: '2026-09-01T00:00:00Z'
    })
    assert.equal(bundle(f).counts.hold, 1)
  }
})
test('person names only come from quoted person evidence', () => {
  const f = fixture()
  f.candidate.email = 'james@example.test'
  f.candidate.evidence.find((e) => e.kind === 'email').value = f.candidate.email
  f.candidate.evidence.find((e) => e.kind === 'email').quote = f.candidate.email
  f.ledger[0].email = f.candidate.email
  assert.equal(bundle(f).records[0].rendered.values.first_name, '')
  f.candidate.evidence.push({
    kind: 'person_name',
    value: 'Morgan Example',
    quote: 'Morgan Example',
    url: 'https://example.test/team',
    observed_at: '2026-09-01T00:00:00Z'
  })
  assert.match(bundle(f).records[0].rendered.values.opener, /^Hi Morgan, saw /)
})
test('blank or unknown used merges fail; an unused blank name is allowed', () => {
  for (const token of ['{{firstName}}', '{{made_up}}', '{service}']) {
    const f = fixture()
    f.context.sequence.steps[0].slots[1].body += token
    assert.equal(bundle(f).counts.hold, 1)
  }
  assert.throws(() => p.substitute('{{service}}', { service: '' }), /blank/)
  assert.throws(() => p.substitute('{{service}}', { service: ' ' }), /blank/)
})
test('duplicate selected company and inbox are retained on hold', () => {
  const f = fixture()
  const duplicate = { ...f.candidate, id: 'candidate-2' }
  const b = p.prepareBundle(
    f.context,
    [f.candidate, duplicate],
    f.ledger,
    render(f.context, [f.candidate, duplicate])
  )
  assert.deepEqual(b.counts, { total: 2, pass: 1, hold: 1, exclude: 0 })
})
test('a second ledger company or inbox holds outreach even when uncontacted', () => {
  const f = fixture()
  f.ledger.push({ ...f.ledger[0], id: 'other' })
  assert.equal(bundle(f).counts.hold, 1)
})
test('missing inboxes stay held without matching unrelated blank inboxes', () => {
  const f = fixture()
  f.candidate.email = ''
  f.ledger[0].email = ''
  f.ledger.push({ ...f.ledger[0], id: 'unrelated', company_domain: 'unrelated.test' })
  const reasons = p.assessCandidate(f.candidate, f.context, f.ledger)
  assert.ok(reasons.includes('missing_or_invalid_email'))
  assert.ok(!reasons.some((reason) => reason.startsWith('company_or_inbox_overlap:')))
  f.ledger[1].company_domain = f.ledger[0].company_domain
  assert.ok(p.assessCandidate(f.candidate, f.context, f.ledger).includes('company_or_inbox_overlap:unrelated'))
})
test('render tampering and unknown output IDs fail closed', () => {
  const f = fixture()
  const outputs = render(f.context, [f.candidate])
  outputs[0].steps[0].body = 'Invented pain claim'
  assert.equal(
    p.prepareBundle(f.context, [f.candidate], f.ledger, outputs).counts.pass,
    0
  )
  outputs[0].candidate_id = 'not-requested'
  assert.throws(
    () => p.prepareBundle(f.context, [f.candidate], f.ledger, outputs),
    /invalid_render_set/
  )
})
test('hashes change with sequence, settings, evidence and verification', () => {
  const b = bundle()
  for (const mutate of [
    (f) => f.context.settings.daily_limit++,
    (f) => (f.context.sequence.steps[1].slots[0].body += ' Extra.'),
    (f) => (f.candidate.evidence[0].observed_at = '2026-08-01T00:00:00Z'),
    (f) => (f.candidate.verification.provider = 'other-test-provider')
  ]) {
    const f = fixture()
    mutate(f)
    assert.notEqual(bundle(f).hash, b.hash)
  }
})
test('settings and body structure are gated without crashes', () => {
  for (const mutate of [
    (f) => (f.context.sequence.steps[1].delay_days = 1),
    (f) => (f.context.settings.from = '99:99'),
    (f) => (f.context.sequence.steps[0].slots = null),
    (f) => (f.context.offer.offer_key = 'booked-jobs-system'),
    (f) => f.context.sequence.steps[0].slots.pop()
  ]) {
    const f = fixture()
    mutate(f)
    assert.ok(p.contextErrors(f.context).length)
  }
})
test('readback demands paused state, exact sequences, sender pool and schedule', () => {
  const b = bundle()
  server.verifyPausedCampaign(b, remote(b))
  for (const mutate of [
    (r) => (r.status = 1),
    (r) => (r.sequences[0].steps[0].delay = 1),
    (r) => (r.sequences[0].steps[1].variants[0].subject = 'new thread'),
    (r) => (r.open_tracking = true),
    (r) => (r.email_list = ['other@example.test']),
    (r) => (r.campaign_schedule.schedules[0].days.saturday = true),
    (r) =>
      (r.sequences[0].steps[0].variants[0].body =
        r.sequences[0].steps[0].variants[0].body.replace(
          '{{unsubscribe}}',
          'https://bad.test'
        ))
  ]) {
    const r = remote(b)
    mutate(r)
    assert.throws(() => server.verifyPausedCampaign(b, r))
  }
})
test('partial browser loads only confirm exact recipient and merge matches', () => {
  const b = bundle()
  assert.equal(p.reconcileRecipients(b, [recipient(b)]).complete, true)
  assert.equal(p.reconcileRecipients(b, []).receipts[0].status, 'missing')
  const lead = recipient(b)
  lead.custom_variables.service = 'changed'
  assert.equal(
    p.reconcileRecipients(b, [lead]).receipts[0].status,
    'variables_mismatch'
  )
  assert.equal(
    p.reconcileRecipients(b, [recipient(b), recipient(b)]).receipts[0].status,
    'conflict'
  )
  assert.equal(
    p.reconcileRecipients(b, [
      recipient(b),
      { id: 'extra', email: 'extra@example.test' }
    ]).complete,
    false
  )
})
test('CSV transports reviewed values, with proper quoting and blank unnamed fields', () => {
  const b = bundle()
  const csv = p.transportCsv(b)
  assert.match(csv, /\r\n/)
  assert.match(csv, /'|"Saw Example Air/)
  assert.match(csv, /"work@example.test","",""/)
  assert.equal(csv.trimEnd().split('\r\n').length, 2)
})


test('current evidence drafts qualify Perth mixed single-split installers without ownership wording', () => {
  const f = fixture(); f.context.city='Perth'; f.context.settings.timezone='Australia/Perth';
  f.context.recipe.mode='evidence_draft';
  f.candidate.evidence=f.candidate.evidence.filter(e=>!['independent','residential','quote'].includes(e.kind));
  const service=f.candidate.evidence.find(e=>e.kind==='service'); service.value=service.quote='We install split system air conditioning for homes and businesses.';
  const area=f.candidate.evidence.find(e=>e.kind==='service_area'); area.value=area.quote='Perth';
  f.candidate.evidence.push({...area,kind:'operating',value:'Perth',quote:'Perth'});
  f.candidate.geography={...f.candidate.geography,region:'greater_perth'};
  f.candidate.identity_reviewed=false;
  f.candidate.outreach_review={status:'uncontacted',source:'Live provider receipt',checked_at:new Date().toISOString()};
  f.candidate.draft={subject:'Split installation quotes',opener:'Saw your split-system installation service covers homes and businesses. That gives us a clear installation focus for a search campaign.',signal_type:'basic_relevance',offer_connection:'Installation-intent searches',evidence_kinds:['service']};
  f.ledger[0].pipeline_campaign_id='another-unsent-assignment';
  const output=[{candidate_id:f.candidate.id,values:p.expectedValues(f.candidate,f.context.recipe,'Perth')}];
  const values={...output[0].values,unsubscribe:'[Unsubscribe]'};
  output[0].steps=f.context.sequence.steps.map(step=>({subject:p.substitute(step.subject,values),body:p.substitute(step.slots.filter(s=>s.key!=='subject' && s.body.trim()).map(s=>s.body.trim()).join('\n\n'),values)}));
  const root=process.env.SWITCHFLOW_WORKSPACE || path.resolve('workers/outbound');
  const actual=spawnSync('python3',['-c',`import json,sys;sys.path.insert(0,${JSON.stringify(path.join(root,'cold-email/openers'))});from generate_openers import render_preparation_ticket;print(json.dumps(render_preparation_ticket(json.load(sys.stdin))))`],{input:JSON.stringify({context:f.context,candidates:[f.candidate]}),encoding:'utf8'});
  assert.equal(actual.status,0,actual.stderr);assert.deepEqual(JSON.parse(actual.stdout),output);
  const b=p.prepareBundle(f.context,[f.candidate],f.ledger,output);
  assert.equal(b.counts.pass,1,JSON.stringify(b.records));
  const replyOptOut=structuredClone(f.context); for(const step of replyOptOut.sequence.steps) step.slots.find(s=>s.key==='spam_act_opt_out').body='Not relevant? Reply “no thanks” and I’ll leave it there.'; assert.ok(!p.contextErrors(replyOptOut).some(e=>e.startsWith('unsubscribe_required')));
  const wrongZone=structuredClone(f.context);wrongZone.settings.timezone='Australia/Sydney';
  assert.ok(p.contextErrors(wrongZone).includes('city_timezone_mismatch'));
  f.ledger[0].outbound_status='contacted';
  assert.equal(p.prepareBundle(f.context,[f.candidate],f.ledger,output).counts.pass,0);
});

test('installation evidence accepts aircon and HVAC terminology but still requires installation', () => {
  const f = fixture(); f.context.recipe.mode = 'evidence_draft';
  const service = f.candidate.evidence.find(e => e.kind === 'service');
  for (const value of ['Aircon installation and replacement', 'HVAC installation for local homes']) {
    service.value = service.quote = value;
    assert.ok(!p.assessCandidate(f.candidate, f.context, f.ledger).includes('ac_installation_unconfirmed'), value);
  }
  for (const value of ['Aircon servicing only', 'HVAC maintenance', 'Solar installation']) {
    service.value = service.quote = value;
    assert.ok(p.assessCandidate(f.candidate, f.context, f.ledger).includes('ac_installation_unconfirmed'), value);
  }
});

test('timezone aliases compare the whole coming year',()=>{
 assert.equal(p.equivalentTimezone('Australia/Sydney','Australia/Melbourne'),true);
 assert.equal(p.equivalentTimezone('Australia/Sydney','Australia/Brisbane'),false);
 assert.equal(p.equivalentTimezone('Australia/Perth','Australia/Sydney'),false);
});

test('TradeHQ hosted tenants do not share a company identity', () => {
  const mod = loadTypescript('src/lib/outbound-preparation.ts')
  assert.notEqual(mod.companyKey({company:'Copp The Current',website:'https://tradehq.com.au/coppthecurrent'}, 'Mandurah'), mod.companyKey({company:'Synergy Air Solutions',website:'https://tradehq.com.au/synergyairsolutions'}, 'Sydney'))
})
