import { supportingTasks, assessOutcome } from "./core.mjs";

/** Follow approved goal relationships, then canonical project/task membership.
 * @param {import('./types').PathfinderData} data
 * @param {string} goalId
 */
export function goalWorkspace(data, goalId) {
  const goals = new Set(
    goalId
      ? [goalId]
      : data.goals.filter((g) => !g.data.archived).map((g) => g.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const goal of data.goals)
      if (
        !goal.data.archived &&
        goals.has(goal.data.parentId) &&
        !goals.has(goal.id)
      ) {
        goals.add(goal.id);
        changed = true;
      }
    for (const link of data.links)
      if (
        link.state === "active" &&
        link.work_type === "goal" &&
        goals.has(link.goal_id) &&
        !goals.has(link.work_id) &&
        data.goals.some((g) => g.id === link.work_id && !g.data.archived)
      ) {
        goals.add(link.work_id);
        changed = true;
      }
  }
  const links = data.links.filter(
    (l) => goals.has(l.goal_id) && l.state === "active",
  );
  const projectIds = new Set(
    links.filter((l) => l.work_type === "project").map((l) => l.work_id),
  );
  const checkpointIds = new Set(
    links.filter((l) => l.work_type === "checkpoint").map((l) => l.work_id),
  );
  /** @type {import('../types').CompassTask[]} */
  const tasks = [
    ...new Map(
      [...goals]
        .flatMap((id) =>
          supportingTasks(
            id,
            data.links,
            data.projects,
            data.tasks,
            data.checkpoints,
          ),
        )
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const projects = data.projects.filter((p) => projectIds.has(p.id));
  const checkpoints = data.checkpoints.filter(
    (c) => projectIds.has(c.project_id) || checkpointIds.has(c.id),
  );
  const taskIds = new Set(tasks.map((t) => t.id));
  const parents = new Set(tasks.map((t) => t.parent_task_id).filter(Boolean));
  const open = tasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status) && !parents.has(t.id),
  );
  /** @param {import('../types').CompassTask} task */
  const prerequisites = (task) =>
    data.dependencies
      .filter((d) => d.project_id === task.project_id)
      .flatMap((d) => {
        const p = data.projects.find((p) => p.id === d.depends_on_project_id);
        // Legacy archived projects mean completed; cancellation does not fulfil a dependency.
        return p && !["completed", "archived"].includes(p.status) ? [p] : [];
      });
  const actions = open
    .map((task) => ({
      ...task,
      prerequisites: prerequisites(task),
      waiting: task.status === "blocked" || prerequisites(task).length > 0,
    }))
    .sort(
      (a, b) =>
        Number(a.waiting) - Number(b.waiting) ||
        (a.due || "9999").localeCompare(b.due || "9999") ||
        // Compass uses 1 = urgent through 4 = low, with 0 meaning no priority.
        (a.priority || 99) - (b.priority || 99) ||
        a.title.localeCompare(b.title),
    );
  return {
    goals: data.goals.filter((g) => goals.has(g.id) && !g.data.archived),
    projects,
    tasks,
    checkpoints,
    actions,
    issues: data.issues.filter(
      (i) =>
        goals.has(i.goal_id) &&
        ["open", "watching"].includes(i.status) &&
        (!i.task_id || !taskIds.has(i.task_id)),
    ),
  };
}

/** @param {ReturnType<typeof goalWorkspace>} workspace */
export function timelineEntries(workspace) {
  const items = [
    ...workspace.goals.map((g) => ({
      id: g.id,
      kind: "goal",
      title: g.data.title,
      date: g.data.due || null,
      start: g.data.start || null,
      complete: false,
    })),
    ...workspace.projects.map((p) => ({
      id: p.id,
      kind: "project",
      title: p.name,
      date: p.target_date,
      start: p.start_date,
      complete: ["completed", "archived"].includes(p.status),
    })),
    ...workspace.checkpoints.map((c) => ({
      id: c.id,
      kind: "checkpoint",
      title: c.title,
      date: c.target_date,
      start: null,
      complete: c.completed,
    })),
    ...workspace.tasks
      .filter((t) => t.status !== "cancelled")
      .map((t) => ({
        id: t.id,
        kind: "task",
        title: t.title,
        date: t.due,
        start: null,
        complete: t.status === "completed",
      })),
  ];
  return items.sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.title.localeCompare(b.title),
  );
}

/** A chronological journey, with linked work below it. Sequence means date order, not causality. */
export function journeyForView(
  data,
  {
    level = "route",
    goalId = "",
    proposals = false,
    history = true,
    positions = {},
  } = {},
) {
  const workspace = goalWorkspace(data, goalId);
  const goals = workspace.goals.filter(
    (g) =>
      history ||
      assessOutcome(g, data.observations, data.readAt).state !== "achieved",
  );
  const visibleGoals = new Set(goals.map((g) => g.id));
  const activeLinks = data.links.filter(
    (l) => visibleGoals.has(l.goal_id) && (proposals || l.state === "active"),
  );
  const checkpoints = [...workspace.checkpoints];
  if (proposals)
    for (const link of activeLinks) {
      if (link.work_type === "checkpoint") {
        const cp = data.checkpoints.find((c) => c.id === link.work_id);
        if (cp && !checkpoints.some((c) => c.id === cp.id))
          checkpoints.push(cp);
      }
      if (link.work_type === "project")
        for (const cp of data.checkpoints.filter(
          (c) => c.project_id === link.work_id,
        ))
          if (!checkpoints.some((c) => c.id === cp.id)) checkpoints.push(cp);
    }
  const ownerOf = (kind, id) =>
    activeLinks.find((l) => l.work_type === kind && l.work_id === id)
      ?.goal_id ||
    goalId ||
    goals[0]?.id ||
    "";
  const stages = [
    ...goals.map((g) => ({
      id: g.id,
      kind: "goal",
      recordId: g.id,
      title: g.data.title,
      date: g.data.due,
      goalId: g.id,
      notes: g.data.notes,
      subtitle: assessOutcome(g, data.observations, data.readAt).label,
    })),
    ...checkpoints.map((c) => ({
      id: `checkpoint:${c.id}`,
      kind: "checkpoint",
      recordId: c.id,
      title: c.title,
      date: c.target_date,
      goalId:
        activeLinks.find(
          (l) => l.work_type === "checkpoint" && l.work_id === c.id,
        )?.goal_id || ownerOf("project", c.project_id),
      notes: c.description,
      projectId: c.project_id,
      subtitle: c.completed ? "Milestone complete" : "Milestone",
    })),
  ].sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      a.title.localeCompare(b.title),
  );
  const nodes = [],
    edges = [],
    ids = new Set();
  const add = (
    id,
    kind,
    recordId,
    title,
    x,
    y,
    subtitle,
    goal,
    notes = "",
    date = null,
    projectId = undefined,
  ) => {
    if (ids.has(id)) return;
    ids.add(id);
    nodes.push({
      id,
      type: "pathfinder",
      position: positions[id] ?? { x, y },
      data: {
        kind,
        recordId,
        label: title,
        subtitle,
        goalId: goal,
        notes,
        date,
        detail: level,
        projectId,
      },
    });
  };
  const connect = (
    id,
    source,
    target,
    route = false,
    proposed = false,
    label = "",
  ) =>
    edges.push({
      id,
      source,
      target,
      sourceHandle: route ? "route-out" : "work-out",
      targetHandle: route ? "route-in" : "work-in",
      type: "smoothstep",
      label,
      markerEnd: {
        type: "arrowclosed",
        color: "#9c88af",
        width: 16,
        height: 16,
      },
      style: {
        stroke: route ? "#9c88af" : "#c9bfd3",
        strokeWidth: route ? 2 : 1.2,
        strokeDasharray: proposed ? "5 5" : undefined,
      },
      data: { proposed },
    });
  stages.forEach((stage, i) => {
    add(
      stage.id,
      stage.kind,
      stage.recordId,
      stage.title,
      i * 330,
      35,
      stage.subtitle,
      stage.goalId,
      stage.notes,
      stage.date,
      stage.projectId,
    );
    if (i && stage.date && stages[i - 1].date)
      connect(`journey:${stage.id}`, stages[i - 1].id, stage.id, true);
  });
  if (level === "strategy") return { nodes, edges };
  const placed = new Set();
  const nextY = new Map();
  goals.forEach((goal) => {
    const stageIndex = stages.findIndex((stage) => stage.id === goal.id);
    const goalX = stageIndex * 330;
    const links = activeLinks.filter((l) => l.goal_id === goal.id);
    for (const link of links) {
      if (!["task", "project"].includes(link.work_type)) continue;
      const record = (
        link.work_type === "project" ? data.projects : data.tasks
      ).find((r) => r.id === link.work_id);
      if (!record) continue;
      const id = `${link.work_type}:${record.id}`;
      const checkpoint =
        link.work_type === "project"
          ? stages.find(
              (stage) =>
                stage.kind === "checkpoint" &&
                checkpoints.some(
                  (c) => c.id === stage.recordId && c.project_id === record.id,
                ),
            )
          : null;
      const anchor = checkpoint?.id || goal.id;
      const x = checkpoint ? stages.indexOf(checkpoint) * 330 : goalX;
      let y = nextY.get(anchor) ?? 290;
      const sprint =
        link.work_type === "project" && record.labels?.includes("sprint");
      if (!placed.has(id)) {
        add(
          id,
          link.work_type,
          record.id,
          record.name || record.title,
          x,
          y,
          `${sprint ? "Sprint · " : ""}${link.state === "proposed" ? "Proposed" : record.status}`,
          goal.id,
          record.summary || record.notes,
          record.target_date || record.due,
        );
        placed.add(id);
        y += 220;
      }
      connect(
        `work:${link.id}`,
        anchor,
        id,
        false,
        link.state === "proposed",
        link.state === "proposed" ? "Proposed" : "",
      );
      if (level === "execution") {
        const children =
          link.work_type === "project"
            ? data.tasks.filter(
                (t) => t.project_id === record.id && !t.parent_task_id,
              )
            : data.tasks.filter((t) => t.parent_task_id === record.id);
        const addChildren = (tasks, parent) => {
          for (const task of tasks) {
            const taskId = `task:${task.id}`;
            if (task.status === "cancelled" || placed.has(taskId)) continue;
            add(
              taskId,
              "task",
              task.id,
              task.title,
              x + 22,
              y,
              task.status,
              goal.id,
              task.notes,
              task.due,
            );
            placed.add(taskId);
            y += 210;
            connect(`child:${parent}:${task.id}`, parent, taskId);
            addChildren(
              data.tasks.filter((t) => t.parent_task_id === task.id),
              taskId,
            );
          }
        };
        addChildren(children, id);
      }
      nextY.set(anchor, y);
    }
  });
  return { nodes, edges };
}
