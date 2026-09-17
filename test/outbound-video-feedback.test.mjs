import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTypescript } from './helpers/load-typescript.mjs';
const pipeline = loadTypescript('src/lib/outbound-pipeline.ts');
const schema = loadTypescript('src/lib/outbound-pipeline-schema.ts');
const market = loadTypescript('src/lib/outbound-market.ts');
const suggestions = loadTypescript('src/lib/outbound-research-suggestions.ts');
const ui = loadTypescript('src/components/outbound/workflow/pipeline-ui-state.ts');
const present = loadTypescript('src/components/outbound/workflow/pipeline-view-model.ts');
const copy = { subject: 'Hello', opener: 'Default opener', body: 'Body', cta: 'Discuss?', unsubscribe: 'Reply no to opt out.' };
const policy = (extra = {}) => ({ mode: 'deterministic', ...copy, slots: {}, followups: [], ...extra });
const variation = (id, extra = {}) => ({ id, name: id, enabled: true, match: 'all', when: [{ signal_id: 'ducted', operator: 'present', value: '' }], copy: { ...copy, opener: `Matched ${id}` }, ...extra });
const parseTemplate = p => schema.parsePipelineCommand({ schema_version: pipeline.PIPELINE_VERSION, request_id: 'request-preview-1', source: 'test', operations: [{ kind: 'template', expected_revision: 0, record: { id: 'template-1', name: 'Test', parent_id: null, policy: p } }] });

test('old templates render byte-for-byte with no variation metadata', () => {
 assert.deepEqual(pipeline.renderPipelineTemplate(policy(), {}), { copy: { ...copy, followups: [] }, missing: [] });
});
test('first matching enabled variation wins and order is deterministic', () => {
 const a = variation('a'), b = variation('b');
 assert.equal(pipeline.selectPipelineVariation(policy({ variations: [a, b] }), { ducted: 'Published' }).id, 'a');
 assert.equal(pipeline.selectPipelineVariation(policy({ variations: [b, a] }), { ducted: 'Published' }).id, 'b');
 assert.equal(pipeline.selectPipelineVariation(policy({ variations: [{ ...a, enabled: false }, b] }), { ducted: 'Published' }).id, 'b');
});
test('missing or empty evidence uses default copy, not an invented match', () => {
 for (const values of [{}, { ducted: '' }, { ducted: '   ' }]) assert.equal(pipeline.renderPipelineTemplate(policy({ variations: [variation('a')] }), values).copy.opener, 'Default opener');
 assert.equal(pipeline.selectPipelineVariation(policy({ variations: [variation('a', { when: [] })] }), { ducted: 'yes' }), null);
});
test('equals, contains, any and all have explicit comparison semantics', () => {
 const conditions = [{ signal_id: 'ducted', operator: 'equals', value: 'true' }, { signal_id: 'team', operator: 'contains', value: 'Install' }];
 const p = policy({ variations: [variation('a', { when: conditions })] });
 assert.equal(pipeline.selectPipelineVariation(p, { ducted: ' TRUE ', team: 'Installation crew' }).id, 'a');
 assert.equal(pipeline.selectPipelineVariation(p, { ducted: 'false', team: 'Installation crew' }), null);
 p.variations[0].match = 'any';
 assert.equal(pipeline.selectPipelineVariation(p, { ducted: 'false', team: 'Installation crew' }).id, 'a');
 p.variations[0].when = [{ signal_id: 'ducted', operator: 'contains', value: ' ' }];
 assert.equal(pipeline.selectPipelineVariation(p, { ducted: 'true' }), null);
});
test('only slots in selected copy and shared followups can block rendering', () => {
 const p = policy({ opener: '[[unused]]', slots: { service: { signal_ids: ['ducted'], required: true, fallback: '' } }, variations: [variation('a', { copy: { ...copy, opener: 'Saw [[service]]' } })] });
 assert.deepEqual(pipeline.renderPipelineTemplate(p, { ducted: 'ducted systems' }).missing, []);
 assert.equal(pipeline.renderPipelineTemplate(p, { ducted: 'ducted systems' }).copy.opener, 'Saw ducted systems');
 p.followups = [{ delay_days: 3, subject: 'Re: hello', body: '[[missing_followup]]' }];
 assert.deepEqual(pipeline.renderPipelineTemplate(p, { ducted: 'ducted systems' }).missing, ['missing_followup']);
});
test('strict write contract accepts valid variations and rejects malformed, duplicate and AI routing', () => {
 assert.doesNotThrow(() => parseTemplate(policy({ variations: [variation('a')] })));
 for (const p of [policy({ variations: [variation('a'), variation('a')] }), policy({ variations: [variation('a', { when: [] })] }), policy({ variations: [variation('a', { copy: { ...copy, unsubscribe: '' } })] }), policy({ variations: [variation('a', { when: [{ signal_id: 'ducted', operator: 'equals', value: '' }] })] }), policy({ mode: 'ai', ai: { model: 'connected', prompt: 'Use evidence' }, variations: [variation('a')] })]) assert.throws(() => parseTemplate(p), /pipeline_invalid_record/);
});
test('conflicting or non-writing signals cannot select a variation', () => {
 const observation = { id: 'o1', signal_id: 'ducted', value: 'yes', source_id: 's1', quote: 'Published fact', evidence_strength: 'high', usefulness: 'high', supersedes_id: null };
 const definitions = [{ id: 'ducted', writing_eligible: true }];
 const conflicting = ui.previewSignalValues([observation, { ...observation, id: 'o2', value: 'no' }], definitions);
 assert.equal(pipeline.selectPipelineVariation(policy({ variations: [variation('a')] }), conflicting.values), null);
 const ineligible = ui.previewSignalValues([observation], [{ id: 'ducted', writing_eligible: false }]);
 assert.deepEqual(ineligible.values, {});
});
const account = (id, extra = {}) => ({ id, name: `Company ${id}`, country: 'AU', website: 'https://example.test', fit: 'unknown', fits: {}, city: 'Sydney', locations: [{ city: 'Sydney', suburb: 'Matraville', administrative_region: 'NSW' }], services: [], contacted: false, linked_contact_history: false, ...extra });
test('ICP match rate uses assessed denominator and never turns unknown into zero percent fit', () => {
 const values = [account('a', { fits: { w: 'sure_fit' }, contacted: true }), account('b', { fits: { w: 'non_fit' } }), account('c')];
 assert.deepEqual(market.marketSummary([...values, values[0]], 'w'), { total: 3, assessed: 2, matches: 1, unknown: 1, contacted: 1, linked: 0, matchRate: 50 });
 assert.equal(market.marketSummary([account('a')], 'w').matchRate, null);
 assert.equal(market.marketSummary([], 'w').matchRate, null);
});
test('profile filters and overlapping services preserve canonical accounts', () => {
 const rows = [account('a', { fits: { w: 'sure_fit' }, services: ['Plumbing', 'Air conditioning'] }), account('b', { fits: { w: 'non_fit' }, services: ['Plumbing'] }), account('c')];
 const scope = { profile: 'w', outcome: 'matches', service: 'Air conditioning' };
 assert.deepEqual(market.filterMarketCompanies(rows, {}, scope).map(v => v.id), ['a']);
 assert.deepEqual(market.filterMarketCompanies(rows, {}, { ...scope, service: '', outcome: 'unknown' }).map(v => v.id), ['c']);
 assert.deepEqual(market.filterMarketCompanies(rows, { city: ' SYDNEY ', administrative_region: 'NSW' }, { ...scope, service: '', outcome: 'all' }).map(v => v.id), ['a', 'b', 'c']);
 assert.deepEqual(market.filterMarketCompanies(rows, { city: 'Perth' }, scope), []);
});
test('location filters must match one location, not mix city and state across premises', () => {
 const rows = [account('a', { locations: [{ city: 'Sydney', administrative_region: 'NSW' }, { city: 'Perth', administrative_region: 'WA' }] })];
 assert.deepEqual(market.filterMarketCompanies(rows, { city: 'Sydney', administrative_region: 'WA' }, market.EMPTY_MARKET_SCOPE), []);
});
test('stale assessments and a different ICP never establish current fit', () => {
 const common = { company_id: 'c', workflow_version_id: 'w', created_at: '2026-09-17T01:00:00Z' };
 const values = [{ ...common, id: 'old', input_revision: 1, fit: 'sure_fit' }, { ...common, id: 'new', input_revision: 2, fit: 'non_fit' }, { ...common, id: 'other', workflow_version_id: 'other', input_revision: 2, fit: 'sure_fit' }];
 const fits = market.currentAssessments(values, new Map([['c', 2]]));
 assert.equal(fits.get('c').w, 'non_fit');assert.equal(fits.get('c').other, 'sure_fit');
 assert.equal(market.currentAssessments(values, new Map([['c', 3]])).get('c'), undefined);
});
const fact = (id, extra = {}) => ({ id, company_id: 'c', fact_key: 'services', value: ['Plumbing', 'Air conditioning'], source_id: 's', review_status: 'reviewed', evidence_type: 'published', supersedes_ids: [], ...extra });
test('service labels require reviewed direct evidence and may overlap', () => {
 assert.deepEqual(market.recordedServices([fact('a')]).get('c'), ['Air conditioning', 'Plumbing']);
 for (const patch of [{ review_status: 'pending' }, { review_status: 'rejected' }, { evidence_type: 'inference' }, { evidence_type: 'generation' }, { source_id: null }]) assert.equal(market.recordedServices([fact('a', patch)]).size, 0);
});
test('service conflicts and supersession are not resolved by array order or unreviewed claims', () => {
 assert.deepEqual(market.recordedServices([fact('a'), fact('b', { value: ['Electrical', 'Air conditioning'] })]).get('c'), ['Air conditioning']);
 assert.deepEqual(market.recordedServices([fact('a'), fact('b', { supersedes_ids: ['a'], value: ['Electrical'] })]).get('c'), ['Electrical']);
 assert.deepEqual(market.recordedServices([fact('a'), fact('b', { supersedes_ids: ['a'], value: [], review_status: 'pending' })]).get('c'), ['Air conditioning', 'Plumbing']);
 assert.deepEqual(market.recordedServices([fact('a', { fact_key: 'installs_ducted', value: true }), fact('b', { fact_key: 'installs_ducted', value: false })]).get('c'), []);
});
test('contact metrics exclude planning, inbound, future and ambiguous company links', () => {
 const links = ['a', 'b', 'c', 'd', 'e'].map(id => ({ lead_id: id, company_id: `company-${id}` }));
 links.push({ lead_id: 'e', company_id: 'other-company' });
 const touch = id => ({ contact_id: id, direction: 'outbound', outcome: 'no_answer', contacted_at: '2026-09-16T01:00:00Z' });
 const touches = [touch('a'), { ...touch('b'), outcome: 'next_step' }, { ...touch('c'), direction: 'inbound' }, { ...touch('d'), contacted_at: '2030-01-01T00:00:00Z' }, touch('e')];
 assert.deepEqual([...market.contactedCompanyIds(links, touches, Date.parse('2026-09-17T00:00:00Z'))], ['company-a']);
});
test('market cursor covers a stable unique scope without losing records', () => {
 const records = Array.from({ length: 205 }, (_, n) => account(`company-${String(n).padStart(3, '0')}`));
 const a = market.marketPage(records, ''), b = market.marketPage(records, a.next_after), c = market.marketPage(records, b.next_after);
 assert.equal(a.total_matching, 205);assert.equal(a.records.length, 100);assert.equal(b.records.length, 100);assert.equal(c.records.length, 5);assert.equal(c.next_after, null);
 assert.equal(new Set([...a.records, ...b.records, ...c.records].map(v => v.id)).size, 205);
});
test('completed progress ignores stale inputs, previous workflows, and latest holds', () => {
 const base = { id: 's1', company_id: 'c', list_id: 'l', workflow_version_id: 'w', stage: 'research', recipient_id: null, input_hash: '2', status: 'completed', created_at: '2026-09-16T00:00:00Z' };
 const list = { id: 'l', workflow_version_id: 'w' }, revisions = new Map([['c', 2]]);
 assert.equal(market.completedCompanyStages([base], list, revisions).research, 1);
 assert.equal(market.completedCompanyStages([{ ...base, input_hash: '1' }], list, revisions).research, 0);
 assert.equal(market.completedCompanyStages([base, { ...base, id: 's2', status: 'held', created_at: '2026-09-17T00:00:00Z' }], list, revisions).research, 0);
});
test('database Ready/Not started fallback is not presented as completed preparation', () => {
 assert.equal(present.companyStagePresentation({ stage_status: 'ready', reason: 'Not started' }, 'verify').status, 'not_started');
 assert.equal(present.companyStagePresentation({ stage_status: 'ready', reason: 'Mailbox valid' }, 'verify').status, 'ready');
});
test('offer suggestions use the supplied document, dedupe, and preserve exclusion semantics', () => {
 const lock = { icp: 'Residential installers', screen: ['Ducted installs', 'Ducted installs'], antiIcp: ['Commercial only'], relevance: [{ fact: 'Installation service', source: 'Service page', required: false }] };
 const values = suggestions.offerResearchSuggestions(lock, 'Offer v1');
 assert.equal(values.filter(v => v.criterion).length, 3);assert.equal(values.filter(v => v.signal).length, 1);
 assert.equal(values.find(v => v.criterion?.exclusion).criterion.label, 'Commercial only');
 assert.equal(values.find(v => v.signal).signal.acceptable_evidence, 'Service page');
 assert.equal(values.every(v => v.source === 'Offer v1'), true);
});
test('adding or reusing suggestions is explicit, non-destructive and not duplicated', () => {
 const original = { criteria: [{ id: 'existing', label: 'My rule', required: true, exclusion: false, instructions: '' }], signals: [] };
 const suggested = { key: 'x', source: 'Offer', criterion: { label: 'New rule', required: true, exclusion: false, instructions: '' } };
 const added = suggestions.addResearchSuggestion(original, suggested, 'new');
 assert.equal(original.criteria.length, 1);assert.equal(added.criteria.length, 2);assert.equal(added.criteria[0].id, 'existing');
 assert.equal(suggestions.addResearchSuggestion(added, suggested, 'another'), added);
});
test('market endpoint is authenticated, read-only, and rejects unsupported scopes', async () => {
 let read = 0;
 const route = loadTypescript('src/app/api/operator/outbound/pipeline/markets/route.ts', {
  '@/lib/portal-access': { requirePortalAccess: async input => { assert.deepEqual(input, { operator: true }); return { supabase: {} }; } },
  '@/lib/portal-http': { portalJson: (body, init) => Response.json(body, init) },
  '@/lib/outbound-market-server': { readMarketIndex: async () => { read++; return { complete: true }; } },
  '@/lib/outbound-pipeline-http': { pipelineErrorResponse: error => Response.json({ error: error.message }, { status: 403 }) },
 });
 assert.equal(route.POST, undefined);
 assert.equal((await route.GET(new Request('https://example.test/api?unexpected=all'))).status, 422);assert.equal(read, 0);
 assert.equal((await route.GET(new Request('https://example.test/api?list_id=list-1'))).status, 200);assert.equal(read, 1);
});
test('market endpoint performs no reads when access is denied', async () => {
 const route = loadTypescript('src/app/api/operator/outbound/pipeline/markets/route.ts', {
  '@/lib/portal-access': { requirePortalAccess: async () => { throw new Error('operator_required'); } },
  '@/lib/outbound-market-server': { readMarketIndex: async () => { throw new Error('unauthorized data read'); } },
  '@/lib/outbound-pipeline-http': { pipelineErrorResponse: error => Response.json({ error: error.message }, { status: 403 }) },
 });
 assert.equal((await route.GET(new Request('https://example.test/api'))).status, 403);
});
test('UI has separate company/people/mailbox semantics and a default-open writer', () => {
 const workspace = fs.readFileSync('src/components/outbound/workflow/WorkflowWorkspace.tsx', 'utf8');
 assert.match(workspace, /stage === "write" \? "write"/);assert.match(workspace, /window\.history\.pushState/);
 assert.match(workspace, /marketRecords\.length > 1000/);assert.match(workspace, /setSelected\(new Set\(marketRecords\.map/);
 assert.match(workspace, /basicCompanyTable/);assert.doesNotMatch(workspace, /setRunsOpen\(!runsOpen\);\s*refresh\(\)/);
 const write = fs.readFileSync('src/components/outbound/workflow/WriteEditor.tsx', 'utf8');
 assert.match(write, /form="op-writing-config"/);assert.match(write, /SignalVariations/);
 const server = fs.readFileSync('src/lib/outbound-pipeline-jobs-server.ts', 'utf8');
 assert.match(server, /renderPipelineTemplate\(policy,item\.payload\.signals/);
});

test('market index drains capped short pages and fails closed on any ledger error', async () => {
 const server = loadTypescript('src/lib/outbound-market-server.ts', {
  './outbound-pipeline-server': { requirePipeline() {}, pipelineDatabaseError(error) { if (error) throw new Error(error.message); } },
 });
 const calls = [];
 function database(failingTable) {
  return { from(table) {
   let after = '', key = 'id';
   const query = { select() { return query; }, order(value) { key = value; return query; }, limit() { return query; }, eq() { return query; }, gt(_key, value) { after = value; return query; },
    then(resolve, reject) {
     calls.push({table, after});
     if (table === failingTable) return Promise.resolve({data:null,error:{message:'Ledger unavailable'}}).then(resolve,reject);
     const source = table === 'crm_companies' ? ['a','b','c'].map(id => ({id,name:id,country:'AU',website:null,revision:1})) : [];
     return Promise.resolve({data:source.filter(row => row[key] > after).slice(0,1),error:null}).then(resolve,reject);
    }
   };return query;
  }};
 }
 const index = await server.readMarketIndex(database(), '');
 assert.equal(index.complete, true);assert.equal(index.total, 3);assert.equal(index.records.length, 3);
 assert.deepEqual(calls.filter(call => call.table === 'crm_companies').map(call => call.after), ['', 'a', 'b', 'c']);
 await assert.rejects(server.readMarketIndex(database('crm_research_observations'), ''), /Ledger unavailable/);
});
