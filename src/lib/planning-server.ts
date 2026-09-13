import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { sealCommercial, openCommercial } from "@/lib/agreement-server";
import {
  compareAndSwapPlanning,
  currentPlanningRecord,
} from "@/lib/planning-persist.mjs";
import {
  PLANNING_KINDS,
  validatePlanning,
  checkGoalParent,
  assertPlanningAuthority,
  planningHistory,
} from "@/lib/planning-core.mjs";
export type PlanningRow = {
  id: string;
  kind: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  authorship?: Record<string, unknown>;
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
export async function getPlanning(kind: string, id: string) {
  if (
    !PLANNING_KINDS.includes(kind) ||
    !new RegExp(`^planning\\.${kind}\\.[a-f0-9-]{36}$`).test(id)
  )
    throw new Error("Invalid record ID.");
  const { data, error } = await getPortalAdminClient()
    .from("compass_settings")
    .select("value")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load planning record.");
  return data ? openCommercial<PlanningRow>(String(data.value)) : null;
}
export async function savePlanning(
  body: {
    kind: string;
    id?: string;
    revision?: number;
    request_id?: string;
    data: unknown;
  },
  actor: "operator" | "agent" | "delegated_user" = "operator",
  operationFingerprint?: unknown,
  authorship?: Record<string, unknown>,
) {
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
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        actor,
        kind: body.kind,
        id,
        revision: body.revision ?? 0,
        data: operationFingerprint ?? data,
      }),
    )
    .digest("hex");
  if (body.request_id) {
    if (!/^[a-zA-Z0-9:._-]{8,200}$/.test(body.request_id))
      throw new Error("Invalid request ID.");
    if (!body.id)
      throw new Error("Retryable writes require a stable record ID.");
    const { data: receipt, error } = await db
      .from("compass_planning_receipts")
      .select("digest,record_id,value")
      .eq("request_id", body.request_id)
      .maybeSingle();
    if (error)
      throw new Error(
        "Notebook save service is unavailable. Your draft has not been discarded.",
      );
    if (receipt) {
      if (receipt.digest !== hash || receipt.record_id !== id)
        throw new Error("Request ID reused for a different change.");
      return openCommercial<PlanningRow>(receipt.value);
    }
  }
  if (existing?.data.document && !data.document)
    throw new Error(
      "This note has rich formatting. Use the notebook document API; a plain-text overwrite would lose content.",
    );
  assertPlanningAuthority(body.kind, existing, data, actor);
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
    const proposed = [...goals.filter((g) => g.id !== id), { id, data }];
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
    history: planningHistory(existing, body.kind, at),
    ...(authorship ? { authorship } : {}),
  };
  if (body.kind === "note" && body.request_id && row.history.length > 200)
    row.history = row.history.slice(-200); // Earlier encrypted snapshots remain in durable operation receipts.
  if (row.history.length > 200)
    throw new Error(
      "This record has 200 revisions. Start a linked successor record to preserve its history.",
    );
  const value = sealCommercial(row);
  if (body.request_id) {
    const { data: saved, error } = await db.rpc(
      "compass_save_planning_operation",
      {
        p_id: id,
        p_expected_value: old?.value ?? null,
        p_value: value,
        p_at: at,
        p_request_id: body.request_id,
        p_digest: hash,
        p_receipt_value: sealCommercial({
          ...currentPlanningRecord(row),
          ...(!existing?.data.document && existing?.history?.length
            ? { legacyHistory: existing.history }
            : {}),
        }),
      },
    );
    if (error)
      throw new Error(
        error.message === "revision_conflict"
          ? "This record changed. Compare the saved version before replacing it."
          : error.message,
      );
    return openCommercial<PlanningRow>(saved);
  }
  if (old) {
    await compareAndSwapPlanning(db, id, old.value, value, at);
  } else {
    const { error } = await db.from("compass_settings").insert({
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
