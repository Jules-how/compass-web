import "server-only";
import { randomUUID } from "node:crypto";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { sealCommercial, openCommercial } from "@/lib/agreement-server";
import {
  PLANNING_KINDS,
  validatePlanning,
  checkGoalParent,
  assertPlanningAuthority,
} from "@/lib/planning-core.mjs";
export type PlanningRow = {
  id: string;
  kind: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  history: Array<{ revision: number; at: string; data: Record<string, any> }>;
};
export async function listPlanning(kind: string, page = 0) {
  if (!PLANNING_KINDS.includes(kind)) throw new Error("Invalid record kind.");
  const { data, error, count } = await getPortalAdminClient()
    .from("compass_settings")
    .select("value", { count: "exact" })
    .like("id", `planning.${kind}.%`)
    .order("updated_at", { ascending: false })
    .range(page * 100, page * 100 + 99);
  if (error) throw new Error("Unable to load planning records.");
  return {
    records: (data || []).map((r) =>
      openCommercial<PlanningRow>(String(r.value)),
    ),
    total: count || 0,
    page,
  };
}
export async function savePlanning(body: {
  kind: string;
  id?: string;
  revision?: number;
  data: unknown;
}, actor: "operator" | "agent" = "operator") {
  const data: Record<string, any> = validatePlanning(body.kind, body.data);
  const id = body.id || `planning.${body.kind}.${randomUUID()}`;
  if (!new RegExp(`^planning\\.${body.kind}\\.[a-f0-9-]{36}$`).test(id))
    throw new Error("Invalid record ID.");
  const db = getPortalAdminClient();
  const { data: old, error: readError } = await db
    .from("compass_settings")
    .select("value")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error("Unable to read the current record.");
  const existing = old ? openCommercial<PlanningRow>(String(old.value)) : null;
  assertPlanningAuthority(body.kind, existing, data, actor);
  if (existing && JSON.stringify(existing.data) === JSON.stringify(data))
    return existing;
  if (existing && existing.revision !== body.revision)
    throw new Error("This record changed. Reload before editing it.");
  if (!existing && body.revision)
    throw new Error("The original record no longer exists.");
  if (body.kind === "goal") {
    const goals: PlanningRow[] = [];
    let page = 0;
    for (;;) {
      const batch = await listPlanning("goal", page++);
      goals.push(...batch.records);
      if (goals.length >= batch.total) break;
      if (page > 50)
        throw new Error("Goal hierarchy is too large to validate.");
    }
    const proposed = [...goals.filter(g => g.id !== id), {id, data}];
    checkGoalParent(data, id, proposed);
    for (const child of goals.filter(
      (g) => !g.data.archived && g.data.parentId === id,
    ))
      checkGoalParent(child.data, child.id, proposed);
    if (
      data.archived &&
      goals.some((g) => !g.data.archived && g.data.parentId === id)
    )
      throw new Error("Move or archive child goals first.");
  }
  if ((body.kind === "note" || body.kind === "time") && data.goalId) {
    const { data: goal, error } = await db
      .from("compass_settings")
      .select("value")
      .eq("id", data.goalId)
      .maybeSingle();
    if (
      error ||
      !goal ||
      openCommercial<PlanningRow>(String(goal.value)).kind !== "goal" ||
      openCommercial<PlanningRow>(String(goal.value)).data.archived
    )
      throw new Error("Choose an existing active goal.");
  }
  const at = new Date().toISOString();
  const row: PlanningRow = {
    id,
    kind: body.kind,
    revision: (existing?.revision || 0) + 1,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
    data,
    history: existing
      ? [
          ...existing.history,
          {
            revision: existing.revision,
            at: existing.updatedAt,
            data: existing.data,
          },
        ]
      : [],
  };
  if (row.history.length > 200)
    throw new Error(
      "This record has 200 revisions. Start a linked successor record to preserve its history.",
    );
  const value = sealCommercial(row);
  if (old) {
    const { data: changed, error } = await db
      .from("compass_settings")
      .update({ value, updated_at: at, mirrored_at: at })
      .eq("id", id)
      .eq("value", old.value)
      .select("id");
    if (error || !changed?.length)
      throw new Error("This record changed. Reload before editing it.");
  } else {
    const { error } = await db
      .from("compass_settings")
      .insert({
        id,
        value,
        scope: "planning",
        is_secret: 1,
        updated_at: at,
        mirrored_at: at,
      });
    if (error)
      throw new Error(
        "Unable to create record; reload to check whether it already exists.",
      );
  }
  return row;
}
