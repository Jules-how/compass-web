import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPortalAdminClient } from "./portal-admin";
import { getPlanning } from "./planning-server";
import { loadPathfinder } from "./pathfinder/server";
import { searchLeadContacts } from "./lead-search";
import { sessionCommand, cityZone } from "./goal-actions";
export async function loadGoalActions() {
  const db = getPortalAdminClient();
  const [workspace, sessions] = await Promise.all([
    loadPathfinder(),
    db
      .from("compass_operating_records")
      .select("id,data,revision,updated_at")
      .like("id", "capture:call-session:%")
      .order("updated_at", { ascending: false })
      .limit(501),
  ]);
  if (sessions.error) throw new Error("Calling sessions could not be loaded.");
  if ((sessions.data?.length || 0) > 500)
    throw new Error(
      "Session coverage exceeds this view; archive old sessions before continuing.",
    );
  return {
    ...workspace,
    sessions: sessions.data || [],
    connections: {
      codex_local: process.env.COMPASS_INSTRUCTION_PUBLIC_KEY
        ? "configured"
        : "not configured",
      chatgpt: "not connected",
      chatgpt_work: "not connected",
    },
  };
}
export async function goalProspects(params: URLSearchParams) {
  return searchLeadContacts(
    getPortalAdminClient(),
    { city: params.get("city") || undefined, q: params.get("q") || undefined },
    {
      mode: "agent",
      columns: "full",
      limit: 100,
      cursor: params.get("cursor"),
    },
  );
}
export async function goalEvidence(goalId: string) {
  if (!(await getPlanning("goal", goalId))) throw new Error("Goal not found.");
  const db = getPortalAdminClient();
  const result = await db
    .from("lead_outreach_touches")
    .select("id,contact_id,contacted_at,outcome,channel,request_payload")
    .eq("request_payload->>goal_id", goalId)
    .order("contacted_at")
    .limit(5001);
  if (result.error) throw new Error("Conversation evidence unavailable.");
  const touches = result.data?.slice(0, 5000) || [],
    ids = [...new Set(touches.map((t) => t.contact_id))],
    businesses = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("lead_contacts")
      .select("id,company,company_domain")
      .in("id", ids.slice(i, i + 100));
    if (error) throw new Error("Business identity coverage is unavailable.");
    for (const lead of data || []) businesses.set(lead.id, lead);
  }
  return {
    touches: touches.map((t) => ({
      ...t,
      company: businesses.get(t.contact_id)?.company,
      business_key:
        businesses.get(t.contact_id)?.company_domain?.toLowerCase() ||
        t.contact_id,
    })),
    complete: (result.data?.length || 0) <= 5000,
    scope:
      "Activities explicitly linked to this goal; market denominator unknown.",
  };
}
export async function saveGoalSession(
  db: SupabaseClient,
  input: unknown,
  actor: "operator" | "agent",
) {
  const p = sessionCommand.parse(input),
    goal = await getPlanning("goal", p.goal_id);
  if (!goal || goal.data.archived) throw new Error("Choose an active goal.");
  const context = {
    domain: goal.data.domain || "business",
    reason: `Sales conversations contributing to ${goal.data.title}`,
    next_action: `Open the ${p.city} calling session`,
    done_when:
      "Record attempted call outcomes and every promised follow-up; pause or finish explicitly.",
    source:
      actor === "operator"
        ? "Jules created this calling session in Compass."
        : "Agent proposed this calling session.",
    source_kind: actor === "operator" ? "explicit" : "agent",
    state: actor === "operator" ? "ready" : "proposed",
    owner: "Jules",
    goal_id: p.goal_id,
    campaign_id: "",
    links: [],
    depends_on: [],
    evidence: [],
    blocker: "",
    available_on: null,
    estimate_minutes: null,
  };
  const { data, error } = await db.rpc("compass_goal_session_save", {
    p: { ...p, timezone: cityZone(p.city), context },
    p_actor: actor,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function sessionContacts(id: string) {
  if (!/^capture:call-session:[a-f0-9-]{36}$/.test(id))
    throw new Error("Invalid session.");
  const db = getPortalAdminClient(),
    { data: session, error } = await db
      .from("compass_operating_records")
      .select("data")
      .eq("id", id)
      .maybeSingle();
  if (error || !session) throw new Error("Session not found.");
  const ids = session.data.lead_ids as string[],
    leads: any[] = [],
    tasks: any[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const [l, t] = await Promise.all([
      db.from("lead_contacts").select("*").in("id", batch),
      db
        .from("compass_tasks")
        .select("*")
        .in("lead_id", batch)
        .not("status", "in", "(completed,cancelled)")
        .limit(2001),
    ]);
    if (l.error || t.error || (t.data?.length || 0) > 2000)
      throw new Error("Complete session contacts could not be loaded.");
    leads.push(...(l.data || []));
    tasks.push(...(t.data || []));
  }
  return { leads, tasks };
}
