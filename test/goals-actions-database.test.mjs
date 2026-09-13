import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE anon;CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$select coalesce(current_setting('test.role',true),'authenticated')$$;
 CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$select coalesce(current_setting('test.operator',true),'false')='true'$$;
 CREATE TABLE lead_contacts(id text primary key,name text,company text,email text,phone text,outbound_status text,suppression_reason text,recontact_ok integer,last_outbound_at timestamptz,instantly_synced_at timestamptz,instantly_lead_id text,instantly_campaign_id text,instantly_campaign text,instantly_campaign_name text,lead_status_source text,interest_label text,pipeline_stage text,updated_at timestamptz);
 CREATE TABLE compass_tasks(id text primary key,title text,status text,priority real,task_type text,source text,due text,notes text,updated_at timestamptz default now());
 CREATE TABLE lead_outreach_touches(id text primary key,contact_id text,contacted_at timestamptz,channel text,source text,instantly_campaign_id text);
 CREATE FUNCTION portal_operator_create_task_mutation(p_task jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$declare t compass_tasks;begin INSERT INTO compass_tasks(id,title,status,priority,task_type,source,due,notes) VALUES(p_task->>'id',p_task->>'title',p_task->>'status',0,p_task->>'task_type',p_task->>'source',p_task->>'due',p_task->>'notes') RETURNING * INTO t;RETURN jsonb_build_object('task',to_jsonb(t));end$$;
 CREATE FUNCTION portal_operator_apply_task_mutation(p_task_id text,p_patch jsonb,p_base_entity_version bigint) RETURNS jsonb LANGUAGE plpgsql AS $$declare t compass_tasks;begin UPDATE compass_tasks SET status=coalesce(p_patch->>'status',status),title=coalesce(p_patch->>'title',title),due=coalesce(p_patch->>'due',due),updated_at=clock_timestamp() WHERE id=p_task_id RETURNING * INTO t;RETURN jsonb_build_object('status','applied','task',to_jsonb(t));end$$;
 INSERT INTO lead_contacts(id,company,phone,outbound_status) VALUES('fixture','Fixture','0895550101','uncontacted');`);
  await db.exec(
    await readFile(
      "supabase/migrations/20260910083241_outbound_rhythm.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20260910083841_outbound_provider_identity.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20260910084156_outbound_planning_is_not_contact.sql",
      "utf8",
    ),
  );
  await db.exec(`ALTER TABLE compass_tasks ADD COLUMN project_id text;
 CREATE TABLE compass_settings(id text primary key,value text,scope text,is_secret int,updated_at timestamptz,mirrored_at timestamptz);
 CREATE TABLE compass_projects(id text primary key,name text,status text,priority int,health text,summary text,source text,created_at timestamptz,updated_at timestamptz,mirrored_at timestamptz);
 CREATE TABLE compass_pathfinder_links(goal_id text,work_type text,work_id text,relation text,state text,rationale text,actor text,updated_at timestamptz,UNIQUE(goal_id,work_type,work_id,relation));
 CREATE TABLE compass_pathfinder_observations(id text primary key);
 INSERT INTO compass_settings(id,value) VALUES('planning.goal.11111111-1111-1111-1111-111111111111','encrypted');`);
  for (const file of [
    "20260910124500_operating_service.sql",
    "20260910131000_operating_goal_links.sql",
    "20260913010000_goals_actions.sql",
  ])
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  await db.exec(`ALTER TABLE compass_tasks ADD COLUMN parent_task_id text,ADD COLUMN business_function_id text,ADD COLUMN complexity int,ADD COLUMN execution_level int,ADD COLUMN execution_mode text,ADD COLUMN execution_contract jsonb,ADD COLUMN contract_revision int,ADD COLUMN mirrored_at timestamptz;
 CREATE TABLE compass_sync_v2_entities(tenant_id uuid,domain text,entity_id text,authority text,entity_version bigint,fields jsonb,field_versions jsonb,field_actors jsonb,field_operation_ids jsonb,updated_at timestamptz,tombstone jsonb,PRIMARY KEY(tenant_id,domain,entity_id));
 CREATE TABLE compass_sync_v2_receipts(tenant_id uuid,operation_id text,actor_id uuid,payload_digest text,outcome text,result jsonb,received_at timestamptz,PRIMARY KEY(tenant_id,operation_id));
 CREATE TABLE compass_sync_v2_changes(tenant_id uuid,operation_id text,domain text,entity_id text,authority text,change_kind text,snapshot jsonb,created_at timestamptz);
 INSERT INTO compass_sync_v2_entities(tenant_id,domain,entity_id,entity_version,fields) VALUES('11111111-1111-1111-1111-111111111111','internal-planning','seed',1,'{}');`);
  await db.exec(
    await readFile(
      "supabase/migrations/20260913014000_explicit_instructions.sql",
      "utf8",
    ),
  );
  return db;
}
const goal = "planning.goal.11111111-1111-1111-1111-111111111111";
const session = {
  id: "22222222-2222-4222-8222-222222222222",
  request_id: "33333333-3333-4333-8333-333333333333",
  revision: 0,
  goal_id: goal,
  city: "Sydney",
  phase: "warmup",
  status: "ready",
  due: null,
  lead_ids: ["fixture"],
  priorities: { fixture: { tier: "lower", reason: "Fixture evidence" } },
  context: { goal_id: goal, state: "ready", reason: "Fixture" },
};
const run = async (db, fn, p, actor) =>
  (
    await db.query(
      `select ${fn}($1${actor ? ", $2" : ""}) r`,
      actor ? [JSON.stringify(p), actor] : [JSON.stringify(p)],
    )
  ).rows[0].r;
test("session creation is atomic with canonical task and goal link; resume rejects stale edits", async () => {
  const db = await database();
  try {
    await db.exec("SET test.operator='true'");
    const result = await run(
      db,
      "compass_goal_session_save",
      session,
      "operator",
    );
    assert.ok(result.session.data.task_id);
    assert.equal(result.session.revision, 1);
    assert.equal(
      (await run(db, "compass_goal_session_save", session, "operator"))
        .replayed,
      true,
    );
    assert.equal(
      (await db.query("select count(*)::int n from compass_tasks")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::int n from compass_pathfinder_links"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      run(
        db,
        "compass_goal_session_save",
        { ...session, phase: "priority" },
        "operator",
      ),
      /request_id_reused/,
    );
    await assert.rejects(
      run(
        db,
        "compass_goal_session_save",
        { ...session, request_id: "44444444-4444-4444-8444-444444444444" },
        "operator",
      ),
      /revision_conflict/,
    );
    await db.exec("SET test.role='service_role'");
    await assert.rejects(
      run(
        db,
        "compass_goal_session_save",
        {
          ...session,
          revision: 1,
          request_id: "44444444-4444-4444-8444-444444444444",
        },
        "agent",
      ),
      /operator_confirmation_required/,
    );
  } finally {
    await db.close();
  }
});
test("call outcome, undated promise, goal attribution and session resume commit together and retry once", async () => {
  const db = await database();
  try {
    await db.exec("SET test.operator='true'");
    await run(db, "compass_goal_session_save", session, "operator");
    const p = {
      operation: "capture",
      lead_id: "fixture",
      revision: 0,
      request_id: "55555555-5555-4555-8555-555555555555",
      occurred_at: "2026-09-13T01:00:00Z",
      channel: "call",
      direction: "outbound",
      outcome: "decision_maker",
      note: "Send details, date unresolved",
      person_reached: "",
      disposition: "unresolved",
      goal_id: goal,
      session_id: session.id,
      conversation: true,
      signals: ["value"],
      next: {
        title: "Send promised details",
        reason: "Buyer requested",
        channel: "email",
        timezone: "Australia/Sydney",
        state: "proposed",
      },
    };
    const first = await run(db, "compass_goal_touch_save", p);
    assert.ok(first.task_id);
    const t = (
      await db.query("select * from compass_tasks where id=$1", [first.task_id])
    ).rows[0];
    assert.equal(t.due, null);
    assert.equal(t.outreach_state, "unresolved");
    const s = (
      await db.query(
        "select * from compass_operating_records where id like 'capture:call-session:%'",
      )
    ).rows[0];
    assert.deepEqual(s.data.handled_ids, ["fixture"]);
    assert.equal(s.revision, 2);
    assert.equal((await run(db, "compass_goal_touch_save", p)).replayed, true);
    assert.equal(
      (
        await db.query(
          "select revision from compass_operating_records where id like 'capture:call-session:%'",
        )
      ).rows[0].revision,
      2,
    );
    assert.equal(
      (await db.query("select count(*)::int n from compass_pathfinder_links"))
        .rows[0].n,
      2,
    );
    await assert.rejects(
      run(db, "compass_goal_touch_save", {
        ...p,
        revision: 1,
        request_id: "66666666-6666-4666-8666-666666666666",
      }),
      /open_action_exists/,
    );
    assert.equal(
      (await db.query("select count(*)::int n from lead_outreach_touches"))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("notebook receipts preserve original response beyond 200 saves, reject changed retry and stale writers", async () => {
  const db = await database();
  try {
    await db.exec("SET test.role='service_role'");
    const id = "planning.note.11111111-1111-1111-1111-111111111111";
    const save = (previous, value, request, digest) =>
      db.query(
        "select compass_save_planning_operation($1,$2,$3,now(),$4,$5,$6) r",
        [id, previous, value, request, digest, value],
      );
    await save(null, "revision1", "notebook-save-1", "hash1");
    let last = "revision1";
    for (let i = 2; i <= 205; i++) {
      await save(last, "revision" + i, "notebook-save-" + i, "hash" + i);
      last = "revision" + i;
    }
    assert.equal(
      (await save(null, "revision1", "notebook-save-1", "hash1")).rows[0].r,
      "revision1",
    );
    await assert.rejects(
      save(null, "bad", "notebook-save-1", "changed"),
      /request_id_reused/,
    );
    await assert.rejects(
      save("revision1", "bad", "stale-request", "different"),
      /revision_conflict/,
    );
    assert.equal(
      (await db.query("select value from compass_settings where id=$1", [id]))
        .rows[0].value,
      "revision205",
    );
    await db.exec("SET test.role='authenticated'");
    await assert.rejects(
      save(last, "bad", "operator-direct", "hash"),
      /service_required/,
    );
  } finally {
    await db.close();
  }
});

test("explicit task completion updates the canonical task and sync stream without impersonating an operator", async () => {
  const db = await database();
  try {
    await db.exec("SET test.operator='true'");
    const created = await run(
      db,
      "compass_goal_session_save",
      session,
      "operator",
    );
    const task = (
      await db.query("select * from compass_tasks where id=$1", [
        created.session.data.task_id,
      ])
    ).rows[0];
    const p = {
      request_id: "77777777-7777-4777-8777-777777777777",
      intent: "explicit",
      source: { role: "user", text: "Mark this task complete" },
      expires_at: "2099-01-01T00:00:00Z",
      command: {
        action: "complete_task",
        task_id: task.id,
        expected_updated_at: task.updated_at,
      },
    };
    const save = (payload, digest = "a".repeat(64)) =>
      db.query("select compass_complete_task_instruction($1,$2) r", [
        JSON.stringify(payload),
        digest,
      ]);
    await assert.rejects(save(p), /service_required/);
    await db.exec("SET test.role='service_role'");
    const result = (await save(p)).rows[0].r;
    assert.equal(result.actor, "delegated_user");
    assert.equal(result.task.status, "completed");
    assert.equal((await save(p)).rows[0].r.replayed, true);
    const e = (
      await db.query(
        "select * from compass_sync_v2_entities where entity_id=$1",
        [task.id],
      )
    ).rows[0];
    assert.equal(e.fields.status, "done");
    assert.equal(e.field_actors.status, "3d72aa42-9a36-518c-826b-95b486416a8c");
    assert.equal(
      (await db.query("select count(*)::int n from compass_sync_v2_changes"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      save({ ...p, command: { ...p.command, task_id: "other" } }),
      /request_id_reused/,
    );
    await assert.rejects(
      save({ ...p, request_id: "88888888-8888-4888-8888-888888888888" }),
      /revision_conflict/,
    );
  } finally {
    await db.close();
  }
});
