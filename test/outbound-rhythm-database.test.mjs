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
  return db;
}
const capture = (revision, id) => ({
  operation: "capture",
  lead_id: "fixture",
  revision,
  request_id: id,
  occurred_at: "2026-09-10T02:00:00Z",
  channel: "call",
  direction: "outbound",
  outcome: "decision_maker",
  note: "fixture",
  person_reached: "",
  disposition: "schedule",
  next: {
    title: "Callback",
    channel: "call",
    reason: "Agreed",
    timezone: "Australia/Perth",
    due: "2026-09-11T02:00:00Z",
    state: "accepted",
  },
});
async function save(db, p) {
  return (
    await db.query("select compass_outbound_rhythm_save($1) r", [
      JSON.stringify(p),
    ])
  ).rows[0].r;
}
test("atomic call+callback, retry, distinct same-day calls and concurrent edits", async () => {
  const db = await database();
  try {
    await db.exec("SET test.operator='true'");
    const p = capture(0, "a");
    const first = await save(db, p);
    assert.equal((await save(db, p)).replayed, true);
    assert.equal(
      (await db.query("select count(*)::int n from compass_tasks")).rows[0].n,
      1,
    );
    await assert.rejects(
      save(db, { ...p, note: "different" }),
      /request_id_reused/,
    );
    await assert.rejects(save(db, capture(0, "stale")), /revision_conflict/);
    await assert.rejects(save(db, capture(1, "orphan")), /open_action_exists/);
    assert.equal(
      (await db.query("select count(*)::int n from lead_outreach_touches"))
        .rows[0].n,
      1,
    );
    const task = (await db.query("select * from compass_tasks")).rows[0];
    const second = await save(db, {
      ...capture(1, "b"),
      task_id: task.id,
      expected_updated_at: task.updated_at,
      complete_task: true,
    });
    assert.notEqual(first.touch_id, second.touch_id);
    assert.equal(
      (await db.query("select count(*)::int n from lead_outreach_touches"))
        .rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from compass_tasks where status='completed'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("unresolved and restrictions persist; unauthorised/agent completion rejected", async () => {
  const db = await database();
  try {
    await assert.rejects(save(db, capture(0, "a")), /operator_required/);
    await db.exec("SET test.role='service_role'");
    await assert.rejects(
      save(db, capture(0, "a")),
      /operator_confirmation_required/,
    );
    const p = {
      ...capture(0, "u"),
      disposition: "unresolved",
      next: undefined,
      outcome: "do_not_contact",
      restriction: "call",
    };
    await save(db, p);
    const lead = (await db.query("select * from lead_contacts")).rows[0];
    assert.ok(lead.contact_restrictions.call);
    assert.equal(
      (await db.query("select outreach_state from compass_tasks")).rows[0]
        .outreach_state,
      "unresolved",
    );
  } finally {
    await db.close();
  }
});
test("provider replies replay once and older sends cannot undo reply or advance last outbound incorrectly", async () => {
  const db = await database();
  try {
    await db.exec("SET test.role='service_role'");
    const event = {
      id: "e1",
      lead_id: "fixture",
      at: "2026-09-10T04:00Z",
      event: "reply_received",
      status: "replied",
      provider_lead_id: "provider-fixture",
      campaign_id: "campaign-current",
      campaign_name: "QA current",
    };
    const apply = async (p) =>
      (
        await db.query("select compass_outbound_provider_event($1) r", [
          JSON.stringify(p),
        ])
      ).rows[0].r;
    await apply(event);
    assert.equal((await apply(event)).replayed, true);
    await apply({
      ...event,
      id: "e2",
      at: "2026-09-10T03:00Z",
      campaign_id: "campaign-old",
      event: "email_sent",
      status: "in_instantly",
    });
    assert.equal(
      (await db.query("select instantly_campaign_id from lead_contacts"))
        .rows[0].instantly_campaign_id,
      "campaign-current",
    );
    assert.equal(
      (await db.query("select outbound_status from lead_contacts")).rows[0]
        .outbound_status,
      "replied",
    );
    assert.equal(
      (await db.query("select count(*)::int n from lead_outreach_touches"))
        .rows[0].n,
      2,
    );
    await apply({
      ...event,
      id: "e3",
      at: "2026-09-10T02:00Z",
      event: "lead_unsubscribed",
      status: "suppressed",
    });
    assert.equal(
      (await db.query("select recontact_ok from lead_contacts")).rows[0]
        .recontact_ok,
      0,
    );
  } finally {
    await db.close();
  }
});

test("planning a callback does not fabricate an interaction", async () => {
  const db = await database();
  try {
    await db.exec("SET test.operator='true'");
    await save(db, { ...capture(0, "planned"), outcome: "next_step" });
    const lead = (
      await db.query(
        "select last_outbound_at,rhythm_last_interaction_at from lead_contacts",
      )
    ).rows[0];
    assert.equal(lead.last_outbound_at, null);
    assert.equal(lead.rhythm_last_interaction_at, null);
  } finally {
    await db.close();
  }
});
