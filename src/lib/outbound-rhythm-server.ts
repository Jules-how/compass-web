import { agreementOutcomeSummary } from "@/lib/agreement-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rhythmCommand,
  rankActions,
  weeklyOutcomes,
  restrictionReason,
  isOpen,
  type RhythmLead,
  type RhythmTask,
  type RhythmTouch,
} from "@/lib/outbound-rhythm";
import { searchLeadContacts } from "@/lib/lead-search";

async function rows(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as Record<string, unknown>[];
}
export async function loadRhythm(db: SupabaseClient, params: URLSearchParams) {
  const leadId = params.get("lead");
  const q = params.get("q")?.trim();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86400000).toISOString();
  if (q) {
    const result = await searchLeadContacts(
      db,
      { q },
      { mode: "agent", columns: "cohort", limit: 25 },
    );
    return { leads: result.leads };
  }
  if (leadId) {
    const [leads, tasks, touches] = await Promise.all([
      rows(db.from("lead_contacts").select("*").eq("id", leadId).limit(1)),
      rows(
        db
          .from("compass_tasks")
          .select("*")
          .eq("lead_id", leadId)
          .order("updated_at", { ascending: false })
          .limit(100),
      ),
      rows(
        db
          .from("lead_outreach_touches")
          .select("*")
          .eq("contact_id", leadId)
          .order("contacted_at", { ascending: false })
          .limit(50),
      ),
    ]);
    if (!leads.length) throw new Error("lead_not_found");
    return {
      lead: leads[0] as unknown as RhythmLead,
      tasks: tasks as unknown as RhythmTask[],
      touches: touches as RhythmTouch[],
      historyLimit: 50,
    };
  }
  // Selection is explicit. Do not enroll the historical ledger by inferred offer fit.
  const [leads, taskRows, prefs, work] = await Promise.all([
    rows(
      db
        .from("lead_contacts")
        .select("*")
        .not("rhythm_selected_at", "is", null)
        .eq("rhythm_offer_key", "installation-booking")
        .order("id")
        .limit(501),
    ),
    rows(
      db
        .from("compass_tasks")
        .select("*")
        .not("lead_id", "is", null)
        .not("status", "in", "(completed,cancelled)")
        .order("due", { ascending: true, nullsFirst: false })
        .order("id")
        .limit(1001),
    ),
    rows(
      db
        .from("compass_outbound_rhythm_preferences")
        .select("*")
        .eq("id", "default"),
    ),
    rows(
      db
        .from("compass_outbound_work_log")
        .select("*")
        .gte("day", since.slice(0, 10))
        .order("day", { ascending: false })
        .limit(1000),
    ),
  ]);
  const selected = leads.slice(0, 500) as unknown as RhythmLead[];
  const ids = selected.map((l) => l.id);
  const idSet = new Set(ids);
  const tasks = taskRows.filter((t) =>
    idSet.has(t.lead_id as string),
  ) as unknown as RhythmTask[];
  const touches: RhythmTouch[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const recent = await rows(
      db
        .from("lead_outreach_touches")
        .select(
          "id,contact_id,contacted_at,channel,direction,outcome,note,person_reached,source,disposition",
        )
        .in("contact_id", batch)
        .gte("contacted_at", since)
        .order("contacted_at", { ascending: false })
        .limit(2001),
    );
    if (recent.length > 2000)
      throw new Error(
        "Too much history for a complete weekly review. Narrow the selected cohort.",
      );
    touches.push(...(recent as RhythmTouch[]));
  }
  const commercial = await agreementOutcomeSummary(since).catch(() => null);
  const open = rankActions(tasks, now);
  const preference = prefs[0];
  const target =
    Number(preference?.call_target ?? 10) * Number(preference?.ready_days ?? 2);
  const due = open.filter(
    (t) => t.outreach_state === "accepted" && t.due && new Date(t.due) <= now,
  );
  const ready = selected.filter(
    (l) =>
      !open.some(
        (t) =>
          t.lead_id === l.id &&
          (due.some((d) => d.id === t.id) || t.outreach_state === "unresolved"),
      ) &&
      !l.rhythm_last_interaction_at &&
      l.rhythm_disposition !== "closed" &&
      !l.last_outbound_at &&
      l.outbound_status === "uncontacted" &&
      l.icp_status === "pass" &&
      !l.is_archived &&
      !restrictionReason(l, "call") &&
      l.rhythm_timezone,
  );
  const unresolved = open.filter((t) => t.outreach_state === "unresolved");
  const replies = selected.filter(
    (l) =>
      ["replied", "interested", "replied_positive"].includes(
        l.outbound_status || "",
      ) &&
      !open.some(
        (t) =>
          t.lead_id === l.id &&
          (due.some((d) => d.id === t.id) || t.outreach_state === "unresolved"),
      ) &&
      (!l.rhythm_last_interaction_at ||
        new Date(l.rhythm_last_interaction_at) <
          new Date(
            (l as unknown as { instantly_event_at: string })
              .instantly_event_at ||
              l.last_outbound_at ||
              0,
          )),
  );
  return {
    commercial,
    checkedAt: now.toISOString(),
    since,
    leads: selected,
    tasks: open,
    touches,
    preferences: preference,
    work,
    ready: ready.map((l) => l.id),
    shortfall: Math.max(0, target - ready.length),
    due: due.map((t) => t.id),
    unresolved: unresolved.map((t) => t.id),
    replies: replies.map((l) => l.id),
    metrics: weeklyOutcomes(touches),
    partial: leads.length > 500 || taskRows.length > 1000,
    emailSchedule: {
      status: "unknown",
      message:
        "Open Instantly for actual scheduled email times. Campaign capacity is not a confirmed schedule.",
    },
    reportCoverage:
      "Recorded events for the selected cohort over the last seven days; provider history may be incomplete.",
  };
}
export async function saveRhythm(
  db: SupabaseClient,
  input: unknown,
  actor: "operator" | "agent",
) {
  const command = rhythmCommand.parse(input);
  if ("next" in command && command.next) {
    const leads = await rows(
      db.from("lead_contacts").select("*").eq("id", command.lead_id).limit(1),
    );
    const lead = leads[0] as unknown as RhythmLead;
    if (!lead) throw new Error("lead_not_found");
    const restriction = restrictionReason(lead, command.next.channel);
    if (restriction) throw new Error(restriction);
  }
  if (
    actor === "agent" &&
    (("next" in command && command.next?.state === "accepted") ||
      ("task_status" in command && command.task_status) ||
      ("complete_task" in command && command.complete_task))
  )
    throw new Error("operator_confirmation_required");
  const { data, error } = await db.rpc("compass_outbound_rhythm_save", {
    p: command,
  });
  if (error) throw new Error(error.message);
  return data;
}
