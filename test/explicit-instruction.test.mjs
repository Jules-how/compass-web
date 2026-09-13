import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const { checkExplicitInstruction } = loadTypescript(
  "src/lib/explicit-instruction.ts",
);
const keys = generateKeyPairSync("ed25519"),
  publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
const now = Date.parse("2026-09-13T02:00:00Z");
const p = {
  version: 1,
  issuer: "codex-local",
  request_id: "11111111-1111-4111-8111-111111111111",
  issued_at: "2026-09-13T02:00:00Z",
  expires_at: "2026-09-13T02:10:00Z",
  source: {
    thread_id: "22222222-2222-4222-8222-222222222222",
    message_id: "message1",
    text: "Mark task A complete",
    text_sha256: createHash("sha256")
      .update("Mark task A complete")
      .digest("hex"),
    role: "user",
  },
  intent: "explicit",
  command: {
    action: "complete_task",
    task_id: "task-a",
    expected_updated_at: "2026-09-13T01:00:00Z",
  },
};
function envelope(p) {
  const payload = Buffer.from(JSON.stringify(p)).toString("base64url");
  return {
    payload,
    signature: sign(
      null,
      Buffer.from(payload, "base64url"),
      keys.privateKey,
    ).toString("base64url"),
  };
}
test("trusted source signature binds exact task, revision and user message", () => {
  assert.equal(
    checkExplicitInstruction(envelope(p), publicKey, now).expired,
    false,
  );
  const e = envelope(p);
  e.payload = Buffer.from(
    JSON.stringify({ ...p, command: { ...p.command, task_id: "task-b" } }),
  ).toString("base64url");
  assert.throws(() => checkExplicitInstruction(e, publicKey, now), /signature/);
});
test("suggestions, tool sources, expired and unconfigured adapters cannot authorize a new mutation", () => {
  assert.throws(() =>
    checkExplicitInstruction(
      envelope({ ...p, intent: "inferred" }),
      publicKey,
      now,
    ),
  );
  assert.throws(() =>
    checkExplicitInstruction(
      envelope({ ...p, source: { ...p.source, role: "assistant" } }),
      publicKey,
      now,
    ),
  );
  assert.equal(
    checkExplicitInstruction(envelope(p), publicKey, now + 600001).expired,
    true,
  );
  assert.throws(
    () => checkExplicitInstruction(envelope(p), "", now),
    /no trusted/,
  );
  assert.throws(() =>
    checkExplicitInstruction(
      envelope({ ...p, command: { action: "send_campaign", id: "campaign" } }),
      publicKey,
      now,
    ),
  );
});
