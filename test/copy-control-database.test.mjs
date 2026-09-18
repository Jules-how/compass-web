import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadTypescript } from './helpers/load-typescript.mjs';
const core = loadTypescript('src/lib/copy-control.ts');
const { parsePipelineCommand } = loadTypescript('src/lib/outbound-pipeline-schema.ts');

test('component policies, exact draft traces and CSV metadata persist through the existing PostgreSQL RPCs', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz,outbound_status text,suppression_reason text,is_archived boolean DEFAULT false,recontact_ok integer DEFAULT 1,instantly_campaign_id text,instantly_lead_id text,enrich_status text);
      CREATE TABLE compass_offer_revisions(id text PRIMARY KEY); INSERT INTO compass_offer_revisions VALUES('offer-v1');
      CREATE TABLE compass_outbound_companies(id text PRIMARY KEY); CREATE TABLE compass_lead_list_members(lead_id text,list_id text);
      CREATE TABLE compass_lead_lists(id text PRIMARY KEY,name text NOT NULL,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE compass_clients(id text PRIMARY KEY);`);
    for (const path of ['0067_compass_evidence_events.sql', '20260915090000_crm_research.sql', '20260917090000_outbound_pipeline.sql', '20260917100000_outbound_pipeline_jobs.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${path}`, 'utf8'));
    let serial = 0;
    const apply = async operations => {
      const command = parsePipelineCommand({ schema_version: 'outbound.pipeline.v1', request_id: `database-request-${++serial}`, source: 'test.copy_control', operations });
      return (await db.query('SELECT outbound_pipeline_apply($1,$2,$3) AS result', [command, JSON.stringify(command), 'agent'])).rows[0].result;
    };
    const op = (kind, record) => ({ kind, record, expected_revision: 0 });
    const signal = { id: 'service', label: 'Service', category: 'service', collection_instructions: 'Read', acceptable_evidence: 'Published', usefulness_guidance: 'Specific', writing_eligible: true, value_type: 'text', required: true };
    const policy = { offer_version_id: 'offer-v1', icp_version_id: 'icp-v1', criteria: [{ id: 'service', label: 'Service', instructions: 'Read published services', required: true, exclusion: false }], signals: [signal], tools: [], checkpoints: [], target_roles: ['Owner'], verification: { accepted: ['valid'], reuse_days: 1 }, budget: { amount: 0, currency: 'AUD' }, concurrency: 1 };
    await db.exec("INSERT INTO crm_companies(id,name,actor) VALUES('company','Fixture business','fixture'); INSERT INTO crm_research_sources(id,source_type,url,actor) VALUES('source','official_site','https://example.test','fixture')");
    await apply([op('workflow', { id: 'workflow', name: 'Workflow', policy }), op('list', { id: 'list', name: 'List', workflow_version_id: 'workflow', offer_version_id: 'offer-v1', icp_version_id: 'icp-v1' }), op('membership', { id: 'member', list_id: 'list', company_id: 'company', active: true, origin: 'fixture' })]);
    await db.exec("INSERT INTO crm_contact_methods(id,method_type,value,normalized_value,actor) VALUES('mail','email','office@example.test','office@example.test','fixture'); INSERT INTO crm_contact_candidates(id,company_id,method_id,purpose,first_origin,actor) VALUES('candidate','company','mail','general','published_general','fixture')");
    await apply([op('recipient', { id: 'recipient', list_id: 'list', company_id: 'company', candidate_id: 'candidate', method_id: 'mail', mailbox: 'office@example.test', suitable: true, reason: 'Published' })]);
    const observation = { id: 'observation', company_id: 'company', workflow_version_id: 'workflow', signal_id: 'service', value: 'ducted installation', source_id: 'source', observed_at: new Date().toISOString(), quote: 'We offer ducted installation.', evidence_strength: 'high', usefulness: 'high' };
    await apply([op('signal', observation)]);
    const base = { mode: 'deterministic', subject: '[[job]]', opener: 'Saw you offer [[job]].', body: 'Body', cta: 'Reply?', unsubscribe: 'Reply no thanks to opt out.', followups: [], slots: { job: { signal_ids: ['service'], required: true, fallback: '' } } };
    const template = core.studioTemplate(base, core.copyControlFromTemplate(base));
    await apply([op('template', { id: 'template', name: 'Template', policy: template })]);
    const inputs = core.copySignalInputs([observation], [signal]);
    const rendered = core.renderCopyControl(template.copy_control, inputs.values, [], { template_version_id: 'template', workflow_version_id: 'workflow', list_id: 'list', recipient_id: 'recipient', company_id: 'company', evidence: inputs.signals });
    assert.deepEqual(rendered.missing, []);
    await apply([op('draft', { id: 'draft', list_id: 'list', recipient_id: 'recipient', template_version_id: 'template', copy: rendered.copy, provenance: 'template', input_refs: ['observation'], previous_id: null })]);
    const stored = (await db.query("SELECT copy,approved FROM outbound_pipeline_drafts WHERE id='draft'")).rows[0];
    assert.deepEqual(stored.copy.copy_control, rendered.trace);
    assert.equal(stored.approved, false);
    assert.equal(stored.copy.opener, 'Saw you offer ducted installation.');
    await assert.rejects(db.exec("UPDATE outbound_pipeline_templates SET name='mutated' WHERE id='template'"), /immutable/);
    await assert.rejects(db.exec("UPDATE outbound_pipeline_drafts SET copy='{}' WHERE id='draft'"), /immutable/);
    const command = { schema_version: 'outbound.pipeline.v1', request_id: 'export-copy-control', source: 'test.copy_control', action: 'create_export', job_id: 'export', expected_revision: 0, data: { list_id: 'list', grain: 'recipients', columns: ['id', 'list_id', 'current_draft_id', 'copy_control'] } };
    await db.query('SELECT outbound_pipeline_job_create($1,$2,$3)', [command, JSON.stringify(command), 'agent']);
    const row = (await db.query("SELECT payload->'row' AS row FROM outbound_pipeline_job_items WHERE job_id='export'")).rows[0].row;
    assert.equal(row.list_id, 'list'); assert.equal(row.current_draft_id, 'draft'); assert.deepEqual(row.copy_control, rendered.trace);
    await db.query("INSERT INTO compass_evidence_events(id,ts,source,type,idempotency_key,payload) VALUES('copy-event',now(),'compass.copy_control','copy_control.outcome','copy-outcome:fixture',$1)", [{ trace: rendered.trace, event: { type: 'delivered', draft_id: 'draft' } }]);
    assert.equal((await db.query("SELECT payload#>>'{trace,template_version_id}' AS id FROM compass_evidence_events WHERE id='copy-event'")).rows[0].id, 'template');
    await assert.rejects(db.exec("INSERT INTO compass_evidence_events(id,ts,source,type,idempotency_key) VALUES('duplicate',now(),'compass.copy_control','copy_control.outcome','copy-outcome:fixture')"), /unique|duplicate/);
  } finally { await db.close(); }
});
