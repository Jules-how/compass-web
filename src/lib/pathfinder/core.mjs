import { goalProgress } from "../planning-core.mjs";

/** An assessment never reads project/task completion or writes the chosen goal. */
export function assessOutcome(
  goal,
  observations,
  now = new Date().toISOString(),
) {
  const relevant = observations
    .filter(
      (o) =>
        o.goal_id === goal.id &&
        o.goal_revision === goal.revision &&
        o.observed_at <= now,
    )
    .sort(
      (a, b) =>
        b.period_end.localeCompare(a.period_end) ||
        b.observed_at.localeCompare(a.observed_at),
    );
  // An estimate does not replace an observed actual, even if it was added more recently.
  const observation = relevant.find((o) => o.provenance !== "estimate") ?? null;
  const estimate = relevant.find((o) => o.provenance === "estimate") ?? null;
  if (!observation)
    return {
      state: "unknown",
      label: "Outcome unknown",
      progress: null,
      observation: null,
      estimate,
      reason: "Record an observation against the current success definition.",
    };
  const days =
    (Date.parse(now) - Date.parse(`${observation.period_end}T23:59:59Z`)) /
    86400000;
  const stale = days > (goal.data.freshnessDays ?? 30);
  const qualitative = goal.data.measurementType === "qualitative";
  const satisfied = qualitative
    ? observation.accepted === true
    : observation.value != null &&
      goal.data.regular != null &&
      (goal.data.direction === "decrease"
        ? Number(observation.value) <= goal.data.regular
        : Number(observation.value) >= goal.data.regular);
  const verified = observation.provenance === "measured";
  const state = stale
    ? "stale"
    : !verified
      ? "reported"
      : satisfied
        ? "achieved"
        : "measured";
  return {
    state,
    label: {
      stale: "Evidence needs refresh",
      reported: "Reported · unverified",
      achieved: "Achieved · verified",
      measured: "Measured",
    }[state],
    progress: qualitative
      ? null
      : goalProgress({ ...goal.data, actual: Number(observation.value) }),
    observation,
    estimate,
    reason: stale
      ? "The observation is older than the goal’s freshness window."
      : !verified
        ? "A reported result requires source verification before achievement."
        : satisfied
          ? "The verified outcome meets the defined target."
          : "The latest verified result is below the achievement condition.",
  };
}

export function supportingTasks(
  goalId,
  links,
  projects,
  tasks,
  checkpoints = [],
) {
  const selected = links.filter(
    (l) => l.goal_id === goalId && l.state === "active",
  );
  const projectIds = new Set(
    selected.filter((l) => l.work_type === "project").map((l) => l.work_id),
  );
  const taskIds = new Set(
    selected.filter((l) => l.work_type === "task").map((l) => l.work_id),
  );
  // A checkpoint link does not imply the entire project is committed to this outcome.
  void projects;
  void checkpoints;
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks)
      if (
        (projectIds.has(t.project_id) || taskIds.has(t.parent_task_id)) &&
        !taskIds.has(t.id)
      ) {
        taskIds.add(t.id);
        changed = true;
      }
  }
  return tasks.filter((t) => taskIds.has(t.id));
}
export function executionSummary(tasks) {
  const unique = [...new Map(tasks.map((t) => [t.id, t])).values()];
  // Parents with children are containers; counting both inflates completion.
  const parents = new Set(unique.map((t) => t.parent_task_id).filter(Boolean));
  const leaves = unique.filter(
    (t) => !parents.has(t.id) && t.status !== "cancelled",
  );
  return {
    total: leaves.length,
    completed: leaves.filter((t) => t.status === "completed").length,
    blocked: leaves.filter((t) => t.status === "blocked").length,
  };
}
export function semanticLevel(zoom) {
  return zoom < 0.75 ? "strategy" : zoom < 1.25 ? "route" : "execution";
}

export function issueIdentity(goalId, key) {
  if (typeof key !== "string" || !/^[a-z0-9][a-z0-9:._-]{2,159}$/.test(key))
    throw new Error(
      "Use a stable issue key, independent of the review date or title.",
    );
  return `${goalId}:${key}`;
}

/** Graph nodes reference canonical records. The view has no task/project state of its own. */
export function graphForView(
  data,
  {
    level = "strategy",
    goalId = "",
    proposals = false,
    history = false,
    positions = {},
  } = {},
) {
  const nodes = new Map();
  const edges = [];
  const add = (id, type, record, label, x, y, subtitle = "") => {
    if (!nodes.has(id))
      nodes.set(id, {
        id,
        type: "pathfinder",
        position: positions[id] ?? { x, y },
        data: { kind: type, recordId: record.id, label, subtitle },
      });
  };
  const visibleGoals = data.goals.filter(
    (g) => !g.data.archived && (!goalId || g.id === goalId),
  );
  for (const [index, g] of visibleGoals.entries()) {
    const assessment = assessOutcome(g, data.observations, data.readAt);
    if (!history && assessment.state === "achieved" && !goalId) continue;
    add(g.id, "goal", g, g.data.title, 500, index * 440, g.data.status === "committed" ? assessment.label : `Proposed outcome · ${assessment.label}`);
  }
  const visibleIds = new Set(nodes.keys());
  const eligibleLinks = data.links.filter(
    (l) => visibleIds.has(l.goal_id) && (proposals || l.state === "active"),
  );
  const addEdge = (id, source, target, label, proposed = false) =>
    edges.push({
      id,
      source,
      target,
      label,
      type: "smoothstep",
      style: {
        stroke: proposed ? "#a8a29e" : "#b6aca1",
        strokeDasharray: proposed ? "6 5" : undefined,
      },
      data: { proposed },
    });
  for (const g of visibleGoals)
    if (nodes.has(g.id) && nodes.has(g.data.parentId))
      addEdge(`parent:${g.id}`, g.id, g.data.parentId, "Part of");
  if (level === "strategy") return { nodes: [...nodes.values()], edges };
  const supportedProjects = new Set();
  const explicitTasks = new Set();
  for (const [i, l] of eligibleLinks.entries()) {
    const records =
      l.work_type === "project"
        ? data.projects
        : l.work_type === "task"
          ? data.tasks
          : l.work_type === "checkpoint"
            ? data.checkpoints
            : data.goals;
    const record = records.find((r) => r.id === l.work_id);
    if (!record) continue;
    if (l.work_type === "task" && level !== "execution") continue;
    const g = nodes.get(l.goal_id);
    const id =
      l.work_type === "goal" ? record.id : `${l.work_type}:${record.id}`;
    add(
      id,
      l.work_type,
      record,
      record.name ?? record.title ?? record.data?.title,
      g.position.x - 320,
      g.position.y + (i % 5) * 160,
      l.state === "proposed"
        ? "Proposed"
        : l.work_type === "checkpoint"
          ? "Project checkpoint"
          : (record.status ?? ""),
    );
    addEdge(
      l.id,
      id,
      l.goal_id,
      `${l.state === "proposed" ? "Proposed · " : ""}${l.relation === "hypothesis" ? "Hypothesis" : "Contributes"}`,
      l.state === "proposed",
    );
    if (l.work_type === "project") supportedProjects.add(record.id);
    if (l.work_type === "task") explicitTasks.add(record.id);
  }
  for (const pId of supportedProjects) {
    const p = nodes.get(`project:${pId}`);
    const cps = data.checkpoints.filter((c) => c.project_id === pId);
    cps.forEach((c, i) => {
      add(
        `checkpoint:${c.id}`,
        "checkpoint",
        c,
        c.title,
        p.position.x,
        p.position.y + 160 * (i + 1),
        c.completed ? "Checkpoint complete" : "Project checkpoint",
      );
      addEdge(`cp:${c.id}`, `checkpoint:${c.id}`, p.id, "Part of");
    });
  }
  if (level === "execution") {
    const tasks = data.tasks.filter(
      (t) => supportedProjects.has(t.project_id) || explicitTasks.has(t.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      const ids = new Set(tasks.map((t) => t.id));
      for (const t of data.tasks)
        if (ids.has(t.parent_task_id) && !ids.has(t.id)) {
          tasks.push(t);
          changed = true;
        }
    }
    tasks.forEach((t, i) => {
      const p = nodes.get(`project:${t.project_id}`);
      add(
        `task:${t.id}`,
        "task",
        t,
        t.title,
        (p?.position.x ?? 180) - 320,
        (p?.position.y ?? 0) + i * 140,
        t.status,
      );
    });
    for (const t of tasks) {
      const parent = nodes.has(`task:${t.parent_task_id}`)
        ? `task:${t.parent_task_id}`
        : nodes.get(`project:${t.project_id}`)?.id;
      if (parent)
        addEdge(`task-parent:${t.id}`, `task:${t.id}`, parent, "Part of");
    }
    for (const [i, issue] of data.issues
      .filter(
        (f) =>
          visibleIds.has(f.goal_id) && ["open", "watching"].includes(f.status),
      )
      .entries()) {
      const g = nodes.get(issue.goal_id);
      add(
        `issue:${issue.id}`,
        "issue",
        issue,
        issue.title,
        g.position.x + 320,
        g.position.y + i * 160,
        "Decision / information gap",
      );
      addEdge(
        `issue-goal:${issue.id}`,
        `issue:${issue.id}`,
        issue.goal_id,
        "Informs",
      );
    }
  }
  for (const d of data.dependencies)
    if (
      nodes.has(`project:${d.project_id}`) &&
      nodes.has(`project:${d.depends_on_project_id}`)
    )
      addEdge(
        `requires:${d.project_id}:${d.depends_on_project_id}`,
        `project:${d.depends_on_project_id}`,
        `project:${d.project_id}`,
        "Required before",
      );
  return { nodes: [...nodes.values()], edges };
}

/** Approved relationships remain operator-owned, including decommitment. */
export function canWritePathfinderLink(actor, existing, proposed) {
  return actor === "operator" || (proposed.state === "proposed" && existing?.state !== "active");
}
