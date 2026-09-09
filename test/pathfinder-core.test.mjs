import test from "node:test";
import assert from "node:assert/strict";
import {
  canWritePathfinderLink,
  assessOutcome,
  executionSummary,
  supportingTasks,
  semanticLevel,
  graphForView,
  issueIdentity,
} from "../src/lib/pathfinder/core.mjs";
import {
  assertPlanningAuthority,
  validatePlanning,
  goalProgress,
} from "../src/lib/planning-core.mjs";
import { callTool } from "../mcp/lib.mjs";
const now = "2026-09-09T12:00:00.000Z";
const goal = {
  id: "planning.goal.00000000-0000-0000-0000-000000000001",
  revision: 1,
  data: {
    title: "Outcome",
    status: "committed",
    regular: 15000,
    baseline: 5000,
    unit: "AUD MRR",
    freshnessDays: 30,
  },
};
const observed = {
  id: "o",
  goal_id: goal.id,
  goal_revision: 1,
  provenance: "measured",
  value: 15000,
  accepted: null,
  source: "Billing ledger reconciled",
  period_start: "2026-09-01",
  period_end: "2026-09-09",
  observed_at: now,
};
test("tasks cannot establish achievement; reported, estimates, stale and old-definition evidence remain distinct", () => {
  assert.equal(assessOutcome(goal, [], now).state, "unknown");
  assert.equal(
    assessOutcome(goal, [{ ...observed, provenance: "estimate" }], now).state,
    "unknown",
  );
  assert.equal(
    assessOutcome(goal, [{ ...observed, provenance: "reported" }], now).state,
    "reported",
  );
  assert.equal(
    assessOutcome(goal, [{ ...observed, goal_revision: 2 }], now).state,
    "unknown",
  );
  assert.equal(
    assessOutcome(goal, [{ ...observed, period_end: "2026-07-01" }], now).state,
    "stale",
  );
  assert.equal(assessOutcome(goal, [observed], now).state, "achieved");
  assert.equal(
    assessOutcome(goal, [{ ...observed, value: 10000 }], now).progress,
    50,
  );
  assert.equal(goal.data.regular, 15000);
});
test("zero is an observation; estimates do not replace actuals", () => {
  assert.equal(
    assessOutcome(goal, [{ ...observed, value: 0 }], now).observation.value,
    0,
  );
  const a = assessOutcome(
    goal,
    [
      { ...observed, value: 10000 },
      { ...observed, id: "e", provenance: "estimate", value: 30000 },
    ],
    now,
  );
  assert.equal(a.observation.value, 10000);
  assert.equal(a.estimate.value, 30000);
  assert.equal(a.state, "measured");
});
test("qualitative acceptance has no percentage; decreasing targets use baseline", () => {
  const q = {
    ...goal,
    data: {
      measurementType: "qualitative",
      criteria: "Accepted deliverable",
      freshnessDays: 30,
    },
  };
  const a = assessOutcome(
    q,
    [{ ...observed, value: null, accepted: true }],
    now,
  );
  assert.equal(a.state, "achieved");
  assert.equal(a.progress, null);
  assert.equal(
    goalProgress({
      direction: "decrease",
      baseline: 10,
      regular: 5,
      actual: 7.5,
    }),
    50,
  );
  assert.equal(
    goalProgress({ direction: "decrease", regular: 5, actual: 7.5 }),
    null,
  );
  assert.throws(
    () =>
      validatePlanning("goal", {
        title: "Q",
        period: "quarterly",
        due: "2026-12-01",
        measurementType: "qualitative",
      }),
    /acceptance/,
  );
});
test("agent authority protects committed targets, dates, status and deletion", () => {
  for (const data of [
    { ...goal.data, regular: 1 },
    { ...goal.data, due: "2027-01-01" },
    { ...goal.data, status: "draft" },
    { ...goal.data, archived: true },
  ])
    assert.throws(
      () => assertPlanningAuthority("goal", goal, data, "agent"),
      /Only Jules/,
    );
  assert.throws(() =>
    assertPlanningAuthority("goal", null, goal.data, "agent"),
  );
  assert.doesNotThrow(() =>
    assertPlanningAuthority("goal", null, { status: "draft" }, "agent"),
  );
  assert.doesNotThrow(() =>
    assertPlanningAuthority("goal", goal, goal.data, "operator"),
  );
});
const tasks = [
  { id: "parent", project_id: "p", status: "completed" },
  {
    id: "child",
    parent_task_id: "parent",
    project_id: "p",
    status: "completed",
  },
  { id: "t", project_id: "p", status: "blocked" },
  { id: "x", status: "cancelled" },
];
const links = [
  {
    id: "l",
    goal_id: goal.id,
    work_type: "project",
    work_id: "p",
    state: "active",
    relation: "contributes",
  },
  {
    id: "l2",
    goal_id: goal.id,
    work_type: "task",
    work_id: "child",
    state: "active",
    relation: "contributes",
  },
];
test("shared project and task links do not double count parent/child execution", () => {
  const support = supportingTasks(goal.id, links, [], tasks);
  assert.deepEqual(executionSummary(support), {
    total: 2,
    completed: 1,
    blocked: 1,
  });
  assert.equal(support.length, 3);
  assert.equal(
    supportingTasks(
      goal.id,
      links.map((l) => ({ ...l, state: "proposed" })),
      [],
      tasks,
    ).length,
    0,
  );
});
test("semantic zoom reveals real work and keeps persisted node placement", () => {
  const data = {
    readAt: now,
    goals: [goal],
    links,
    observations: [],
    issues: [],
    projects: [{ id: "p", name: "Project" }],
    tasks: tasks.map((t) => ({ ...t, title: t.id })),
    checkpoints: [],
    dependencies: [],
  };
  const before = JSON.stringify(data);
  assert.equal(semanticLevel(0.6), "strategy");
  assert.equal(semanticLevel(1), "route");
  assert.equal(semanticLevel(1.5), "execution");
  const overview = graphForView(data, { level: "strategy", history: true });
  const route = graphForView(data, { level: "route", history: true });
  const execution = graphForView(data, {
    level: "execution",
    history: true,
    positions: { "project:p": { x: 12, y: 34 } },
  });
  assert.equal(overview.nodes.length, 1);
  assert.equal(route.nodes.length, 2);
  assert.ok(execution.nodes.length > route.nodes.length);
  assert.equal(execution.nodes.filter((n) => n.id === "task:child").length, 1);
  assert.deepEqual(execution.nodes.find((n) => n.id === "project:p").position, {
    x: 12,
    y: 34,
  });
  assert.equal(JSON.stringify(data), before, "exploration must be read-only");
});
test("stable issue identity ignores title and review date; MCP failures are errors", async () => {
  assert.equal(
    issueIdentity(goal.id, "conversion-gap"),
    issueIdentity(goal.id, "conversion-gap"),
  );
  await assert.rejects(async () => issueIdentity(goal.id, "Bad key"));
  let sent;
  const result = await callTool(
    "pathfinder.review",
    { goal_id: goal.id, issue_key: "conversion-gap", revision: 1 },
    {
      cfg: { baseUrl: "https://example.test", secret: "test" },
      fetchImpl: async (url, init) => {
        sent = { url: String(url), body: JSON.parse(init.body) };
        return new Response(JSON.stringify({ error: "conflict" }), {
          status: 409,
        });
      },
    },
  );
  assert.equal(sent.body.action, "review");
  assert.ok(sent.url.endsWith("/api/agent/pathfinder"));
  assert.equal(result.isError, true);
});

test("agents can propose links but cannot commit or demote the approved route", () => {
  assert.equal(canWritePathfinderLink("agent", null, {state:"proposed"}),true);
  assert.equal(canWritePathfinderLink("agent", null, {state:"active"}),false);
  assert.equal(canWritePathfinderLink("agent", {state:"active"}, {state:"proposed"}),false);
  assert.equal(canWritePathfinderLink("operator", {state:"active"}, {state:"proposed"}),true);
});
