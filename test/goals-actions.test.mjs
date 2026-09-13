import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./helpers/load-typescript.mjs";
import {
  validateDocument,
  documentFromText,
  documentText,
} from "../src/lib/rich-document.mjs";
import { assessOutcome } from "../src/lib/pathfinder/core.mjs";
const { sessionQueue, goalMeasures, sessionCommand } = loadTypescript(
  "src/lib/goal-actions.ts",
);
const { rhythmCommand } = loadTypescript("src/lib/outbound-rhythm.ts");
test("warm-up assignment is stable after each outcome; promises outrank a finished phase", () => {
  const ids = Array.from({ length: 20 }, (_, i) => "l" + i);
  const s = {
    data: {
      lead_ids: ids,
      handled_ids: ["l0"],
      priorities: Object.fromEntries(
        ids.map((id) => [id, { tier: "lower", reason: "Reviewed" }]),
      ),
      phase: "warmup",
    },
  };
  const q = sessionQueue(s, ids, ["l0"]);
  assert.equal(q.warm.length, 9);
  assert.deepEqual(q.due, ["l0"]);
  assert.equal(q.warm.includes("l10"), false);
  assert.equal(q.finish.length, 10);
  assert.equal(q.ordered[0], "l0");
  const held = sessionQueue(
    s,
    ids.filter((i) => i !== "l1"),
  );
  assert.equal(held.warm.includes("l1"), false);
});
test("rich notebook preserves legacy text and canonical action references; rejects unsafe links and malformed blocks", () => {
  const legacy = "# Literal heading\n\n**Existing words**";
  assert.equal(
    documentText(validateDocument(documentFromText(legacy))),
    legacy,
  );
  const d = {
    version: 1,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hello",
              marks: [
                { type: "bold" },
                { type: "textStyle", attrs: { fontFamily: "Georgia" } },
              ],
            },
          ],
        },
        {
          type: "compassTask",
          attrs: { taskId: "task-a", label: "Real action" },
        },
      ],
    },
  };
  assert.match(documentText(validateDocument(d)), /\/tasks\?task=task-a/);
  assert.throws(
    () =>
      validateDocument({
        version: 1,
        content: { type: "doc", content: [{ type: "text", text: "bad" }] },
      }),
    /structure/,
  );
  const bad = structuredClone(d);
  bad.content.content[0].content[0].marks = [
    { type: "link", attrs: { href: "javascript:alert(1)" } },
  ];
  assert.throws(() => validateDocument(bad), /links/);
});
test("paid customer evidence uses collected AUD in the chosen period; refunds and signed work do not replace cash", () => {
  const receipt = (id, kind, amount, day = "2026-09-14") => ({
    provenance: "reported",
    receipt: {
      receipt_id: id,
      payment_id: kind === "refund" ? "p1" : id,
      client_id: "client1",
      currency: "AUD",
      amount,
      kind,
      received_on: day,
    },
  });
  const m = goalMeasures(
    [
      receipt("p1", "payment", 2500),
      receipt("p1", "payment", 2500),
      receipt("r1", "refund", 500),
      receipt("old", "payment", 9000, "2026-09-10"),
    ],
    [],
    "2026-09-14",
    "2026-09-20",
  );
  assert.equal(m.paid, 1);
  assert.equal(m.cash, 2500);
  assert.equal(m.refunds, 500);
  assert.equal(goalMeasures([], []).paid, null);
});
test("conversation and market counters deduplicate events and companies and exclude no-answer", () => {
  const t = {
    id: "touch",
    contact_id: "l1",
    business_key: "same-business",
    contacted_at: "2026-09-14T01:00:00Z",
    outcome: "decision_maker",
    request_payload: { conversation: true, signals: ["value"] },
  };
  const m = goalMeasures(
    [],
    [
      t,
      t,
      { ...t, id: "other", contact_id: "l2" },
      {
        ...t,
        id: "no-answer",
        outcome: "no_answer",
        request_payload: { conversation: false },
      },
    ],
    "2026-09-14",
    "2026-09-20",
  );
  assert.equal(m.conversations, 2);
  assert.equal(m.positive, 2);
  assert.equal(m.coverage, 1);
});
test("an undated promise is allowed but a scheduled or accepted promise requires its agreed time", () => {
  const p = {
    operation: "capture",
    lead_id: "l",
    revision: 0,
    request_id: "55555555-5555-4555-8555-555555555555",
    occurred_at: "2026-09-13T01:00:00Z",
    channel: "call",
    direction: "outbound",
    outcome: "decision_maker",
    note: "Send details",
    person_reached: "",
    disposition: "unresolved",
    next: {
      title: "Send details",
      channel: "email",
      reason: "Asked",
      timezone: "Australia/Sydney",
      state: "proposed",
    },
  };
  assert.equal(rhythmCommand.safeParse(p).success, true);
  assert.equal(
    rhythmCommand.safeParse({ ...p, disposition: "schedule" }).success,
    false,
  );
  assert.equal(
    rhythmCommand.safeParse({ ...p, next: { ...p.next, state: "accepted" } })
      .success,
    false,
  );
  assert.equal(
    rhythmCommand.safeParse({ ...p, conversation: true, outcome: "no_answer" })
      .success,
    false,
  );
});
