import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Minimal pre-existing schema. Existing Sync v2 RPCs are boundaries, replaced by
// simple transactional implementations here; the Pathfinder migration is unmodified.
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE compass_settings(id text PRIMARY KEY);
 CREATE TABLE compass_tasks(id text PRIMARY KEY,title text,status text,notes text,updated_at timestamptz DEFAULT now());
 CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.operator',true),'false')='true'$$;
 CREATE FUNCTION portal_operator_create_task_mutation(p_task jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE task compass_tasks;BEGIN
  INSERT INTO compass_tasks(id,title,status,notes) VALUES(gen_random_uuid()::text,p_task->>'title',p_task->>'status',p_task->>'notes') RETURNING * INTO task;
  RETURN jsonb_build_object('task',to_jsonb(task)); END $$;
 CREATE FUNCTION portal_operator_apply_task_mutation(p_task_id text,p_patch jsonb,p_base_entity_version bigint) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE task compass_tasks;BEGIN
  UPDATE compass_tasks SET title=coalesce(p_patch->>'title',title),status=coalesce(p_patch->>'status',status),updated_at=clock_timestamp() WHERE id=p_task_id RETURNING * INTO task;
  RETURN jsonb_build_object('status','applied','task',to_jsonb(task)); END $$;
 INSERT INTO compass_settings VALUES('goal-1');`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/0081_compass_pathfinder.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}
test("migration: persistent finding -> exactly one shared task and audit trail; stale editor rejected", async () => {
  const db = await database();
  try {
    await db.exec(`SET test.operator='true'`);
    const issue = (
      await db.query(
        `INSERT INTO compass_pathfinder_issues(goal_id,issue_key,title,symptom,next_action,source,actor) VALUES('goal-1','conversion-gap','Investigate conversion','Fewer wins','Review lost opportunities','CRM review','agent') RETURNING id`,
      )
    ).rows[0];
    const first = (
      await db.query("SELECT pathfinder_create_issue_task($1) AS result", [
        issue.id,
      ])
    ).rows[0].result;
    const again = (
      await db.query("SELECT pathfinder_create_issue_task($1) AS result", [
        issue.id,
      ])
    ).rows[0].result;
    assert.equal(first.reused, false);
    assert.equal(again.reused, true);
    assert.equal(first.task_id, again.task_id);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM compass_tasks")).rows[0]
        .n,
      1,
    );
    assert.equal(
      (await db.query("SELECT work_id FROM compass_pathfinder_links")).rows[0]
        .work_id,
      first.task_id,
    );
    const task = (await db.query("SELECT * FROM compass_tasks")).rows[0];
    const update = (
      await db.query(
        `SELECT pathfinder_apply_task($1,'{"status":"completed"}',$2) AS result`,
        [task.id, task.updated_at],
      )
    ).rows[0].result;
    assert.equal(update.task.status, "completed");
    const stale = (
      await db.query(
        `SELECT pathfinder_apply_task($1,'{"title":"stale edit"}',$2) AS result`,
        [task.id, task.updated_at],
      )
    ).rows[0].result;
    assert.equal(stale.status, "conflict");
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM compass_pathfinder_activity",
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM compass_pathfinder_observations",
        )
      ).rows[0].n,
      0,
      "task completion must not generate outcome evidence",
    );
    await assert.rejects(
      () =>
        db.query(
          `INSERT INTO compass_pathfinder_issues(goal_id,issue_key,title,symptom,next_action,source,actor) VALUES('goal-1','conversion-gap','Renamed tomorrow','x','x','x','agent')`,
        ),
      /unique/,
    );
  } finally {
    await db.close();
  }
});
test("database rejects agent-verified observations, duplicate receipts and unauthorised task creation", async () => {
  const db = await database();
  try {
    const sql = `INSERT INTO compass_pathfinder_observations(goal_id,goal_revision,idempotency_key,provenance,value,source,period_start,period_end,observed_at,actor) VALUES('goal-1',1,'observation-1',$1,15000,'ledger','2026-09-01','2026-09-09',now(),$2)`;
    await assert.rejects(
      () => db.query(sql, ["measured", "agent"]),
      /check constraint/,
    );
    await db.query(sql, ["reported", "agent"]);
    await assert.rejects(() => db.query(sql, ["reported", "agent"]), /unique/);
    await assert.rejects(
      () => db.query(`SELECT pathfinder_create_issue_task(gen_random_uuid())`),
      /operator_required/,
    );
    await db.exec(`SET ROLE authenticated; SET test.operator='false'`);
    assert.equal(
      (await db.query("SELECT * FROM compass_pathfinder_observations")).rows
        .length,
      0,
    );
    await assert.rejects(
      () => db.query(`DELETE FROM compass_pathfinder_observations`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("a recommendation can reuse canonical work before any new task is created", async () => {
  const db = await database();
  try {
    await db.exec(
      `SET test.operator='true'; INSERT INTO compass_tasks(id,title,status) VALUES('existing-task','Already planned diagnostic','in-progress')`,
    );
    const issue = (
      await db.query(
        `INSERT INTO compass_pathfinder_issues(goal_id,issue_key,title,symptom,next_action,source,actor) VALUES('goal-1','existing-diagnostic','Investigate','Gap','Review','CRM','agent') RETURNING id`,
      )
    ).rows[0];
    const linked = (
      await db.query("SELECT pathfinder_create_issue_task($1,$2) AS result", [
        issue.id,
        "existing-task",
      ])
    ).rows[0].result;
    assert.deepEqual(linked, { task_id: "existing-task", reused: true });
    const retry = (
      await db.query("SELECT pathfinder_create_issue_task($1) AS result", [
        issue.id,
      ])
    ).rows[0].result;
    assert.equal(retry.task_id, "existing-task");
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM compass_tasks")).rows[0]
        .n,
      1,
    );
  } finally {
    await db.close();
  }
});
