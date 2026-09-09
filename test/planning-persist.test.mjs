import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { compareAndSwapPlanning, currentPlanningRecord } from "../src/lib/planning-persist.mjs";

const id = "planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0";
test("large encrypted history travels in an RPC body; outages are not misreported as conflicts", async () => {
  const previous = "x".repeat(256000);
  let call;
  const db = { rpc: async (...args) => { call = args; return { data: true }; } };
  await compareAndSwapPlanning(db, id, previous, "new", "2026-09-09T07:20:00Z");
  assert.equal(call[1].p_expected_value, previous);
  await assert.rejects(compareAndSwapPlanning({rpc: async () => ({data: false})}, id, previous, "new", "now"), /record changed/);
  await assert.rejects(compareAndSwapPlanning({rpc: async () => ({error: {message: "secret database detail"}})}, id, previous, "new", "now"), /service status/);
});
test("compact reads retain source and revision without copying old history or mutating the record", () => {
  const row = {id, revision: 4, data: {body: "current"}, history: [{data: {body: "superseded"}}]};
  assert.deepEqual(currentPlanningRecord(row), {id, revision: 4, data: {body: "current"}});
  assert.equal(row.history.length, 1);
});
test("database CAS preserves the winning writer, supports large values and limits execution to service role", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE TABLE compass_settings(id text PRIMARY KEY,value text,updated_at timestamptz,mirrored_at timestamptz);
      GRANT SELECT,UPDATE ON compass_settings TO service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated,anon;`);
    await db.exec(await readFile(new URL("../supabase/migrations/20260909072000_planning_atomic_save.sql", import.meta.url), "utf8"));
    const previous = "e".repeat(256000);
    await db.query("INSERT INTO compass_settings(id,value) VALUES($1,$2)", [id, previous]);
    await db.exec("SET ROLE service_role");
    const update = (expected, next) => db.query("SELECT compass_save_planning_revision($1,$2,$3,now()) AS saved", [id, expected, next]);
    assert.equal((await update(previous, "winner")).rows[0].saved, true);
    assert.equal((await update(previous, "stale overwrite")).rows[0].saved, false);
    assert.equal((await db.query("SELECT value FROM compass_settings WHERE id=$1", [id])).rows[0].value, "winner");
    await assert.rejects(db.query("SELECT compass_save_planning_revision('integrations.secret','x','y',now())"), /Invalid planning/);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    await assert.rejects(update("winner", "unauthorised"), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(update("winner", "unauthorised"), /permission denied/);
  } finally { await db.close(); }
});
