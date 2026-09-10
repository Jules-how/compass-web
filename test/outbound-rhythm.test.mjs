import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./helpers/load-typescript.mjs";
const r = loadTypescript("src/lib/outbound-rhythm.ts");
const commit = loadTypescript("src/lib/lead-commit.ts");
const empty = () => ({
  byId: new Map(),
  bySource: new Map(),
  byEmail: new Map(),
  byDomain: new Map(),
  byCompanyCity: new Map(),
});
test("Perth callback uses prospect timezone; Sydney DST gaps/overlaps rejected", () => {
  assert.equal(
    r.localDateTimeToIso("2026-09-11T10:00", "Australia/Perth"),
    "2026-09-11T02:00:00.000Z",
  );
  assert.equal(
    r.localDateTimeToIso("2026-10-05T10:00", "Australia/Sydney"),
    "2026-10-04T23:00:00.000Z",
  );
  assert.throws(
    () => r.localDateTimeToIso("2026-10-04T02:30", "Australia/Sydney"),
    /does not exist/,
  );
  assert.throws(
    () => r.localDateTimeToIso("2026-04-05T02:30", "Australia/Sydney"),
    /twice/,
  );
});
test("real phone-only identity; no placeholder email; explicit enrichment retains identity", () => {
  const row = {
    company: "Example fixture",
    phone: "0895550101",
    phone_source_url: "https://example.test/contact",
    contact_source_key: "fixture-1",
  };
  const d = commit.decideLeadCommit(row, empty());
  assert.equal(d.action, "insert");
  assert.equal(d.row.email, null);
  const look = empty();
  const existing = { ...d.row, email: null, outbound_status: "suppressed" };
  look.byId.set(d.row.id, existing);
  const update = commit.decideLeadCommit(
    {
      ...row,
      id: d.row.id,
      email: "office@example.test",
      outbound_status: "uncontacted",
    },
    look,
  );
  assert.equal(update.id, d.row.id);
  assert.equal(update.patch.outbound_status, undefined);
  assert.equal(
    commit.decideLeadCommit(
      { company: "Fixture", phone: "0895550101" },
      empty(),
    ).action,
    "skip",
  );
});
test("rank commitments before unresolved and proposals, closed removed", () => {
  const base = { priority: 0, status: "not-started" };
  const now = new Date("2026-09-10T03:00Z");
  const list = r.rankActions(
    [
      {
        ...base,
        id: "proposal",
        outreach_state: "proposed",
        due: "2026-09-09T00:00Z",
      },
      { ...base, id: "review", outreach_state: "unresolved" },
      {
        ...base,
        id: "call",
        outreach_state: "accepted",
        due: "2026-09-10T02:00Z",
      },
      { ...base, id: "done", outreach_state: "accepted", status: "completed" },
    ],
    now,
  );
  assert.deepEqual(
    list.map((x) => x.id),
    ["call", "review", "proposal"],
  );
});
test("channel restrictions and event metrics do not conflate gatekeepers and buyers", () => {
  assert.ok(
    r.restrictionReason(
      { phone: "1", contact_restrictions: { call: {} } },
      "call",
    ),
  );
  assert.equal(
    r.restrictionReason(
      {
        phone: "1",
        suppression_reason: "instantly_bounced",
        contact_restrictions: {},
      },
      "call",
    ),
    null,
  );
  const m = r.weeklyOutcomes([
    {
      contact_id: "1",
      channel: "call",
      direction: "outbound",
      outcome: "office_reached",
    },
    {
      contact_id: "1",
      channel: "call",
      direction: "outbound",
      outcome: "decision_maker",
    },
    {
      contact_id: "1",
      channel: "email",
      direction: "inbound",
      outcome: "auto_reply_received",
    },
  ]);
  assert.equal(m.callAttempts, 2);
  assert.equal(m.uniqueCalled, 1);
  assert.equal(m.officeConversations, 1);
  assert.equal(m.decisionMakerConversations, 1);
  assert.equal(m.humanReplies, 0);
});
