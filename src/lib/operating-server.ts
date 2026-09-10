import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { listPlanning } from "@/lib/planning-server";
import {
  resolveInstantlyApiKey,
  instantlyFetch,
  fetchInstantlyCampaignAnalytics,
} from "@/lib/instantly";
import {
  campaignState,
  calendarCommitments,
  dateOnly,
  operatingCommand,
  operatingQueue,
  sydneyDay,
  type OperatingRecord,
  type WorkTask,
} from "@/lib/operating-core";

async function rows(query: PromiseLike<{ data: any; error: any }>) {
  const r = await query;
  if (r.error) throw new Error(r.error.message);
  return r.data || [];
}
async function save(
  db: SupabaseClient,
  p: Record<string, unknown>,
  actor = "agent",
) {
  const { data, error } = await db.rpc("compass_operating_save", {
    p,
    p_actor: actor,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function operatingRecord(db: SupabaseClient, id: string) {
  return (
    await rows(db.from("compass_operating_records").select("*").eq("id", id))
  )[0] as OperatingRecord | undefined;
}
export async function saveOperatingRecord(
  db: SupabaseClient,
  id: string,
  kind: string,
  data: Record<string, unknown>,
) {
  const old = await operatingRecord(db, id);
  return save(db, {
    action: "record",
    request_id: randomUUID(),
    id,
    kind,
    revision: old?.revision || 0,
    data,
  });
}

/** Read-only provider reconciliation, separate from campaign intent and preparation. */
let providerRefresh: Promise<{
  ok: boolean;
  checked_at: string;
  failures: string[];
}> | null = null;
export function refreshOperatingCampaigns(db: SupabaseClient) {
  if (providerRefresh) return providerRefresh;
  providerRefresh = reconcileOperatingCampaigns(db).finally(() => {
    providerRefresh = null;
  });
  return providerRefresh;
}
async function reconcileOperatingCampaigns(db: SupabaseClient) {
  const previous = await operatingRecord(db, "source:instantly");
  const checked_at = new Date().toISOString();
  try {
    const key = await resolveInstantlyApiKey(db);
    if (!key) throw new Error("Instantly connection is missing");
    const bound = await rows(
      db
        .from("compass_pipeline_campaigns")
        .select("id,name,instantly_campaign_id,offer_key,status")
        .not("instantly_campaign_id", "is", null)
        .not("status", "in", "(cancelled,archived)")
        .limit(101),
    );
    if (bound.length > 100) throw new Error("More than 100 bound campaigns; provider coverage is incomplete");
    const analytics = await fetchInstantlyCampaignAnalytics(key);
    const failures: string[] = [];
    // Bounded concurrency. GET details also covers empty campaigns absent from analytics.
    for (let offset = 0; offset < bound.length; offset += 4) {
      await Promise.all(
        bound.slice(offset, offset + 4).map(async (c: any) => {
          try {
            const detail = await instantlyFetch<Record<string, any>>(
              `/campaigns/${encodeURIComponent(c.instantly_campaign_id)}`,
              key,
              { signal: AbortSignal.timeout(15000) },
            );
            await saveOperatingRecord(db, `campaign:${c.id}`, "campaign", {
              campaign_id: c.id,
              provider_id: c.instantly_campaign_id,
              name: detail.name || c.name,
              ...campaignState(
                detail,
                analytics.find(
                  (a) => a.campaign_id === c.instantly_campaign_id,
                ),
                checked_at,
              ),
            });
          } catch {
            failures.push(c.name);
          }
        }),
      );
    }
    await saveOperatingRecord(db, "source:instantly", "source", {
      name: "Instantly",
      status: failures.length ? "partial" : "current",
      checked_at,
      last_success_at: failures.length
        ? previous?.data.last_success_at || null
        : checked_at,
      error: failures.length ? `Unable to refresh: ${failures.join(", ")}` : "",
      coverage:
        "Bound campaigns: provider settings and aggregate analytics. Exact future send times are not available.",
    });
    return { ok: !failures.length, checked_at, failures };
  } catch (error) {
    await saveOperatingRecord(db, "source:instantly", "source", {
      ...previous?.data,
      name: "Instantly",
      status: "error",
      checked_at,
      error:
        error instanceof Error ? error.message.slice(0, 200) : "Refresh failed",
    });
    return {
      ok: false,
      checked_at,
      failures: ["Instantly unavailable; previous records retained"],
    };
  }
}

export async function loadOperatingDay(day = sydneyDay()) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw new Error("Use a valid day");
  const db = getPortalAdminClient();
  const [tasks, projects, records, goals, nativeRuns, campaigns] =
    await Promise.all([
      rows(db.from("compass_tasks").select("*").order("id").limit(2001)),
      rows(db.from("compass_projects").select("*").order("id").limit(501)),
      rows(
        db
          .from("compass_operating_records")
          .select("*")
          .neq("kind", "receipt")
          .or(`kind.neq.day,id.eq.day:${day}`)
          .order("updated_at", { ascending: false })
          .limit(1001),
      ),
      listPlanning("goal"),
      rows(
        db
          .from("compass_outbound_runs")
          .select("id,campaign_id,status,error,created_at")
          .order("created_at", { ascending: false })
          .limit(50),
      ),
      rows(
        db
          .from("compass_pipeline_campaigns")
          .select(
            "id,name,status,offer_key,instantly_campaign_id,location_tags",
          )
          .eq("offer_key", "installation-booking")
          .not("status", "in", "(archived,cancelled)")
          .limit(100),
      ),
    ]);
  if (
    tasks.length > 2000 ||
    projects.length > 500 ||
    records.length > 1000 ||
    goals.total > 100
  )
    throw new Error(
      "Operating view exceeds its completeness limit; narrow or archive inactive records before planning",
    );
  const current = records.find(
    (r: OperatingRecord) => r.id === `day:${day}`,
  ) as OperatingRecord | undefined;
  const result = operatingQueue(
    tasks,
    day,
    current?.data.status === "accepted" ? current.data.task_ids : [],
  );
  const sources: OperatingRecord[] = records.filter(
    (r: OperatingRecord) => r.kind === "source",
  );
  for (const [id, name, coverage] of [
    ["instantly", "Instantly", "Campaign state has not been checked"],
    [
      "calendar",
      "Calendar",
      "Available hours and calendar coverage are not yet verified",
    ],
    [
      "agents",
      "Agent work",
      "Only work submitted through the writeback contract is captured",
    ],
    [
      "documents",
      "Documents and selected conversations",
      "No automatic document review has reported a consumed revision",
    ],
    [
      "activity",
      "Computer activity",
      "Local observations have not yet been consumed",
    ],
  ])
    if (!sources.some((s) => s.id === `source:${id}`))
      sources.push({
        id: `source:${id}`,
        kind: "source",
        revision: 0,
        updated_at: "",
        data: { name, status: "unknown", coverage },
      });
  const time = Date.now();
  const freshness: OperatingRecord[] = sources.map((s) => ({
    ...s,
    data: {
      ...s.data,
      status:
        s.data.status === "current" &&
        time - Date.parse(s.data.checked_at || s.updated_at) >
          (s.data.max_age_minutes || 60) * 60000
          ? "stale"
          : s.data.status,
    },
  }));
  const prepared = records.filter(
    (r: OperatingRecord) =>
      r.kind === "preparation" && r.data.status !== "archived",
  );
  const activeGoals = goals.records.filter((g) => !g.data.archived);
  const monthEnd = new Date(
    Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const weekEndDate = new Date(`${day}T12:00:00Z`);
  weekEndDate.setUTCDate(
    weekEndDate.getUTCDate() + ((7 - weekEndDate.getUTCDay()) % 7),
  );
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const open = tasks.filter(
    (t: WorkTask) =>
      !["completed", "cancelled", "done", "canceled"].includes(t.status),
  );
  return {
    day,
    checked_at: new Date().toISOString(),
    calendar: calendarCommitments(records, day, day),
    review: current || null,
    ...result,
    campaigns: campaigns.map((c: any) => ({
      ...c,
      provider:
        records.find((r: OperatingRecord) => r.id === `campaign:${c.id}`)
          ?.data || null,
      preparations: prepared.filter(
        (r: OperatingRecord) => r.data.campaign_id === c.id,
      ),
    })),
    projects,
    goals: activeGoals.map((g) => ({
      ...g,
      tasks: open
        .filter(
          (t: WorkTask) =>
            t.operating_context?.goal_id === g.id ||
            projects.find((p: any) => p.id === t.project_id)?.operating_context
              ?.goal_id === g.id,
        )
        .map((t: WorkTask) => t.id),
    })),
    horizons: {
      week: {
        from: day,
        to: weekEnd,
        calendar: calendarCommitments(records, day, weekEnd),
        tasks: open.filter(
          (t: WorkTask) => t.due && dateOnly(t.due) <= weekEnd,
        ),
      },
      month: {
        from: day,
        to: monthEnd,
        calendar: calendarCommitments(records, day, monthEnd),
        tasks: open.filter(
          (t: WorkTask) => t.due && dateOnly(t.due) <= monthEnd,
        ),
      },
    },
    sources: freshness,
    preparations: prepared,
    runs: nativeRuns,
    captures: records.filter(
      (r: OperatingRecord) => r.kind === "capture" && !r.data.resolved,
    ),
    capacity: {
      status: "unknown",
      available_minutes: null,
      message:
        "Queue order is proposed from commitments and ready work. Free working time has not been confirmed.",
    },
  };
}

export async function executeOperating(
  input: unknown,
  actor: "operator" | "agent",
  operatorDb?: SupabaseClient,
) {
  const p = operatingCommand.parse(input),
    db = getPortalAdminClient(),
    writer = actor === "operator" ? operatorDb : db;
  if (!writer) throw new Error("operator_session_required");
  if (p.action === "refresh") return refreshOperatingCampaigns(db);
  if (p.action === "review_day") {
    if (actor !== "operator") throw new Error("operator_confirmation_required");
    const current = await loadOperatingDay(p.day);
    if (
      p.task_ids.some(
        (id) =>
          p.task_versions[id] !==
          current.queue.find((t) => t.id === id)?.updated_at,
      )
    )
      throw new Error(
        "Work changed since this review. Reload before accepting.",
      );
    if (
      p.task_ids.some(
        (id) => !current.queue.some((t: WorkTask) => t.id === id),
      ) ||
      new Set(p.task_ids).size !== p.task_ids.length
    )
      throw new Error("Queue changed. Reload and review current work.");
    return save(
      writer,
      {
        action: "record",
        request_id: p.request_id,
        id: `day:${p.day}`,
        kind: "day",
        revision: p.revision,
        data: {
          status: "accepted",
          task_ids: p.task_ids,
          reviewed_at: new Date().toISOString(),
          source_checked_at: current.checked_at,
        },
      },
      actor,
    );
  }
  if (p.action === "complete") {
    if (actor !== "operator") throw new Error("operator_confirmation_required");
    const t = (
      await rows(db.from("compass_tasks").select("*").eq("id", p.id))
    )[0];
    if (!t) throw new Error("task_not_found");
    return save(
      writer,
      {
        action: "task",
        request_id: p.request_id,
        key: t.operating_key || t.id,
        id: t.id,
        expected_updated_at: p.expected_updated_at,
        task: { title: t.title, status: "completed" },
        context: t.operating_context || {},
      },
      actor,
    );
  }
  if (p.action === "task" || p.action === "project") {
    if (
      actor === "agent" &&
      p.context.source_kind === "activity" &&
      p.context.state !== "proposed"
    )
      throw new Error(
        "Activity observations must remain proposals until reviewed",
      );
    if (
      actor === "agent" &&
      p.context.source_kind !== "explicit" &&
      p.context.state === "ready"
    )
      throw new Error(
        "Record the explicit instruction or keep inferred work proposed",
      );
    if (p.action === "task" && p.context.depends_on.includes(p.id || ""))
      throw new Error("A task cannot depend on itself");
    if (p.context.goal_id) {
      const goal = await db
        .from("compass_settings")
        .select("id")
        .eq("id", p.context.goal_id)
        .maybeSingle();
      if (goal.error || !goal.data) throw new Error("Choose an existing goal");
    }
    if (
      p.action === "task" &&
      p.task.due &&
      (!Number.isFinite(Date.parse(p.task.due)) ||
        !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(p.task.due))
    )
      throw new Error("Use a date or a timestamp with timezone");
    return save(writer, p, actor);
  }
  if (p.id.startsWith("receipt:") || !p.id.startsWith(`${p.kind}:`))
    throw new Error("Record ID must match its kind");
  if (p.kind === "preparation") {
    if (
      !p.data.campaign_id ||
      !Array.isArray(p.data.lead_ids) ||
      !p.data.source ||
      !["prepared", "loaded", "archived"].includes(String(p.data.status))
    )
      throw new Error(
        "Preparation needs campaign, exact lead IDs, status and source",
      );
    if (
      new Set(p.data.lead_ids).size !== p.data.lead_ids.length ||
      p.data.lead_ids.length > 200
    )
      throw new Error("Use distinct lead IDs, at most 200");
    const ids = p.data.lead_ids as string[];
    const actual = ids.length
      ? await rows(db.from("lead_contacts").select("id").in("id", ids))
      : [];
    if (actual.length !== ids.length)
      throw new Error("Every recipient must have a current Compass lead ID");
  }
  if (
    p.kind === "capture" &&
    (!p.data.body ||
      !p.data.source ||
      !["explicit", "agent", "provider", "document", "activity"].includes(
        String(p.data.source_kind),
      ))
  )
    throw new Error("Capture needs body, source and source kind");
  if (
    p.kind === "source" &&
    (!p.data.name ||
      !p.data.coverage ||
      !["current", "partial", "unknown", "error", "stale"].includes(
        String(p.data.status),
      ))
  )
    throw new Error("Source needs name, coverage and status");
  return save(writer, p, actor);
}

/** Daily proposal is persisted; never rewrite an accepted order or duplicate its tasks. */
export async function prepareOperatingDay(day = sydneyDay()) {
  const current = await loadOperatingDay(day);
  if (current.review)
    return { day, retained: true, revision: current.review.revision };
  return saveOperatingRecord(getPortalAdminClient(), `day:${day}`, "day", {
    status: "proposed",
    task_ids: current.recommended,
    prepared_at: current.checked_at,
    capacity: current.capacity,
  });
}
