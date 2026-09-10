import "server-only";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { loadOperatingDay, refreshOperatingCampaigns } from "@/lib/operating-server";
import { loadRhythm } from "@/lib/outbound-rhythm-server";
import { localDateTimeToIso, type RhythmLead, type RhythmTask } from "@/lib/outbound-rhythm";
import { outboundOverview, previousDay, type Preparation, type OutboundCampaign, type OutboundInput } from "@/lib/outbound-overview-core";

let refreshInFlight: Promise<unknown> | null = null;
async function refresh() {
  if (!refreshInFlight) refreshInFlight = refreshOperatingCampaigns(getPortalAdminClient()).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
/** UI and agents use this exact projection. Source refresh never sends or activates. */
export async function loadOutboundOverview(forceRefresh = false) {
  let operating = await loadOperatingDay();
  let refreshError: string | undefined;
  const source = operating.sources.find(s => s.id === "source:instantly");
  const lastAttempt = Date.parse(source?.data.checked_at || "");
  // Back off failures as well as successes. A five-minute TTL is visible, not called realtime.
  if (forceRefresh || !Number.isFinite(lastAttempt) || Date.now() - lastAttempt > 5 * 60000) {
    try { await refresh(); operating = await loadOperatingDay(); }
    catch { refreshError = "Provider refresh failed. Last recorded campaign evidence is retained."; }
  }
  const db = getPortalAdminClient();
  const from = localDateTimeToIso(`${previousDay(operating.day)}T00:00`, "Australia/Sydney");
  const now = new Date();
  const [rhythmResult, eventsResult] = await Promise.allSettled([
    loadRhythm(db, new URLSearchParams()),
    db.from("lead_outreach_touches").select("id,contact_id,contacted_at,channel,direction,outcome,note,person_reached,source,disposition,request_payload,instantly_campaign_id")
      .gte("contacted_at", from).lte("contacted_at", now.toISOString()).order("contacted_at", { ascending: false }).order("id").limit(5001),
  ]);
  const rhythm = rhythmResult.status === "fulfilled" && "ready" in rhythmResult.value ? rhythmResult.value : null;
  const selected = (rhythm?.leads || []) as RhythmLead[];
  const taskRows = [...operating.queue, ...operating.waiting, ...operating.proposals, ...operating.confirmation];
  const selectedIds = new Set(selected.map(l => l.id));
  const additionalIds = [...new Set(taskRows.filter(t => t.lead_id && (t.source === "outbound-rhythm" || t.operating_context?.campaign_id)).map(t => t.lead_id!))].filter(id => !selectedIds.has(id));
  let taskContactsIncomplete = additionalIds.length > 500;
  for (let offset = 0; offset < Math.min(additionalIds.length, 500); offset += 100) {
    const result = await db.from("lead_contacts").select("*").in("id", additionalIds.slice(offset, offset + 100));
    if (result.error) { taskContactsIncomplete = true; break; }
    selected.push(...(result.data || []) as RhythmLead[]);
  }
  const relevantIds = new Set([...selected.map(l => l.id), ...operating.preparations.flatMap((p: Preparation) => p.data.lead_ids || [])]);
  const providerIds = new Set(operating.campaigns.map((c: OutboundCampaign) => c.instantly_campaign_id).filter(Boolean));
  const events = eventsResult.status === "fulfilled" && !eventsResult.value.error ? eventsResult.value.data || [] : null;
  const knownTouches = (events || []).slice(0, 5000).filter(t => relevantIds.has(t.contact_id) || providerIds.has(t.instantly_campaign_id));
  const sources = refreshError ? operating.sources.map(s => s.id === "source:instantly" ? { ...s, data: { ...s.data, status: "error", error: refreshError } } : s) : operating.sources;
  const input: OutboundInput = {
    day: operating.day, campaigns: operating.campaigns, preparations: operating.preparations, sources,
    tasks: [...operating.queue, ...operating.waiting.map(t => ({ ...t, operating_context: { ...t.operating_context, state: "blocked", reason: t.reason } })), ...operating.proposals, ...operating.confirmation],
    accepted_task_ids: operating.review?.data.status === "accepted" ? operating.review.data.task_ids || [] : [],
    leads: selected, rhythm_tasks: (rhythm?.tasks || []) as RhythmTask[], reply_ids: rhythm?.replies || [], ready_ids: rhythm?.ready || [],
    touches: knownTouches, activity_error: events === null ? "Activity could not be read. Daily totals are unavailable." : undefined,
    activity_partial: !!events && events.length > 5000,
    rhythm_error: rhythm === null ? "Call and follow-up records could not be read." : undefined,
    rhythm_partial: rhythm?.partial || taskContactsIncomplete || false,
    call_target: Number(rhythm?.preferences?.call_target || 0), ready_days: Number(rhythm?.preferences?.ready_days || 0),
  };
  return outboundOverview(input, now);
}
