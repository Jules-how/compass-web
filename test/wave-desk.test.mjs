import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function suggestWaveMoves(input) {
  const suggestions = [];
  for (const row of input.instantly) {
    const sends = Math.max(0, row.sendCount || 0);
    const replies = Math.max(0, row.replyCount || 0);
    const rate = sends > 0 ? replies / sends : 0;
    const remaining = Math.max(0, row.remaining || 0);
    if (sends >= 1000 && replies === 0) {
      suggestions.push({ kind: "kill" });
      continue;
    }
    if (sends >= 100 && rate < 0.01) {
      suggestions.push({ kind: "pause_inspect" });
      continue;
    }
    if (row.status === "live" && rate >= 0.05 && remaining < 50) {
      suggestions.push({ kind: "load_more" });
    }
  }
  if (suggestions.length === 0) suggestions.push({ kind: "new_list" });
  return suggestions;
}

function mergeScanRecords(existing, incoming) {
  return { ...(existing ?? {}), ...(incoming ?? {}) };
}

function mergeWaveBriefPayload(existing, incoming) {
  const recommendation =
    incoming.recommendation?.trim() || existing?.recommendation || null;
  const scan = mergeScanRecords(existing?.scan, incoming.scan);
  return {
    recommendation,
    scan,
    ...(existing?.created_at ? { created_at: existing.created_at } : {}),
  };
}

test("5 percent replies with thin remainder queues a top-up", () => {
  const out = suggestWaveMoves({
    instantly: [
      { status: "live", sendCount: 200, replyCount: 10, remaining: 20 },
    ],
  });
  assert.equal(out[0].kind, "load_more");
});

test("sub 1 percent after 100 sends queues a deliverability pause", () => {
  const out = suggestWaveMoves({
    instantly: [
      { status: "live", sendCount: 120, replyCount: 0, remaining: 80 },
    ],
  });
  assert.equal(out[0].kind, "pause_inspect");
});

test("morning brief merge keeps writeup when Instantly scan updates", () => {
  const merged = mergeWaveBriefPayload(
    {
      recommendation: "Wait",
      scan: { writeup: "Full day plan", emailsSentToday: 12 },
    },
    { scan: { emailsSentToday: 40 } },
  );
  assert.equal(merged.scan.writeup, "Full day plan");
  assert.equal(merged.scan.emailsSentToday, 40);
});

test("waves UI and agent route exist", () => {
  const board = read("src/components/outbound/OfferWavesBoard.tsx");
  assert.match(board, /OFFER_WAVE_COLUMN_LABELS/);
  assert.match(board, /WaveAddCampaign/);
  assert.match(board, /recontactReady/);
  assert.match(board, /buildLiveDesk/);
  assert.match(board, /KanbanBoard/);
  assert.match(board, /leftover campaigns/);
  assert.match(board, /Mark done/);
  assert.match(
    read("src/components/outbound/WaveCampaignCard.tsx"),
    /wave_rationale/,
  );
  assert.match(
    read("src/components/outbound/WaveCampaignCard.tsx"),
    /Open copy/,
  );
  assert.match(
    read("src/components/ui/kanban-board.tsx"),
    /export function KanbanBoard/,
  );
  assert.match(read("src/components/ui/avatar.tsx"), /AvatarFallback/);
  assert.match(read("src/lib/wave-desk.ts"), /export function buildLiveDesk/);
  assert.match(
    read("src/app/api/outbound/wave-desk/route.ts"),
    /export async function PATCH/,
  );
  assert.match(
    read("src/app/api/agent/outbound/waves/route.ts"),
    /compass_publish_wave_brief/,
  );
  assert.match(
    read("src/app/api/agent/outbound/waves/route.ts"),
    /expectedRevision/,
  );
  assert.match(
    read("src/app/api/agent/outbound/waves/route.ts"),
    /dailySetupNoteMarker/,
  );
  assert.match(
    read("src/app/api/agent/outbound/waves/route.ts"),
    /next_campaign_ids/,
  );
  assert.match(read("src/app/api/campaigns/route.ts"), /listPipelineCampaigns/);
  assert.match(
    read("src/lib/outbound-desk.ts"),
    /DEFAULT_OUTBOUND_DESK: OutboundDeskId = [\"']overview[\"']/,
  );
});

test("morning brief merge keeps an existing recommendation when scan-only", () => {
  const existing = {
    recommendation: "Keep topping Sydney roofers",
    scan: { emailsSentToday: 12 },
    created_at: "2026-09-01T22:00:00.000Z",
  };
  const merged = mergeWaveBriefPayload(existing, {
    scan: { emailsSentToday: 40 },
  });
  assert.equal(merged.recommendation, "Keep topping Sydney roofers");
  assert.equal(merged.scan.emailsSentToday, 40);
  assert.equal(merged.created_at, existing.created_at);
});

test("morning brief merge replaces recommendation when a new one is sent", () => {
  const merged = mergeWaveBriefPayload(
    {
      recommendation: "Old call",
      scan: { a: 1 },
      created_at: "2026-09-01T22:00:00.000Z",
    },
    { recommendation: "  Pause and inspect inboxes.  ", scan: { a: 2 } },
  );
  assert.equal(merged.recommendation, "Pause and inspect inboxes.");
  assert.equal(merged.scan.a, 2);
});

function splitMorningBrief(recommendation) {
  const text = (recommendation || "").trim();
  if (!text) return { headline: "", watches: [] };
  const parts = text
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return { headline: parts[0] || text, watches: parts.slice(1) };
}

function splitNextQueue(campaigns, today) {
  const upcoming = [];
  const leftover = [];
  for (const campaign of campaigns) {
    const date = campaign.go_live_at
      ? campaign.go_live_at.slice(0, 10)
      : (campaign.start_date || "").slice(0, 10);
    const stale = Boolean(
      date && date < today && !(campaign.instantly_campaign_id || "").trim(),
    );
    if (stale) leftover.push(campaign);
    else upcoming.push(campaign);
  }
  return { upcoming, leftover };
}

function buildLiveDesk(input) {
  const pool = input.allCampaigns ?? input.liveCampaigns;
  const byInstantlyId = new Map(
    pool
      .filter((row) => (row.instantly_campaign_id || "").trim())
      .map((row) => [row.instantly_campaign_id, row]),
  );
  const sending = [];
  const usedCampaignIds = new Set();
  for (const row of input.instantlyRows) {
    if (row.status !== "live" && row.status !== "launching") continue;
    const campaign = byInstantlyId.get(row.id) ?? null;
    sending.push({
      key: campaign?.id || `instantly-${row.id}`,
      campaign,
      instantly: row,
    });
    if (campaign) usedCampaignIds.add(campaign.id);
  }
  for (const campaign of input.liveCampaigns) {
    if (usedCampaignIds.has(campaign.id)) continue;
    const instantly = campaign.instantly_campaign_id
      ? input.instantlyById.get(campaign.instantly_campaign_id)
      : undefined;
    if (
      instantly &&
      instantly.status !== "live" &&
      instantly.status !== "launching"
    )
      continue;
    sending.push({ key: campaign.id, campaign, instantly: instantly ?? null });
    usedCampaignIds.add(campaign.id);
  }
  const parked = input.liveCampaigns.filter(
    (campaign) => !usedCampaignIds.has(campaign.id),
  );
  return { sending, parked };
}

test("morning brief splits the first sentence as the decision", () => {
  const out = splitMorningBrief(
    "Sydney HVAC is live. Roofing Sydney has 0 replies. Do not swap HVAC onto Fill and Capture.",
  );
  assert.equal(out.headline, "Sydney HVAC is live.");
  assert.equal(out.watches.length, 2);
});

test("stale next campaigns without Instantly bind go to leftovers", () => {
  const out = splitNextQueue(
    [
      {
        id: "a",
        go_live_at: "2026-08-17T00:00:00.000Z",
        instantly_campaign_id: null,
      },
      {
        id: "b",
        go_live_at: "2026-09-10T00:00:00.000Z",
        instantly_campaign_id: null,
      },
      {
        id: "c",
        go_live_at: "2026-08-01T00:00:00.000Z",
        instantly_campaign_id: "inst-1",
      },
    ],
    "2026-09-02",
  );
  assert.deepEqual(
    out.leftover.map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    out.upcoming.map((row) => row.id),
    ["b", "c"],
  );
});

test("live desk shows Instantly sending even without a Compass row, and parks paused Compass live", () => {
  const hvac = { id: "hvac", name: "HVAC", instantly_campaign_id: "inst-hvac" };
  const perth = {
    id: "perth",
    name: "Perth",
    instantly_campaign_id: "inst-perth",
  };
  const instantlyById = new Map([
    ["inst-hvac", { id: "inst-hvac", status: "live", name: "HVAC" }],
    ["inst-perth", { id: "inst-perth", status: "paused", name: "Perth" }],
    ["inst-roof", { id: "inst-roof", status: "live", name: "Roofing Sydney" }],
  ]);
  const out = buildLiveDesk({
    liveCampaigns: [hvac, perth],
    allCampaigns: [hvac, perth],
    instantlyById,
    instantlyRows: [
      instantlyById.get("inst-hvac"),
      instantlyById.get("inst-perth"),
      instantlyById.get("inst-roof"),
    ],
  });
  assert.equal(out.sending.length, 2);
  assert.equal(
    out.sending.some(
      (row) => row.instantly.id === "inst-roof" && !row.campaign,
    ),
    true,
  );
  assert.equal(
    out.sending.some((row) => row.campaign?.id === "hvac"),
    true,
  );
  assert.deepEqual(
    out.parked.map((row) => row.id),
    ["perth"],
  );
});
