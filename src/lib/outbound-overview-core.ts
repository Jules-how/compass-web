import { dayKey, restrictionReason, callWindow, type RhythmLead, type RhythmTask, type RhythmTouch } from "@/lib/outbound-rhythm";

export type Preparation = { id: string; revision?: number; updated_at?: string; data: { campaign_id?: string; title?: string; status?: string; lead_ids?: string[]; source?: string; url?: string; [key: string]: unknown } };
export type OutboundCampaign = { id: string; name: string; status: string; location_tags?: string[]; instantly_campaign_id?: string | null; provider: { status?: string; observed_at?: string | null; sent?: number | null; loaded?: number | null; contacted?: number | null; replies?: number | null; remaining_first_contacts?: number | null; [key: string]: unknown } | null; preparations?: Preparation[] };
export type NextAction = { id: string; title: string; reason: string; href: string; kind: string; state: "proposed" | "accepted" | "blocked" | "scheduled"; campaign_id?: string; lead_ids: string[]; task_id?: string; due?: string | null; priority: number };
export type Source = { id: string; data: { status?: string; checked_at?: string; last_success_at?: string; error?: string; coverage?: string; [key: string]: unknown } };
export type OutboundInput = {
  day: string; campaigns: OutboundCampaign[]; preparations: Preparation[]; sources: Source[];
  tasks: Array<{ id: string; title: string; status: string; due: string | null; lead_id?: string | null; outreach_state?: string; outreach_channel?: string; outreach_reason?: string | null; operating_context?: { campaign_id?: string; reason?: string; next_action?: string; state?: string; links?: Array<{ label: string; url: string }> } }>;
  accepted_task_ids: string[]; queue_task_ids?: string[]; leads: RhythmLead[]; rhythm_tasks: RhythmTask[]; reply_ids: string[]; ready_ids: string[];
  touches: Array<RhythmTouch & { request_payload?: { at_verified?: boolean } | null }>; activity_error?: string; activity_partial: boolean; email_history_window?: { from: string; through: string; campaign_ids: string[] };
  rhythm_error?: string; rhythm_partial: boolean; call_target?: number; ready_days?: number;
};
export function previousDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
}
export function observationFreshness(at: string | null | undefined, now = new Date()) {
  const stamp = Date.parse(at || "");
  if (!Number.isFinite(stamp) || stamp > now.getTime() + 60000) return "unknown";
  return now.getTime() - stamp > 5 * 60000 ? "stale" : "current";
}
const unique = (ids: string[]) => [...new Set(ids)];
const open = (status: string) => !["completed", "cancelled", "canceled", "done"].includes(status);
const rhythmLink = (lead?: string) => `/sales/outbound/rhythm${lead ? `?lead=${encodeURIComponent(lead)}` : ""}`;
export function outboundOverview(input: OutboundInput, now = new Date()) {
  const providerSource = input.sources.find(s => s.id === "source:instantly");
  const campaigns = input.campaigns.map(c => {
    const batches = input.preparations.filter(p => p.data.campaign_id === c.id && p.data.status !== "archived");
    const prepared = unique(batches.filter(p => p.data.status === "prepared").flatMap(p => p.data.lead_ids || []));
    const loaded = unique(batches.filter(p => p.data.status === "loaded").flatMap(p => p.data.lead_ids || []));
    const freshness = c.instantly_campaign_id ? observationFreshness(c.provider?.observed_at, now) : "not_connected";
    const failedRefresh = !!c.instantly_campaign_id && (providerSource?.data.status === "error" || (providerSource?.data.status === "partial" && !(Date.parse(c.provider?.observed_at || "") >= Date.parse(providerSource.data.checked_at || ""))));
    return { ...c, provider_status: c.instantly_campaign_id ? c.provider?.status || "unknown" : "not connected", freshness,
      refresh_error: failedRefresh ? String(providerSource?.data.error || "Provider refresh incomplete") : null,
      prepared_count: prepared.filter(id => !loaded.includes(id)).length, prepared_lead_ids: prepared.filter(id => !loaded.includes(id)), loaded_receipt_count: loaded.length,
      overlapping_stage_count: prepared.filter(id => loaded.includes(id)).length,
      preparations: batches, href: c.instantly_campaign_id ? `https://app.instantly.ai/app/campaign/${encodeURIComponent(c.instantly_campaign_id)}/analytics` : "/sales/outbound" };
  });
  const actions: NextAction[] = [];
  const leads = new Map(input.leads.map(l => [l.id, l]));
  const campaignIds = new Set(campaigns.map(c => c.id));
  const allTasks = new Map(input.tasks.map(t => [t.id, t]));
  for (const t of input.rhythm_tasks) if (!allTasks.has(t.id)) allTasks.set(t.id, t);
  const relevantTasks = [...allTasks.values()].filter(t => open(t.status) && (leads.has(t.lead_id || "") || campaignIds.has(t.operating_context?.campaign_id || "")));
  for (const t of relevantTasks) {
    const c = t.operating_context;
    const blocked = t.status === "blocked" || c?.state === "blocked";
    const confirmation = c?.state === "awaiting_confirmation";
    const accepted = t.outreach_state === "accepted" || input.accepted_task_ids.includes(t.id);
    const due = t.due && Number.isFinite(Date.parse(t.due)) && (/^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due <= input.day : Date.parse(t.due) <= now.getTime());
    const lead = leads.get(t.lead_id || "");
    const restriction = lead && !confirmation ? lead.is_archived ? "Archived contact — review before action" : restrictionReason(lead, t.outreach_channel || "call") : null;
    const future = !!t.outreach_state && !!t.due && Number.isFinite(Date.parse(t.due)) && !due;
    actions.push({ id: `task:${t.id}`, task_id: t.id, title: confirmation ? `Review completion evidence: ${t.title}` : t.title,
      reason: restriction || c?.reason || t.outreach_reason || (due ? "A recorded commitment is due." : "An existing next action is recorded."),
      kind: confirmation ? "confirmation" : "commitment", state: blocked || !!restriction ? "blocked" : !confirmation && future ? "scheduled" : !confirmation && accepted ? "accepted" : "proposed",
      href: t.lead_id ? rhythmLink(t.lead_id) : c?.links?.find(l => /^\/(?!\/)|^https:\/\//.test(l.url))?.url || "/", campaign_id: c?.campaign_id,
      lead_ids: t.lead_id ? [t.lead_id] : [], due: t.due, priority: blocked || restriction ? 95 : confirmation ? 20 : future ? 95 : due && accepted ? 0 : due ? 25 : 55 });
  }
  const taskLeadIds = new Set(relevantTasks.map(t => t.lead_id));
  const pendingReplies = unique(input.reply_ids).filter(id => !taskLeadIds.has(id));
  if (pendingReplies.length) actions.push({ id: "replies", title: `Review ${pendingReplies.length} replies`, reason: "Recorded replies need a next step; read the conversation before responding.", href: "/inbox", kind: "reply", state: "proposed", lead_ids: pendingReplies, priority: 5 });
  const unresolved = input.leads.filter(l => l.rhythm_disposition === "unresolved" && !taskLeadIds.has(l.id));
  if (unresolved.length) actions.push({ id: "unresolved", title: `Resolve next steps for ${unresolved.length} conversations`, reason: "An interaction was recorded without a settled next action.", href: rhythmLink(unresolved[0].id), kind: "capture", state: "proposed", lead_ids: unresolved.map(l => l.id), priority: 10 });
  if (campaigns.some(c => c.instantly_campaign_id && (c.freshness !== "current" || c.refresh_error))) actions.push({ id: "refresh", title: "Reconcile campaign status", reason: "Some provider observations are old, missing or failed. Refresh before deciding what to send or follow up.", href: "/sales/outbound", kind: "source", state: "proposed", lead_ids: [], priority: 15 });
  for (const c of campaigns) {
    if (c.prepared_count && !relevantTasks.some(t => t.operating_context?.campaign_id === c.id)) actions.push({ id: `review:${c.id}`, title: `Review ${c.prepared_count} prepared recipients · ${c.name}`, reason: "Existing preparation is registered, but has no loaded receipt. Review complete messages and remaining holds before import; sending stays a separate decision.", href: `/sales/outbound?campaign=${encodeURIComponent(c.id)}#outbound-campaign-${c.id}`, kind: "review", state: "proposed", campaign_id: c.id, lead_ids: c.prepared_lead_ids, priority: 30 });
  }
  const allReady = unique(input.ready_ids).map(id => leads.get(id)).filter((l): l is RhythmLead => !!l && !taskLeadIds.has(l.id) && !restrictionReason(l, "call") && l.icp_status === "pass" && !l.is_archived && !l.last_outbound_at);
  const ready = allReady.filter(l => !l.email || !["ok", "valid"].includes(l.email_verify_status || ""));
  if (ready.length) actions.push({ id: "calls:no-email", title: `Call ${ready.length} qualified accounts without cleared email`, reason: "These selected accounts have published phone routes and no cleared email route. Check the local calling window and record each outcome.", href: rhythmLink(ready[0].id), kind: "call", state: "proposed", lead_ids: ready.map(l => l.id), priority: 35 });
  // No inferred email schedule: an open promise wins; active sequences may already own follow-up.
  const followup = input.leads.filter(l => !taskLeadIds.has(l.id) && !l.is_archived && l.rhythm_disposition !== "closed" && l.last_outbound_at && Date.parse(l.last_outbound_at) <= now.getTime() - 2 * 86400000 && ["contacted", "in_instantly"].includes(l.outbound_status || "") && !l.rhythm_last_interaction_at && !restrictionReason(l, "email") && campaigns.some(c => c.instantly_campaign_id === l.instantly_campaign_id && c.freshness === "current" && !c.refresh_error && ["paused", "completed"].includes(c.provider_status)));
  if (followup.length) actions.push({ id: "followup:review", title: `Review follow-up for ${followup.length} nonresponders`, reason: "Recorded contact is at least two days old and the campaign is paused or completed. Verify the sequence, replies, suppression and recipient-specific recovery before proposing any send; no due send is inferred.", href: rhythmLink(followup[0].id), kind: "followup_review", state: "proposed", lead_ids: followup.map(l => l.id), priority: 40 });
  const preparedTotal = campaigns.reduce((n, c) => n + c.prepared_count, 0);
  const target = (input.call_target || 0) * (input.ready_days || 0);
  if (!input.rhythm_error && !input.rhythm_partial && target > allReady.length) actions.push({ id: "supply", title: "Plan the next prospect batch", reason: preparedTotal ? `${preparedTotal} prepared email recipients already exist. Review those first; the selected call pool has ${allReady.length} against the recorded ${target}-account buffer. Reuse qualified stock before choosing another city.` : `The selected call pool has ${allReady.length} against the recorded ${target}-account buffer. Check existing qualified stock and city coverage before proposing a bounded new list.`, href: "/sales/outbound", kind: "supply", state: "proposed", lead_ids: [], priority: 70 });
  // Expansion is a provisional coverage choice, never evidence of demand or untouched leads.
  const coveredCities = new Set(campaigns.flatMap(c => c.location_tags || []).map(city => city.trim().toLowerCase()));
  const candidate = ["Melbourne", "Brisbane", "Adelaide", "Canberra"].find(city => !coveredCities.has(city.toLowerCase()));
  if (candidate && !preparedTotal && !input.rhythm_error && !input.rhythm_partial && target > allReady.length && campaigns.length && campaigns.every(c => !c.instantly_campaign_id || (c.freshness === "current" && !c.refresh_error))) {
    actions.push({ id: `city:${candidate.toLowerCase()}`, title: `Consider ${candidate} for the next list`, reason: `No current-offer campaign is tagged ${candidate}. This is a provisional geographic coverage option, not a claim of better demand or untouched accounts. Check existing stock, prior outreach, service area and an agreed budget before sourcing.`, href: "/sales/outbound", kind: "city_proposal", state: "proposed", lead_ids: [], priority: 75 });
  }
  actions.sort((a,b) => a.priority - b.priority || (a.due || "9999").localeCompare(b.due || "9999") || a.id.localeCompare(b.id));
  const accepted = input.accepted_task_ids.map(id => actions.find(a => a.task_id === id)).filter((a): a is NextAction => !!a && a.state === "accepted");
  const canonical = (input.queue_task_ids || []).map(id => actions.find(a => a.task_id === id)).filter((a): a is NextAction => !!a && a.state !== "blocked" && a.state !== "scheduled");
  const preserved = accepted.length ? accepted : canonical;
  const ordered = [...preserved, ...actions.filter(a => !preserved.some(x => x.id === a.id))];
  const days = [previousDay(input.day), input.day];
  const seen = new Set<string>();
  let undated = 0;
  const touches = input.touches.filter(t => {
    if (seen.has(t.id)) return false; seen.add(t.id);
    if (!Number.isFinite(Date.parse(t.contacted_at)) || t.request_payload?.at_verified === false) { undated++; return false; }
    return true;
  });
  const activity = days.map(day => {
    const events = touches.filter(t => dayKey(t.contacted_at) === day && Date.parse(t.contacted_at) <= now.getTime() && t.outcome !== "next_step");
    const count = (f: (t: RhythmTouch) => boolean) => input.activity_error ? null : events.filter(f).length;
    const sends = events.filter(t => t.outcome === "email_sent").length;
    const history = input.email_history_window;
    const historyCoversDay = history && dayKey(history.from) <= day && dayKey(history.through) >= day && campaigns.filter(c => c.instantly_campaign_id).every(c => history.campaign_ids.includes(c.instantly_campaign_id!));
    return { day, email_sends: input.activity_error ? (sends > 0 ? sends : null) : sends > 0 || historyCoversDay ? sends : null, replies: count(t => t.outcome === "reply_received"), calls: count(t => t.channel === "call" && t.direction === "outbound"), meetings: count(t => ["meeting_agreed", "lead_meeting_booked"].includes(t.outcome || "")), events: events.map(t => ({ id: t.id, at: t.contacted_at, lead_id: t.contact_id, company: leads.get(t.contact_id)?.company || null, channel: t.channel, outcome: t.outcome, note: t.note })) };
  });
  return { schema_version: 1, day: input.day, timezone: "Australia/Sydney", checked_at: now.toISOString(), campaigns, recommendations: ordered,
    recommended_next: (canonical[0] || actions.find(a => a.state !== "blocked" && a.state !== "scheduled"))?.id || null,
    accepted_order_preserved: accepted.length > 0,
    activity, coverage: { activity: input.activity_error ? "unavailable" : input.activity_partial ? "partial" : "recorded", activity_error: input.activity_error || null, undated_events: undated,
      message: "Recorded events for current offer campaigns and selected contacts. Missing/unrecorded provider or phone history is not zero activity. Campaign totals are separate from daily events.",
      calls: input.rhythm_error ? "unavailable" : input.rhythm_partial ? "partial" : "selected contacts", calls_error: input.rhythm_error || null },
    sources: input.sources, call_accounts: ready.map(l => ({ id:l.id, company:l.company, timezone:l.rhythm_timezone, window: callWindow(l.rhythm_timezone, now) })),
    writeback: { preparation: "/api/agent/operating", call_outcomes: "/api/agent/outbound/rhythm", guidance: "Record exact preparation IDs and call outcomes at source. Recommendations are proposals; they do not send, activate or change an accepted schedule." } };
}
export type OutboundOverview = ReturnType<typeof outboundOverview>;
