import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = fs.readFileSync(
  'supabase/migrations/20260913050000_offer_revision_spine.sql',
  'utf8'
)

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function public.portal_is_operator() returns boolean language sql as $$ select true $$;
    create table public.compass_outbound_offers(
      id text primary key, offer_key text not null unique, name text not null, pack_summary text not null,
      positioning_line text, vertical_tags text[] not null default '{}', location_tags text[] not null default '{}',
      sort_order integer not null default 0, archived boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      gtm_status text not null default 'testing', one_sentence text, dream_outcome text,
      install_aud numeric, retainer_low_aud numeric, retainer_high_aud numeric, term_days integer,
      guarantee text, lock jsonb not null default '{}'
    );
    create table public.compass_clients(id text primary key, name text not null);
    create table public.lead_contacts(
      id text primary key, email text, company text, company_domain text, is_archived boolean default false,
      recontact_ok integer default 1, suppression_reason text, icp_status text, outbound_status text,
      instantly_campaign_id text, pipeline_campaign_id text
    );
    create table public.compass_pipeline_campaigns(
      id text primary key, name text not null, offer_key text, status text not null default 'planned',
      sequence_draft jsonb, vertical_tags text[] default '{}', location_tags text[] default '{}',
      instantly_campaign_id text
    );
    create table public.compass_outbound_configs(
      campaign_id text primary key references public.compass_pipeline_campaigns(id), recipe jsonb, settings jsonb
    );
    create table public.compass_outbound_runs(
      id text primary key, campaign_id text references public.compass_pipeline_campaigns(id),
      source_hash text, artifact_path text, source_rows jsonb, candidates jsonb, candidates_hash text,
      context jsonb, context_hash text, status text default 'ready', created_at timestamptz default now()
    );
    create table public.compass_outbound_preparations(
      id text primary key, run_id text references public.compass_outbound_runs(id), hash text,
      input_hash text, context_hash text, bundle jsonb, created_at timestamptz default now()
    );
    create table public.compass_outbound_loads(
      preparation_id text primary key references public.compass_outbound_preparations(id), instantly_campaign_id text
    );
    create table public.compass_evidence_events(id text primary key, ts timestamptz not null);
    create table public.compass_onboarding_forms(id text primary key);
    create table public.compass_meta_attach(id text primary key);
    create table public.compass_google_attach(id text primary key);
    create table public.compass_client_offers(id text primary key);
    create table public.compass_client_ad_spend(id text primary key);
    create table public.delivery_accounts(id uuid primary key);
    grant usage on schema public to authenticated,service_role;
    grant all on all tables in schema public to authenticated,service_role;
    grant execute on function public.portal_is_operator() to authenticated,service_role;

    insert into public.compass_outbound_offers(
      id,offer_key,name,pack_summary,vertical_tags,location_tags,lock
    ) values (
      'offer-install','installation-booking','Ads + booking','Installation demand through booked quotes',
      array['hvac'],array['au-national'],'{"icp":"Australian AC installers","relevance":[{"fact":"installation service"}]}'
    );
    insert into public.compass_pipeline_campaigns(
      id,name,offer_key,status,sequence_draft,vertical_tags,location_tags,instantly_campaign_id
    ) values
      ('campaign-unknown','Unattributed history','installation-booking','planned','{}',array['hvac'],array['sydney'],null),
      ('campaign-proven','Frozen preparation','installation-booking','planned','{}',array['hvac'],array['perth'],'instant-1');
    insert into public.compass_outbound_configs values
      ('campaign-proven','{"mode":"evidence_draft"}','{"timezone":"Australia/Perth"}');
    insert into public.compass_outbound_runs(
      id,campaign_id,source_hash,artifact_path,source_rows,candidates,candidates_hash,context,context_hash,status
    ) values (
      'run-proven','campaign-proven','source','source.json','[]','[]','input',
      '{"offer":{"offer_key":"installation-booking","lock":{"icp":"Prior AC installers"},"gtm_status":"testing","archived":false}}',
      'context','ready'
    );
    insert into public.compass_outbound_preparations(
      id,run_id,hash,input_hash,context_hash,bundle
    ) values (
      'prep-proven','run-proven','hash','input','context',
      '{"context":{"offer":{"offer_key":"installation-booking","lock":{"icp":"Prior AC installers"},"gtm_status":"testing","archived":false}}}'
    );
  `)
  await db.exec(migration)
  return db
}

test('migration preserves unknown history and attributes only frozen preparation lineage', async () => {
  const db = await database()
  try {
    const offer = await db.query('select active_revision_id from compass_outbound_offers where id=$1', ['offer-install'])
    assert.ok(offer.rows[0].active_revision_id)
    const revisions = await db.query(
      'select id,version_no,snapshot_scope from compass_offer_revisions where offer_id=$1 order by version_no',
      ['offer-install']
    )
    assert.deepEqual(revisions.rows.map((row) => row.snapshot_scope), ['preparation_context', 'full'])
    const campaigns = await db.query(
      'select id,offer_revision_id from compass_pipeline_campaigns order by id'
    )
    assert.equal(campaigns.rows.find((row) => row.id === 'campaign-proven').offer_revision_id, revisions.rows[0].id)
    assert.equal(campaigns.rows.find((row) => row.id === 'campaign-unknown').offer_revision_id, null)
  } finally {
    await db.close()
  }
})

test('offer content changes require an atomic revision while lifecycle-only changes do not', async () => {
  const db = await database()
  try {
    await assert.rejects(
      db.exec("update compass_outbound_offers set name='Drifted name' where id='offer-install'"),
      /offer_revision_required/
    )
    const before = await db.query('select active_revision_id from compass_outbound_offers where id=$1', ['offer-install'])
    await db.exec('set role service_role')
    const revised = await db.query(
      `select compass_revise_offer($1,$2::jsonb,$3,$4,$5) as offer`,
      ['offer-install', JSON.stringify({ name: 'Ads + booking v2' }), before.rows[0].active_revision_id, 'Narrowed after a bounded test.', 'test']
    )
    await db.exec('reset role')
    assert.equal(revised.rows[0].offer.name, 'Ads + booking v2')
    assert.notEqual(revised.rows[0].offer.active_revision_id, before.rows[0].active_revision_id)
    await db.exec("update compass_outbound_offers set gtm_status='live' where id='offer-install'")
    const count = await db.query('select count(*)::int as n from compass_offer_revisions where offer_id=$1', ['offer-install'])
    assert.equal(count.rows[0].n, 3)
    await assert.rejects(
      db.exec(`update compass_offer_revisions set change_reason='rewritten' where id='${before.rows[0].active_revision_id}'`),
      /offer_revision_immutable/
    )
  } finally {
    await db.close()
  }
})

test('new campaigns and runs inherit an exact revision; unbound history fails closed', async () => {
  const db = await database()
  try {
    await db.exec(`
      insert into compass_pipeline_campaigns(id,name,offer_key,status)
      values('campaign-new','New test','installation-booking','planned')
    `)
    const campaign = await db.query(
      'select offer_revision_id from compass_pipeline_campaigns where id=$1',
      ['campaign-new']
    )
    assert.ok(campaign.rows[0].offer_revision_id)
    await db.exec(`
      insert into compass_outbound_runs(
        id,campaign_id,source_hash,artifact_path,source_rows,candidates,candidates_hash,context,context_hash
      ) values('run-new','campaign-new','s','s.json','[]','[]','c','{}','h')
    `)
    const run = await db.query('select offer_revision_id from compass_outbound_runs where id=$1', ['run-new'])
    assert.equal(run.rows[0].offer_revision_id, campaign.rows[0].offer_revision_id)
    await assert.rejects(
      db.exec(`
        insert into compass_outbound_runs(
          id,campaign_id,source_hash,artifact_path,source_rows,candidates,candidates_hash,context,context_hash
        ) values('run-unknown','campaign-unknown','s2','s2.json','[]','[]','c2','{}','h2')
      `),
      /campaign_offer_revision_required/
    )
  } finally {
    await db.close()
  }
})
