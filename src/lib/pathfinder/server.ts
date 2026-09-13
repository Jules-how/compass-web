import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { listPlanning } from "@/lib/planning-server";
import { portalJson, portalAccessResponse } from "@/lib/portal-http";
import { z } from "zod";
import { commandSchema } from "./contracts";
import {
  canWritePathfinderLink,
  assessOutcome,
  supportingTasks,
  executionSummary,
} from "./core.mjs";
import type { CompassTask } from "@/lib/types";
import type { Actor, PathfinderData, PathfinderIssue } from "./types";

export class PathfinderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function pathfinderError(error: unknown) {
  const access = portalAccessResponse(error);
  if (access) return access;
  if (error instanceof PathfinderError)
    return portalJson({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return portalJson(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  console.error(
    "[pathfinder]",
    error instanceof Error ? error.name : "Unavailable",
  );
  return portalJson(
    {
      error:
        "Pathfinder could not load its records. Check the migration and connection; no missing values have been treated as zero.",
    },
    { status: 503 },
  );
}
async function allRows(
  db: SupabaseClient,
  table: string,
  columns = "*",
  order = ["id"],
) {
  const result: Record<string, any>[] = [];
  for (let page = 0; page < 100; page++) {
    let query = db.from(table).select(columns);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(page * 500, page * 500 + 499);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
  throw new PathfinderError(
    503,
    "The workspace is too large for a complete snapshot. Narrow the read before making decisions.",
  );
}
export async function loadPathfinder(
  db: SupabaseClient = getPortalAdminClient(),
): Promise<PathfinderData> {
  const goals = [];
  for (let page = 0; page < 100; page++) {
    const batch = await listPlanning("goal", page);
    goals.push(...batch.records);
    if (goals.length >= batch.total) break;
    if (page === 99) throw new Error("Incomplete goals");
  }
  const [
    links,
    observations,
    issues,
    projects,
    tasks,
    checkpoints,
    dependencies,
    businessFunctions,
    activityResult,
  ] = await Promise.all([
    allRows(db, "compass_pathfinder_links"),
    allRows(db, "compass_pathfinder_observations"),
    allRows(db, "compass_pathfinder_issues"),
    allRows(db, "compass_projects"),
    allRows(db, "compass_tasks"),
    allRows(db, "compass_project_milestones"),
    allRows(db, "compass_project_dependencies", "*", [
      "project_id",
      "depends_on_project_id",
    ]),
    allRows(db, "compass_business_functions"),
    db
      .from("compass_pathfinder_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (activityResult.error) throw activityResult.error;
  // Explicit demo records must never become actual business state.
  const real = (r: Record<string, any>) =>
    !r.id.startsWith("demo-") &&
    !r.id.startsWith("cs-demo-") &&
    r.source !== "demo";
  return {
    readAt: new Date().toISOString(),
    goals,
    links,
    observations: observations.map((o) => ({
      ...o,
      value: o.value == null ? null : Number(o.value),
    })),
    issues,
    activity: activityResult.data ?? [],
    projects: projects.filter(real),
    tasks: tasks.filter(real),
    checkpoints,
    dependencies,
    businessFunctions,
  } as PathfinderData;
}
export function agentPathfinderContext(
  data: PathfinderData,
  goalId?: string | null,
) {
  const goals = data.goals.filter(
    (g) => !g.data.archived && (!goalId || g.id === goalId),
  );
  return {
    readAt: data.readAt,
    source: "live",
    scope: goalId ?? "all goals",
    capacity: {
      availableMinutes: null,
      status: "unknown",
      nextAction:
        "Read current calendar commitments and confirm available capacity; task counts are not capacity.",
    },
    goals: goals.map((g) => {
      const tasks = supportingTasks(
        g.id,
        data.links,
        data.projects,
        data.tasks,
        data.checkpoints,
      );
      const projectIds = new Set([
        ...data.links
          .filter((l) => l.goal_id === g.id && l.work_type === "project")
          .map((l) => l.work_id),
        ...tasks.map((t: CompassTask) => t.project_id),
      ]);
      return {
        id: g.id,
        revision: g.revision,
        definition: g.data,
        assessment: assessOutcome(g, data.observations, data.readAt),
        execution: executionSummary(tasks),
        links: data.links.filter((l) => l.goal_id === g.id),
        work: tasks.map((t: CompassTask) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          project_id: t.project_id,
          parent_task_id: t.parent_task_id,
          due: t.due,
          execution_contract: t.execution_contract,
        })),
        projects: data.projects.filter((p) => projectIds.has(p.id)),
        checkpoints: data.checkpoints.filter((c) =>
          projectIds.has(c.project_id),
        ),
        dependencies: data.dependencies.filter((d) =>
          projectIds.has(d.project_id),
        ),
        observations: data.observations.filter((o) => o.goal_id === g.id),
        issues: data.issues.filter((i) => i.goal_id === g.id),
        recentChanges: data.activity
          .filter((a) => a.goal_id === g.id)
          .slice(0, 8),
      };
    }),
    policy: {
      approvedGoalEdits: "operator only",
      measuredObservations:
        "operator verifies source; agent writes reported/estimate",
      newWork: "reuse canonical tasks; create_task requires operator decision",
      scenarioExploration: "never creates tasks or changes targets",
      reviewIdentity: "stable goal_id + issue_key; no date in key",
      forecast: "unavailable until a supported model exists",
    },
  };
}
export async function executePathfinder(
  raw: unknown,
  actor: Actor,
  operatorDb?: SupabaseClient,
) {
  const input = commandSchema.parse(raw);
  const db = getPortalAdminClient();
  if (input.action === "create_task") {
    if (actor !== "operator" || !operatorDb)
      throw new PathfinderError(
        403,
        "Task creation requires an operator decision.",
      );
    const { data, error } = await operatorDb.rpc(
      "pathfinder_create_issue_task",
      {
        p_issue_id: input.issue_id,
        p_existing_task_id: input.existing_task_id ?? null,
      },
    );
    if (error)
      throw new PathfinderError(
        409,
        "The task could not be created. Reload the issue before retrying.",
      );
    return data;
  }
  const snapshot = await loadPathfinder(db);
  const goal = snapshot.goals.find(
    (g) => g.id === input.goal_id && !g.data.archived,
  );
  if (!goal) throw new PathfinderError(404, "Choose an existing active goal.");
  const stamp = new Date().toISOString();
  if (input.action === "link") {
    const target =
      input.work_type === "project"
        ? snapshot.projects
        : input.work_type === "task"
          ? snapshot.tasks
          : input.work_type === "checkpoint"
            ? snapshot.checkpoints
            : snapshot.goals.filter((g) => !g.data.archived);
    if (
      !target.some((r) => r.id === input.work_id) ||
      input.work_id === goal.id
    )
      throw new PathfinderError(
        400,
        "Choose existing supporting work, distinct from the goal.",
      );
    const existing = snapshot.links.find(
      (l) =>
        l.goal_id === goal.id &&
        l.work_type === input.work_type &&
        l.work_id === input.work_id &&
        l.relation === input.relation,
    );
    if (!canWritePathfinderLink(actor, existing, input))
      throw new PathfinderError(
        403,
        "Only the operator can commit or change an approved route link.",
      );
    const payload = {
      goal_id: input.goal_id,
      work_type: input.work_type,
      work_id: input.work_id,
      relation: input.relation,
      state: input.state,
      rationale: input.rationale,
      actor,
      updated_at: stamp,
    };
    if (
      existing &&
      existing.state === input.state &&
      existing.rationale === input.rationale
    )
      return existing;
    if (existing && existing.updated_at !== input.updated_at)
      throw new PathfinderError(
        409,
        "This link changed. Reload before editing.",
      );
    const query = existing
      ? db
          .from("compass_pathfinder_links")
          .update(payload)
          .eq("id", existing.id)
          .eq("updated_at", existing.updated_at)
      : db.from("compass_pathfinder_links").insert(payload);
    const { data, error } = await query.select().single();
    if (error)
      throw new PathfinderError(
        409,
        "The link changed or already exists. Reload before retrying.",
      );
    return data;
  }
  if (input.evidence_ids.length) {
    const { data, error } = await db
      .from("compass_evidence_events")
      .select("id")
      .in("id", input.evidence_ids);
    if (
      error ||
      new Set(data?.map((r) => r.id)).size !== new Set(input.evidence_ids).size
    )
      throw new PathfinderError(
        400,
        "One or more evidence references do not exist.",
      );
  }
  if (input.action === "observe") {
    input.observed_at = new Date(input.observed_at).toISOString();
    if (input.provenance === "measured" && !input.detail)
      throw new PathfinderError(
        400,
        "Explain the verified evidence and any limitations.",
      );
    if (
      input.provenance === "measured" &&
      !(goal.data.criteria || goal.data.metricDefinition)
    )
      throw new PathfinderError(
        400,
        "Define the metric or acceptance condition before verifying achievement.",
      );
    if (input.goal_revision !== goal.revision)
      throw new PathfinderError(
        409,
        "The success definition changed. Reload it before recording evidence.",
      );
    if (actor === "agent" && input.provenance === "measured")
      throw new PathfinderError(
        403,
        "Submit an agent observation as reported or estimate; Jules verifies the source.",
      );
    const reportingDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(stamp));
    if (input.observed_at > stamp || input.period_end > reportingDay)
      throw new PathfinderError(
        400,
        "Observations cannot claim future results.",
      );
    if (
      input.metric_id === "primary" &&
      (goal.data.measurementType === "qualitative") !==
        (input.accepted !== null)
    )
      throw new PathfinderError(
        400,
        "The observation must match this goal’s measurement type.",
      );
    if (
      input.receipt &&
      (input.receipt.received_on > reportingDay ||
        input.receipt.received_on < input.period_start ||
        input.receipt.received_on > input.period_end)
    )
      throw new PathfinderError(
        400,
        "Receipt date must fall inside its reporting period and cannot be in the future.",
      );
    const { action, ...values } = input;
    void action;
    const previous = snapshot.observations.find(
      (o) => o.idempotency_key === input.idempotency_key,
    );
    if (previous) {
      if (
        Object.entries(values).every(([k, v]) =>
          k === "observed_at"
            ? Date.parse(previous.observed_at) === Date.parse(String(v))
            : JSON.stringify((previous as any)[k]) === JSON.stringify(v),
        )
      )
        return previous;
      throw new PathfinderError(
        409,
        "This observation key is already used for different evidence.",
      );
    }
    const { data, error } = await db
      .from("compass_pathfinder_observations")
      .insert({ ...values, actor })
      .select()
      .single();
    if (error)
      throw new PathfinderError(
        409,
        "This observation may already exist. Reload before retrying.",
      );
    return data;
  }
  const existing = snapshot.issues.find(
    (i) => i.goal_id === input.goal_id && i.issue_key === input.issue_key,
  );
  if (
    actor === "agent" &&
    existing &&
    ["dismissed", "resolved"].includes(existing.status) &&
    input.status !== existing.status
  )
    throw new PathfinderError(
      403,
      "Do not reopen a closed issue automatically. Record materially new evidence for operator review.",
    );
  const { action, revision, ...values } = input;
  void action;
  if (
    existing &&
    Object.entries(values).every(
      ([k, v]) => JSON.stringify((existing as any)[k]) === JSON.stringify(v),
    )
  )
    return existing;
  if ((existing?.revision ?? 0) !== revision)
    throw new PathfinderError(
      409,
      "This finding changed. Read the current issue before updating it.",
    );
  const query = existing
    ? db
        .from("compass_pathfinder_issues")
        .update({ ...values, actor, revision: revision + 1, updated_at: stamp })
        .eq("id", existing.id)
        .eq("revision", revision)
    : db.from("compass_pathfinder_issues").insert({ ...values, actor });
  const { data, error } = await query.select().single();
  if (error)
    throw new PathfinderError(
      409,
      "The finding changed or already exists. Read the current issue before retrying.",
    );
  return data as PathfinderIssue;
}
