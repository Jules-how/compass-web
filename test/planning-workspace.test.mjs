import test from "node:test";
import assert from "node:assert/strict";
import {
  goalWorkspace,
  timelineEntries,
  journeyForView,
} from "../src/lib/pathfinder/workspace.mjs";
import {
  validatePlanning,
  planningHistory,
} from "../src/lib/planning-core.mjs";
import { loadTypescript } from "./helpers/load-typescript.mjs";
import { assessOutcome } from "../src/lib/pathfinder/core.mjs";
const goal = (id, due, parentId = "") => ({
  id,
  revision: 1,
  data: {
    title: id,
    due,
    parentId,
    status: "committed",
    regular: 5000,
    period: "quarterly",
    freshnessDays: 30,
  },
});
const data = () => ({
  readAt: "2026-09-09T12:00:00Z",
  goals: [goal("g1", "2026-10-01"), goal("g2", "2026-12-01", "g1")],
  projects: [
    {
      id: "p1",
      name: "Pilot",
      status: "in-progress",
      target_date: "2026-09-20",
      labels: ["sprint"],
    },
    {
      id: "p2",
      name: "Follow up",
      status: "backlog",
      target_date: null,
      labels: [],
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "Ready",
      project_id: "p1",
      parent_task_id: null,
      due: "2026-09-15",
      status: "not-started",
      priority: 0,
    },
    {
      id: "parent",
      title: "Container",
      project_id: "p1",
      parent_task_id: null,
      status: "not-started",
      due: null,
    },
    {
      id: "child",
      title: "Child task",
      project_id: "p1",
      parent_task_id: "parent",
      status: "completed",
      due: "2026-09-13",
    },
    {
      id: "t2",
      title: "Blocked by pilot",
      project_id: "p2",
      status: "not-started",
      due: "2026-09-10",
    },
  ],
  checkpoints: [
    {
      id: "cp1",
      project_id: "p1",
      title: "Launch",
      target_date: "2026-09-18",
      completed: false,
    },
  ],
  links: [
    {
      id: "l1",
      goal_id: "g1",
      work_type: "project",
      work_id: "p1",
      state: "active",
    },
    {
      id: "l2",
      goal_id: "g2",
      work_type: "project",
      work_id: "p2",
      state: "active",
    },
    {
      id: "l3",
      goal_id: "g1",
      work_type: "task",
      work_id: "child",
      state: "active",
    },
  ],
  dependencies: [{ project_id: "p2", depends_on_project_id: "p1" }],
  observations: [],
  issues: [],
  activity: [],
  businessFunctions: [],
});
test("the goal pad follows approved goal/project membership without duplicate tasks or container actions", () => {
  const d = data(),
    w = goalWorkspace(d, "g1");
  assert.deepEqual(
    w.goals.map((g) => g.id),
    ["g1", "g2"],
  );
  assert.equal(w.tasks.length, 4);
  assert.deepEqual(
    w.actions.map((t) => t.id),
    ["t1", "t2"],
  );
  assert.equal(w.actions[1].waiting, true);
  assert.equal(w.actions[1].prerequisites[0].id, "p1");
  d.projects[0].status = "completed";
  assert.equal(
    goalWorkspace(d, "g1").actions.find((t) => t.id === "t2").waiting,
    false,
  );
});
test("a proposed project and a checkpoint do not commit the entire project to a goal", () => {
  const d = data();
  d.links = [
    { goal_id: "g1", work_type: "project", work_id: "p2", state: "proposed" },
    { goal_id: "g1", work_type: "checkpoint", work_id: "cp1", state: "active" },
  ];
  d.goals = [d.goals[0]];
  const w = goalWorkspace(d, "g1");
  assert.equal(w.tasks.length, 0);
  assert.equal(w.projects.length, 0);
  assert.equal(w.checkpoints.length, 1);
});
test("next actions respect Compass priorities and do not treat cancellation as completed prerequisites", () => {
  const d = data();
  d.tasks = [0, 4, 2, 1, 3].map((priority) => ({
    id: `priority-${priority}`,
    title: `Priority ${priority}`,
    priority,
    project_id: "p2",
    parent_task_id: null,
    status: "not-started",
    due: "2026-09-15",
  }));
  d.projects[0].status = "archived";
  assert.deepEqual(
    goalWorkspace(d, "g1").actions.map((t) => t.priority),
    [1, 2, 3, 4, 0],
  );
  assert.ok(goalWorkspace(d, "g1").actions.every((t) => !t.waiting));
  for (const status of ["canceled", "cancelled"]) {
    d.projects[0].status = status;
    assert.ok(goalWorkspace(d, "g1").actions.every((t) => t.waiting));
  }
});
test("timeline keeps undated work explicit and uses actual milestone/task dates", () => {
  const items = timelineEntries(goalWorkspace(data(), "g1"));
  assert.equal(items.find((i) => i.id === "cp1").date, "2026-09-18");
  assert.equal(items.find((i) => i.id === "p2").date, null);
  assert.equal(items.find((i) => i.id === "child").complete, true);
  assert.equal(items.find((i) => i.id === "g1").complete, false);
});
test("journey reads left to right by date; zoom reveals real sprints/tasks and preserves manual positions", () => {
  const d = data(),
    strategy = journeyForView(d, { level: "strategy" }),
    route = journeyForView(d, { level: "route" }),
    execution = journeyForView(d, {
      level: "execution",
      positions: { "task:t1": { x: 12, y: 34 } },
    });
  assert.deepEqual(
    strategy.nodes.map((n) => n.id),
    ["checkpoint:cp1", "g1", "g2"],
  );
  assert.ok(strategy.nodes[0].position.x < strategy.nodes[1].position.x);
  assert.equal(strategy.nodes[0].data.projectId, "p1");
  assert.equal(strategy.edges.length, 2);
  assert.ok(
    route.nodes
      .find((n) => n.id === "project:p1")
      .data.subtitle.startsWith("Sprint"),
  );
  assert.ok(execution.nodes.some((n) => n.id === "task:child"));
  assert.deepEqual(execution.nodes.find((n) => n.id === "task:t1").position, {
    x: 12,
    y: 34,
  });
  assert.equal(
    new Set(execution.nodes.map((n) => n.id)).size,
    execution.nodes.length,
  );
  for (const edge of execution.edges) {
    assert.ok(execution.nodes.some((n) => n.id === edge.source));
    assert.ok(execution.nodes.some((n) => n.id === edge.target));
  }
});
test("notebook preserves whitespace, date and checklist content through autosave", () => {
  const body = "## Thinking\n- [ ] Review the list\n\n";
  const note = validatePlanning("note", {
    title: "Notes",
    date: "2026-09-09",
    body,
  });
  assert.equal(note.body, body);
  assert.equal(note.date, "2026-09-09");
  assert.throws(() =>
    validatePlanning("note", { title: "Notes", date: "2026-02-30" }),
  );
});
test("a proposed goal can start as a written idea; committing it still requires a target and date", () => {
  const idea = {
    title: "A better delivery experience",
    status: "draft",
    period: "quarterly",
    start: "2026-09-09",
    notes: "Write down what great looks like.\n",
  };
  const draft = validatePlanning("goal", idea);
  assert.equal(draft.regular, null);
  assert.equal(draft.due, "");
  assert.equal(draft.notes, idea.notes);
  assert.throws(() =>
    validatePlanning("goal", { ...idea, status: "committed" }),
  );
  assert.throws(() =>
    validatePlanning("goal", { ...idea, regular: 3, status: "committed" }),
  );
  assert.doesNotThrow(() =>
    validatePlanning("goal", {
      ...idea,
      regular: 3,
      due: "2026-10-01",
      status: "committed",
    }),
  );
  assert.doesNotThrow(() =>
    validatePlanning("goal", { ...idea, measurementType: "qualitative" }),
  );
  const qualitative = {
    id: "g1",
    revision: 1,
    data: validatePlanning("goal", { ...idea, measurementType: "qualitative" }),
  };
  const evidence = {
    goal_id: "g1",
    goal_revision: 1,
    observed_at: "2026-09-09T12:00:00Z",
    period_end: "2026-09-09",
    accepted: true,
    provenance: "measured",
  };
  assert.equal(
    assessOutcome(qualitative, [evidence], "2026-09-09T12:00:00Z").state,
    "unknown",
  );
  assert.throws(() =>
    validatePlanning("goal", {
      ...idea,
      measurementType: "qualitative",
      due: "2026-10-01",
      status: "committed",
    }),
  );
});
test("frequent note saves retain the start-of-session snapshot; goals keep every revision", () => {
  const old = {
    revision: 2,
    updatedAt: "2026-09-09T12:01:00Z",
    data: { title: "Second draft" },
    history: [
      {
        revision: 1,
        at: "2026-09-09T12:00:00Z",
        data: { title: "Before writing" },
      },
    ],
  };
  assert.equal(planningHistory(old, "note", "2026-09-09T12:02:00Z").length, 1);
  assert.equal(planningHistory(old, "note", "2026-09-09T12:06:00Z").length, 2);
  assert.equal(planningHistory(old, "goal", "2026-09-09T12:02:00Z").length, 2);
});
const routeFile = "src/app/api/projects/[id]/milestones/route.ts";
const request = (method, body) =>
  new Request("https://compass.test/api/projects/p1/milestones", {
    method,
    headers: {
      origin: "https://compass.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
const input = {
  id: "milestone-11111111-1111-4111-8111-111111111111",
  title: "Launch",
  target_date: "2026-09-20",
};
const context = { params: Promise.resolve({ id: "p1" }) };
function routeStub({ previous = null, changed = null } = {}) {
  const calls = [];
  const query = {
    select() {
      return this;
    },
    eq(key, value) {
      calls.push(["eq", key, value]);
      return this;
    },
    maybeSingle: async () => ({
      data: calls.some((c) => c[0] === "update") ? changed : previous,
      error: null,
    }),
    single: async () => ({ data: { ...input, project_id: "p1" }, error: null }),
    insert(values) {
      calls.push(["insert", values]);
      return this;
    },
    update(values) {
      calls.push(["update", values]);
      return this;
    },
  };
  const route = loadTypescript(routeFile, {
    "@/lib/portal-access": {
      requirePortalAccess: async (options) => {
        assert.equal(options.operator, true);
        return {
          supabase: {
            from: (table) => {
              assert.equal(table, "compass_project_milestones");
              return query;
            },
          },
        };
      },
    },
    "@/lib/portal-http": {
      requireSameOrigin: () => null,
      readBoundedJson: (r) => r.json(),
      portalAccessResponse: () => null,
      portalJson: (value, init) => new Response(JSON.stringify(value), init),
    },
  });
  return { route, calls };
}
test("milestone creation inserts one record and safely reuses the same request ID", async () => {
  const { route, calls } = routeStub();
  assert.equal((await route.POST(request("POST", input), context)).status, 201);
  assert.equal(calls.filter((c) => c[0] === "insert").length, 1);
  const again = routeStub({ previous: { ...input, project_id: "p1" } });
  assert.equal(
    (await again.route.POST(request("POST", input), context)).status,
    200,
  );
  assert.equal(again.calls.filter((c) => c[0] === "insert").length, 0);
  const invalid = routeStub();
  assert.equal(
    (
      await invalid.route.POST(
        request("POST", { ...input, target_date: "2026-02-30" }),
        context,
      )
    ).status,
    400,
  );
  assert.equal(invalid.calls.length, 0);
});
test("milestone edits compare the opened timestamp and reject stale drafts", async () => {
  const { route, calls } = routeStub();
  const r = await route.PATCH(
    request("PATCH", {
      ...input,
      completed: true,
      description: "Notes",
      expected_updated_at: "2026-09-09T12:00:00Z",
    }),
    context,
  );
  assert.equal(r.status, 409);
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "eq" &&
        c[1] === "updated_at" &&
        c[2] === "2026-09-09T12:00:00Z",
    ),
  );
});
