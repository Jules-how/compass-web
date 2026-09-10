import "server-only";
import { instantlyFetch } from "@/lib/instantly";
import { dayKey, localDateTimeToIso } from "@/lib/outbound-rhythm";
import { previousDay } from "@/lib/outbound-overview-core";
export type SentHistoryEvent = { id: string; email: string; at: string; campaign_id: string };
type History = { events?: SentHistoryEvent[]; complete_through?: string; campaign_ids?: string[]; [key: string]: unknown };
/** Exact message timestamps, not provider date aggregates. Never emits send/webhook actions. */
export async function collectOutboundEmailHistory(key: string, campaignIds: string[], previous: History = {}, now = new Date()) {
  const checked_at = now.toISOString();
  const window_from = localDateTimeToIso(`${previousDay(dayKey(now))}T00:00`, "Australia/Sydney");
  const ids = [...new Set(campaignIds)];
  // Creation time is not send time. Page the full retained campaign history,
  // then attribute messages by timestamp_email; never stop at a creation watermark.
  const retained = new Map((previous.events || []).filter(e => ids.includes(e.campaign_id) && Date.parse(e.at) >= Date.parse(window_from)).map(e => [e.id, e]));
  let requests = 0;
  try {
    for (const campaign_id of ids) {
      let cursor: string | undefined;
      const cursors = new Set<string>();
      do {
        if (requests >= 12) throw new Error("History page budget reached; complete coverage is not established");
        requests++;
        const query = new URLSearchParams({ campaign_id, email_type: "sent", limit: "100", sort_order: "desc", max_timestamp_created: checked_at, latest_of_thread: "false", preview_only: "true" });
        if (cursor) query.set("starting_after", cursor);
        const page = await instantlyFetch<{ items?: Array<Record<string, unknown>>; next_starting_after?: string | null }>(`/emails?${query}`, key, { signal: AbortSignal.timeout(8000) });
        if (!Array.isArray(page.items)) throw new Error("Provider returned an invalid history page");
        for (const row of page.items) {
          if (row.campaign_id !== campaign_id || typeof row.id !== "string" || typeof row.timestamp_email !== "string" || !Number.isFinite(Date.parse(row.timestamp_email))) throw new Error("Provider history has an unverified campaign, ID or sent timestamp");
          const stamp = Date.parse(row.timestamp_email);
          if (stamp > now.getTime()) throw new Error("Provider returned a future sent timestamp");
          if (stamp >= Date.parse(window_from)) retained.set(row.id, { id: row.id, email: typeof row.lead === "string" ? row.lead : String(row.to_address_email_list || ""), at: row.timestamp_email, campaign_id });
        }
        cursor = page.next_starting_after || undefined;
        if (cursor && cursors.has(cursor)) throw new Error("Provider repeated a history cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
    }
    return { name: "Outbound sent history", status: "current", checked_at, complete_through: checked_at, window_from, campaign_ids: ids, events: [...retained.values()],
      source: "Instantly /emails: sent, paginated to end, exact message IDs and timestamp_email",
      coverage: "Selected current-offer campaigns. Exact timestamps from full paginated retained sent history. Provider-deleted messages and unavailable accounts remain coverage limits.",
      requests, error: "" };
  } catch {
    // Keep the last complete receipt untouched on failure, never advance its watermark.
    return { ...previous, name: "Outbound sent history", status: "error", checked_at, error: "Sent-history refresh incomplete; last verified receipt retained", requests,
      coverage: "Previous exact messages retained. Current provider history could not be completely reconciled within the bounded check." };
  }
}
