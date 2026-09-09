import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { source } from './helpers/delivery-harness.mjs'
const { chunkIds } = source('src/lib/lead-lists.ts')
const { searchLeadContacts } = source('src/lib/lead-search.ts')
const { parseLeadListFilters, leadFiltersToSearchParams, leadFiltersNeedExactCount } = source('src/lib/leads-query.ts')

test('actual list helper deduplicates IDs and pages without losing blanks or remainder', () => {
  assert.deepEqual(chunkIds([' a ', 'b', 'a', '', 'c'], 2), [['a', 'b'], ['c']])
  assert.deepEqual(chunkIds(['', '  ']), [])
})

test('CRM filters round-trip alongside ICP filters and request an exact count', () => {
  const filters = parseLeadListFilters(new URLSearchParams('list_id=list-a&cohort_campaign_id=campaign-a&icp_status=pass&after_hours=0'))
  assert.equal(leadFiltersNeedExactCount(filters), true)
  const params = leadFiltersToSearchParams(filters)
  for (const [key, value] of Object.entries({ list_id: 'list-a', cohort_campaign_id: 'campaign-a', icp_status: 'pass', after_hours: '0' })) assert.equal(params.get(key), value)
})

function api(attachments = []) {
  const requests = []
  const db = createClient('https://fixture.supabase.co', 'fixture', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(input.toString()); requests.push({ url, init })
    const rows = url.pathname.endsWith('/compass_campaign_lists') ? attachments : [{ id: 'lead-a', email: null }]
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json', 'Content-Range': '25-25/1201' } })
  } } })
  return { db, requests }
}

test('list search uses the canonical query with SQL membership, exact count and paging', async () => {
  const { db, requests } = api()
  const result = await searchLeadContacts(db, { list_id: 'list-a', icp_status: 'pass' }, { mode: 'ui', page: 2, pageSize: 25 })
  const request = requests[0]
  assert.ok(request.url.pathname.endsWith('/rpc/compass_list_cohort_leads'))
  assert.deepEqual(JSON.parse(request.init.body).p_list_ids, ['list-a'])
  assert.equal(request.url.searchParams.get('icp_status'), 'eq.pass')
  assert.equal(request.url.searchParams.get('offset'), '25')
  assert.equal(request.url.searchParams.get('limit'), '25')
  assert.equal(result.total, 1201)
  assert.equal(result.leads[0].email, null)
})

test('attached lists take precedence; no-list campaigns preserve pipeline plus Instantly membership', async () => {
  for (const attached of [true, false]) {
    const { db, requests } = api(attached ? [{ list_id: 'list-a' }] : [])
    await searchLeadContacts(db, { cohort_campaign_id: 'campaign-a', instantly_campaign_id: 'instant-a' }, { mode: 'agent' })
    const request = requests[1]
    if (attached) {
      assert.ok(request.url.pathname.endsWith('/rpc/compass_list_cohort_leads'))
      assert.equal(request.url.searchParams.get('instantly_campaign_id'), null)
    } else {
      assert.ok(request.url.pathname.endsWith('/lead_contacts'))
      assert.match(request.url.searchParams.get('or'), /pipeline_campaign_id.eq.campaign-a,instantly_campaign_id.eq.instant-a/)
    }
  }
})

test('real list migrations deduplicate cohorts, retain RLS and roll back failed attachment changes', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;
      create table lead_contacts(id text primary key,email text);
      create table compass_pipeline_campaigns(id text primary key);
      create table compass_lead_lists(id text primary key,name text not null,vertical text,color text,category text,
        created_at timestamptz not null default now(),updated_at timestamptz not null default now(),mirrored_at timestamptz not null default now());
      insert into compass_lead_lists(id,name,vertical,color) values('legacy','Existing catalogue','HVAC','orange');
      create function portal_is_operator() returns boolean language sql stable as $$ select coalesce(current_setting('test.operator',true),'false')='true' $$;`)
    for (const name of ['20260909022151_lead_lists.sql','20260909022207_compass_list_integration.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    assert.deepEqual((await db.query("select name,vertical,color,notes from compass_lead_lists where id='legacy'")).rows,
      [{ name: 'Existing catalogue', vertical: 'HVAC', color: 'orange', notes: null }])
    await db.exec(`insert into lead_contacts values('a',null),('b','b@example.test'),('c','c@example.test');
      insert into compass_pipeline_campaigns values('campaign-a');
      insert into compass_lead_lists(id,name) values('list-a','A'),('list-b','B');
      insert into compass_lead_list_members(list_id,lead_id) values('list-a','a'),('list-a','b'),('list-b','b'),('list-b','c');
      set role authenticated; set test.operator='true';`)
    assert.deepEqual((await db.query(`select id from compass_list_cohort_leads(array['list-a','list-b']) order by id`)).rows, [{id:'a'},{id:'b'},{id:'c'}])
    await db.exec(`select compass_replace_campaign_lists('campaign-a',array['list-a']);`)
    await assert.rejects(db.exec(`select compass_replace_campaign_lists('campaign-a',array['missing']);`), /foreign key/)
    assert.deepEqual((await db.query(`select list_id from compass_campaign_lists`)).rows, [{list_id:'list-a'}])
    await assert.rejects(db.exec('truncate compass_lead_list_members'), /permission denied/)
    await db.exec("set test.operator='false';")
    assert.equal((await db.query(`select * from compass_list_cohort_leads(array['list-a'])`)).rows.length, 0)
    await assert.rejects(db.exec(`select compass_replace_campaign_lists('campaign-a',array['list-b']);`), /operator_required/)
    await db.exec('reset role; set role anon;')
    await assert.rejects(db.exec(`select * from compass_list_cohort_leads(array['list-a'])`), /permission denied/)
  } finally { await db.close() }
})
