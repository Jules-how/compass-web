import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const c = loadTypescript("src/lib/operating-core.ts");
const task = (id, context = {}, patch = {}) => ({
  id,
  title: id,
  status: "not-started",
  priority: 0,
  due: null,
  updated_at: "2026-09-10T10:00:00Z",
  operating_context: { state: "ready", reason: "Explicit work", ...context },
  ...patch,
});
test("paused campaign preserves sends; absent analytics is unknown; remaining is people not messages", () => {
  assert.deepEqual(
    c.campaignState(
      { status: 2 },
      { emails_sent_count: 40, leads_count: 40, contacted_count: 40 },
      "now",
    ),
    {
      status: "paused",
      observed_at: "now",
      sent: 40,
      loaded: 40,
      contacted: 40,
      remaining_first_contacts: 0,
      replies: null,
      next_send_at: null,
      analytics_available: true,
    },
  );
  assert.equal(c.campaignState({ status: 0 }, undefined, null).loaded, null);
  assert.equal(
    c.campaignState(
      { status: 1 },
      { emails_sent_count: 80, leads_count: 50, contacted_count: 40 },
      "now",
    ).remaining_first_contacts,
    10,
  );
});
test("queue excludes blocked dependencies, proposals, unavailable and completion awaiting confirmation", () => {
  const q = c.operatingQueue(
    [
      task("b", { depends_on: ["a"] }),
      task("a", {}, { status: "blocked" }),
      task("p", { state: "proposed" }),
      task("later", { available_on: "2026-09-12" }),
      task("proof", { state: "awaiting_confirmation" }),
      task("next"),
      task("closed", {}, { status: "completed" }),
    ],
    "2026-09-11",
  );
  assert.deepEqual(
    q.queue.map((t) => t.id),
    ["next"],
  );
  assert.equal(q.waiting.length, 3);
  assert.equal(q.proposals.length, 1);
  assert.equal(q.confirmation.length, 1);
});
test("reviewed order survives urgent interruption; alternatives expose recommended change", () => {
  const tasks = [
    task("a"),
    task("b"),
    task("promise", {}, { due: "2026-09-11", priority: 1 }),
  ];
  const q = c.operatingQueue(tasks, "2026-09-11", ["b", "a"]);
  assert.deepEqual(
    q.queue.map((t) => t.id),
    ["b", "a", "promise"],
  );
  assert.equal(q.recommended[0], "promise");
  assert.equal(q.interruption, true);
});
test("legacy uncontextualised tasks are proposals; date boundaries use Sydney DST", () => {
  assert.equal(
    c.operatingQueue([task("old", {}, { operating_context: {} })], "2026-09-11")
      .proposals.length,
    1,
  );
  assert.equal(c.sydneyDay(new Date("2026-10-04T13:30:00Z")), "2026-10-05");
  assert.equal(c.safeLink("javascript:alert(1)"), false);
  assert.equal(c.safeLink("//evil.test"), false);
});
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$select coalesce(current_setting('test.role',true),'service_role')$$;
 CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$select current_setting('test.operator',true)='true'$$;
 CREATE TABLE compass_tasks(id text primary key,title text,status text default 'not-started',priority real default 0,due text,source text,project_id text,task_type text,notes text,updated_at timestamptz default now());
 CREATE TABLE compass_pathfinder_links(goal_id text,work_type text,work_id text,relation text,state text,rationale text,actor text,updated_at timestamptz,UNIQUE(goal_id,work_type,work_id,relation));
 CREATE TABLE compass_projects(id text primary key,name text,status text,priority int,health text,summary text,source text,created_at timestamptz,updated_at timestamptz,mirrored_at timestamptz);
 CREATE FUNCTION portal_operator_create_task_mutation(p_task jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$declare t compass_tasks;begin IF auth.role()='service_role' THEN RAISE EXCEPTION 'not authenticated';END IF;INSERT INTO compass_tasks(id,title,status) VALUES(p_task->>'id',p_task->>'title','not-started') RETURNING * INTO t;RETURN jsonb_build_object('task',to_jsonb(t));end$$;
 CREATE FUNCTION portal_operator_apply_task_mutation(p_task_id text,p_patch jsonb,p_base_entity_version bigint) RETURNS jsonb LANGUAGE plpgsql AS $$declare t compass_tasks;begin IF auth.role()='service_role' THEN RAISE EXCEPTION 'not authenticated';END IF;UPDATE compass_tasks SET title=coalesce(p_patch->>'title',title),status=coalesce(p_patch->>'status',status),updated_at=clock_timestamp() WHERE id=p_task_id RETURNING * INTO t;RETURN jsonb_build_object('task',to_jsonb(t));end$$;`);
  await db.exec(
    await readFile(
      "supabase/migrations/20260910124500_operating_service.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20260910131000_operating_goal_links.sql",
      "utf8",
    ),
  );
  return db;
}
const save = async (db, p, actor = "agent") =>
  (
    await db.query("select compass_operating_save($1,$2) r", [
      JSON.stringify(p),
      actor,
    ])
  ).rows[0].r;
test("atomic stable work writes: retries, collision, revision conflict, evidence and operator completion", async () => {
  const db = await database();
  try {
    const p = {
      action: "task",
      request_id: "fixture-001",
      key: "promise:fixture",
      task: { title: "A real commitment" },
      context: {
        reason: "Explicit promise",
        state: "ready",
        goal_id: "fixture-goal",
      },
    };
    const a = await save(db, p);
    assert.equal((await save(db, p)).replayed, true);
    assert.equal(
      (await db.query("select count(*)::int n from compass_pathfinder_links"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      save(db, { ...p, task: { title: "different" } }),
      /request_id_reused/,
    );
    await assert.rejects(
      save(db, { ...p, request_id: "fixture-002" }),
      /revision_conflict/,
    );
    const report = {
      ...p,
      id: a.task.id,
      expected_updated_at: a.task.updated_at,
      request_id: "fixture-003",
      context: {
        ...p.context,
        state: "awaiting_confirmation",
        evidence: ["receipt"],
      },
    };
    const b = await save(db, report);
    assert.equal(b.task.status, "not-started");
    await assert.rejects(
      save(db, {
        ...report,
        request_id: "fixture-004",
        expected_updated_at: b.task.updated_at,
        task: { title: "A real commitment", status: "completed" },
      }),
      /operator_confirmation_required/,
    );
    await assert.rejects(
      save(db, { ...report, request_id: "fixture-005" }, "operator"),
      /actor_mismatch/,
    );
    await db.exec("SET test.role='authenticated';SET test.operator='true'");
    const done = await save(
      db,
      {
        ...report,
        request_id: "fixture-006",
        expected_updated_at: b.task.updated_at,
        task: { title: "A real commitment", status: "completed" },
      },
      "operator",
    );
    assert.equal(done.task.status, "completed");
    assert.equal(
      (await db.query("select count(*)::int n from compass_tasks")).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("source snapshots reject older events and stale writers; accepted day is operator-only", async () => {
  const db = await database();
  try {
    const p = {
      action: "record",
      request_id: "snapshot-001",
      id: "source:fixture",
      kind: "source",
      revision: 0,
      data: { checked_at: "2026-09-11T00:00:00Z" },
    };
    await save(db, p);
    await assert.rejects(
      save(db, { ...p, request_id: "snapshot-002" }),
      /revision_conflict/,
    );
    await assert.rejects(
      save(db, {
        ...p,
        request_id: "snapshot-003",
        revision: 1,
        data: { checked_at: "2026-09-10T00:00:00Z" },
      }),
      /older_observation/,
    );
    await assert.rejects(
      save(db, {
        ...p,
        request_id: "snapshot-004",
        id: "day:2026-09-11",
        kind: "day",
        data: { status: "accepted" },
      }),
      /operator_confirmation_required/,
    );
  } finally {
    await db.close();
  }
});

test("calendar commitments respect Sydney dates and do not infer task completion", () => {
  assert.equal(c.dateOnly("2026-09-10T23:30:00Z"), "2026-09-11");
  const records = [
    {
      id: "source:calendar",
      data: {
        events: [
          {
            id: "a",
            summary: "Appointment",
            start: "2026-09-10T23:30:00Z",
            end: "2026-09-11T00:30:00Z",
            url: "https://calendar.google.com",
          },
          {
            id: "b",
            start: "2026-09-11T02:00:00Z",
            end: "2026-09-11T03:00:00Z",
            my_response_status: "declined",
          },
        ],
      },
    },
  ];
  assert.equal(
    c.calendarCommitments(records, "2026-09-11", "2026-09-11").length,
    1,
  );
  assert.equal(
    c.calendarCommitments(records, "2026-09-10", "2026-09-10").length,
    0,
  );
});
