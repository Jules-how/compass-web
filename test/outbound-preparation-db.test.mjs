import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fixture } from './helpers/outbound-fixture.mjs'
import { loadTypescript } from './helpers/load-typescript.mjs'
// Install only in the test runtime: npm install --no-save @electric-sql/pglite@0.3.14
const modulePath = process.env.OUTBOUND_PGLITE_MODULE
const { PGlite } = await import(modulePath || '@electric-sql/pglite')
const p = loadTypescript('src/lib/outbound-preparation.ts')
const uid = '11111111-1111-4111-8111-111111111111'
async function database() {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${uid}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor_uid',true),'')::uuid $$;
    CREATE FUNCTION public.portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.operator',true),'')='true' $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE compass_outbound_offers(offer_key text PRIMARY KEY,lock jsonb,gtm_status text,archived boolean);
    CREATE TABLE compass_pipeline_campaigns(id text PRIMARY KEY,offer_key text,status text,sequence_draft jsonb,vertical_tags text[],location_tags text[],instantly_campaign_id text);
    CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,company text,company_domain text,outbound_status text,pipeline_campaign_id text,is_archived boolean,recontact_ok integer,suppression_reason text,icp_status text,instantly_campaign_id text,instantly_lead_id text,enrich_status text,updated_at timestamptz);
    GRANT USAGE ON SCHEMA auth,public TO authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(),public.portal_is_operator() TO authenticated,service_role;
  `)
  await db.exec(
    fs.readFileSync('supabase/migrations/0080_outbound_preparation.sql', 'utf8')
  )
  const f = fixture()
  await db.query(
    'INSERT INTO compass_outbound_offers VALUES($1,$2,$3,$4)',
    Object.values(f.context.offer)
  )
  await db.query(
    'INSERT INTO lead_contacts(id,email,company,company_domain,outbound_status,is_archived,recontact_ok) VALUES($1,$2,$3,$4,$5,false,1)',
    [
      'test-lead',
      'work@example.test',
      'Example Air',
      'example.test',
      'uncontacted'
    ]
  )
  return db
}
async function prepared(db, suffix = '1') {
  const f = fixture()
  f.context.campaign_id = 'cell-' + suffix
  const candidate = { ...f.candidate, id: 'candidate-' + suffix }
  const values = p.expectedValues(candidate, f.context.recipe)
  const copy = loadTypescript('src/lib/outbound-copy.ts')
  const output = {
    candidate_id: candidate.id,
    values,
    steps: f.context.sequence.steps.map((step) => ({
      subject: p.substitute(step.subject, {
        ...values,
        unsubscribe: '[Unsubscribe]'
      }),
      body: p.substitute(
        copy.compileStepBody(step, { includeCompliance: true }),
        { ...values, unsubscribe: '[Unsubscribe]' }
      )
    }))
  }
  const bundle = p.prepareBundle(f.context, [candidate], f.ledger, [output])
  const contextHash = p.digest(f.context)
  await db.query(
    'INSERT INTO compass_pipeline_campaigns VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      f.context.campaign_id,
      'installation-booking',
      'planned',
      f.context.sequence,
      ['hvac'],
      ['sydney'],
      'instant-' + suffix
    ]
  )
  await db.query(
    'INSERT INTO compass_outbound_configs(campaign_id,recipe,settings) VALUES($1,$2,$3)',
    [f.context.campaign_id, f.context.recipe, f.context.settings]
  )
  await db.query(
    'INSERT INTO compass_outbound_runs(id,campaign_id,source_hash,artifact_path,source_rows,candidates,candidates_hash,context,context_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      'run-' + suffix,
      f.context.campaign_id,
      'source-' + suffix,
      'source.json',
      [candidate],
      [candidate],
      bundle.input_hash,
      f.context,
      contextHash
    ]
  )
  const {
    rows: [{ ticket }]
  } = await db.query('SELECT outbound_claim_run($1) AS ticket', [
    'run-' + suffix
  ])
  const arg = {
    id: 'prep-' + suffix,
    hash: bundle.hash,
    input_hash: bundle.input_hash,
    context_hash: contextHash,
    bundle
  }
  await db.query('SELECT outbound_complete_run($1,$2,$3)', [
    'run-' + suffix,
    ticket.lease_token,
    arg
  ])
  return {
    bundle,
    arg,
    ticket,
    id: 'prep-' + suffix,
    run: 'run-' + suffix,
    campaign: 'instant-' + suffix
  }
}
async function approve(db, prep) {
  await db.exec(
    `SET test.actor_uid='${uid}'; SET test.operator='true'; SET ROLE authenticated;`
  )
  try {
    await db.query('SELECT outbound_approve_preparation($1,$2)', [
      prep.id,
      prep.bundle.hash
    ])
  } finally {
    await db.exec('RESET ROLE')
  }
}
function dbtest(name, fn) {
  test(name, async () => {
    const db = await database()
    try {
      await fn(db)
    } finally {
      await db.close()
    }
  })
}

dbtest(
  'migration executes; ready runs and repeated completions are idempotent',
  async (db) => {
    const prep = await prepared(db)
    const ready = await db.query('SELECT outbound_claim_run($1) AS result', [
      prep.run
    ])
    assert.equal(ready.rows[0].result.status, 'ready')
    await db.query('SELECT outbound_complete_run($1,$2,$3)', [
      prep.run,
      prep.ticket.lease_token,
      prep.arg
    ])
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM compass_outbound_preparations'
        )
      ).rows[0].n,
      1
    )
  }
)
dbtest(
  'service worker cannot approve; signed-in operator approval captures its actor',
  async (db) => {
    const prep = await prepared(db)
    await db.exec('SET ROLE service_role')
    await assert.rejects(
      db.query('SELECT outbound_approve_preparation($1,$2)', [
        prep.id,
        prep.bundle.hash
      ]),
      /permission denied/
    )
    await db.exec('RESET ROLE')
    await approve(db, prep)
    assert.equal(
      (await db.query('SELECT actor_id FROM compass_outbound_approvals'))
        .rows[0].actor_id,
      uid
    )
  }
)
dbtest('customers cannot read research or approve', async (db) => {
  const prep = await prepared(db)
  await db.exec(
    `SET test.actor_uid='${uid}';SET test.operator='false';SET ROLE authenticated`
  )
  assert.equal(
    (await db.query('SELECT * FROM compass_outbound_runs')).rows.length,
    0
  )
  await assert.rejects(
    db.query('SELECT outbound_approve_preparation($1,$2)', [
      prep.id,
      prep.bundle.hash
    ]),
    /operator_required/
  )
  await db.exec('RESET ROLE')
})
dbtest(
  'raw inputs, frozen output and approvals cannot be overwritten',
  async (db) => {
    const prep = await prepared(db)
    await approve(db, prep)
    for (const query of [
      "UPDATE compass_outbound_runs SET source_rows='[]'",
      "UPDATE compass_outbound_preparations SET bundle='{}'",
      'DELETE FROM compass_outbound_approvals'
    ]) {
      await assert.rejects(db.exec(query), /immutable_outbound_record/)
    }
  }
)
dbtest(
  'approval and an atomic reservation are required; competing batches cannot claim one inbox',
  async (db) => {
    const one = await prepared(db, '1')
    const two = await prepared(db, '2')
    await assert.rejects(
      db.query('SELECT outbound_reserve_load($1,$2)', [one.id, one.campaign]),
      /human_approval_required/
    )
    await approve(db, one)
    await approve(db, two)
    await db.query('SELECT outbound_reserve_load($1,$2)', [
      one.id,
      one.campaign
    ])
    await db.query('SELECT outbound_reserve_load($1,$2)', [
      one.id,
      one.campaign
    ])
    await assert.rejects(
      db.query('SELECT outbound_reserve_load($1,$2)', [two.id, two.campaign]),
      /outreach_reserved_elsewhere/
    )
    assert.equal(
      (await db.query('SELECT count(*)::int AS n FROM compass_outbound_loads'))
        .rows[0].n,
      1
    )
  }
)
dbtest(
  'changed copy invalidates the approval and prevents reservation',
  async (db) => {
    const prep = await prepared(db)
    await approve(db, prep)
    await db.exec("UPDATE compass_pipeline_campaigns SET sequence_draft='{}'")
    await assert.rejects(
      db.query('SELECT outbound_reserve_load($1,$2)', [prep.id, prep.campaign]),
      /preparation_stale/
    )
  }
)
dbtest('new suppression is checked at load time', async (db) => {
  const prep = await prepared(db)
  await approve(db, prep)
  await db.exec("UPDATE lead_contacts SET suppression_reason='unsubscribed'")
  await assert.rejects(
    db.query('SELECT outbound_reserve_load($1,$2)', [prep.id, prep.campaign]),
    /lead_eligibility_changed/
  )
})
dbtest(
  'partial import retains missing rows; confirmed receipt updates only exact approved ID; retry is idempotent',
  async (db) => {
    const prep = await prepared(db)
    await approve(db, prep)
    await db.query('SELECT outbound_reserve_load($1,$2)', [
      prep.id,
      prep.campaign
    ])
    const missing = {
      receipts: [
        { lead_id: 'test-lead', email: 'work@example.test', status: 'missing' }
      ],
      complete: false,
      extras: []
    }
    await db.query('SELECT outbound_record_receipt($1,$2,$3)', [
      prep.id,
      'missing',
      missing
    ])
    assert.equal(
      (await db.query('SELECT outbound_status FROM lead_contacts')).rows[0]
        .outbound_status,
      'uncontacted'
    )
    const good = {
      receipts: [
        {
          lead_id: 'test-lead',
          email: 'work@example.test',
          status: 'confirmed',
          provider_id: 'provider-1'
        }
      ],
      complete: true,
      extras: []
    }
    for (let i = 0; i < 2; i++)
      await db.query('SELECT outbound_record_receipt($1,$2,$3)', [
        prep.id,
        'confirmed',
        good
      ])
    assert.equal(
      (await db.query('SELECT outbound_status FROM lead_contacts')).rows[0]
        .outbound_status,
      'in_instantly'
    )
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM compass_outbound_receipt_history'
        )
      ).rows[0].n,
      2
    )
    assert.equal(
      (await db.query('SELECT status FROM compass_outbound_loads')).rows[0]
        .status,
      'complete'
    )
  }
)
dbtest(
  'receipt cannot mark a recipient outside the frozen batch',
  async (db) => {
    const prep = await prepared(db)
    await approve(db, prep)
    await db.query('SELECT outbound_reserve_load($1,$2)', [
      prep.id,
      prep.campaign
    ])
    await assert.rejects(
      db.query('SELECT outbound_record_receipt($1,$2,$3)', [
        prep.id,
        'bad',
        {
          receipts: [
            {
              lead_id: 'different-lead',
              email: 'elsewhere@example.test',
              status: 'confirmed',
              provider_id: 'bad'
            }
          ],
          complete: true
        }
      ]),
      /recipient_not_approved/
    )
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM compass_outbound_receipt_history'
        )
      ).rows[0].n,
      0
    )
  }
)
dbtest('stale worker token cannot finish a claimed run', async (db) => {
  const prep = await prepared(db)
  await db.exec("UPDATE compass_outbound_runs SET status='queued'")
  const claim = await db.query('SELECT outbound_claim_run($1) AS ticket', [
    prep.run
  ])
  assert.notEqual(claim.rows[0].ticket.lease_token, prep.ticket.lease_token)
  await assert.rejects(
    db.query('SELECT outbound_complete_run($1,$2,$3)', [
      prep.run,
      prep.ticket.lease_token,
      { ...prep.arg, id: 'new-output', hash: 'changed' }
    ]),
    /stale_attempt/
  )
})

dbtest(
  'normal operator campaign edits can invalidate protected preparations',
  async (db) => {
    await prepared(db)
    await db.exec(
      'GRANT SELECT,UPDATE ON compass_pipeline_campaigns TO authenticated; SET ROLE authenticated'
    )
    await db.exec("UPDATE compass_pipeline_campaigns SET sequence_draft='{}'")
    await db.exec('RESET ROLE')
    assert.equal(
      (await db.query('SELECT status FROM compass_outbound_runs')).rows[0]
        .status,
      'stale'
    )
  }
)
