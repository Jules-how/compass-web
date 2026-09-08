"use client";

import { useEffect, useMemo, useState } from "react";
import { reviewReadiness } from "@/lib/experiment-review.mjs";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listCampaigns, updateCampaign } from "@/lib/campaigns-client";
import type { CompassCampaign } from "@/lib/campaigns";
import { experimentFactorLabel, experimentStatusLabel } from "@/lib/campaigns";
import type { OutboundBoardCampaign } from "@/lib/instantly";
import {
  countFactorDifferences,
  enrichOutboundCampaignFactors,
  type OutboundFactorCampaign,
} from "@/lib/outbound-factor-performance";
import { computeOutcomeMetrics } from "@/lib/outbound-outcome-metrics";
import { useCachedJson } from "@/lib/use-cached-json";

type OutboundBoardPayload = {
  live: OutboundBoardCampaign[];
  history: OutboundBoardCampaign[];
  source?: "instantly" | "demo" | "error";
};

function metricsFor(
  campaign: CompassCampaign,
  board: OutboundFactorCampaign[],
): OutboundFactorCampaign | null {
  if (!campaign.instantly_campaign_id) return null;
  return board.find((c) => c.id === campaign.instantly_campaign_id) || null;
}

function ArmCard({
  campaign,
  metrics,
  label,
}: {
  campaign: CompassCampaign;
  metrics: OutboundFactorCampaign | null;
  label: string;
}) {
  const sent = metrics?.sendCount ?? 0;
  const outcome = computeOutcomeMetrics(
    { sent, bounced: metrics?.bouncedCount ?? 0 },
    {
      positive: campaign.wave_positive_count ?? metrics?.positiveReplies ?? 0,
      meetings: campaign.wave_meeting_count ?? metrics?.meetings ?? 0,
    },
  );
  const target = campaign.sample_size_target ?? 0;
  const progress =
    target > 0
      ? Math.min(100, Math.round((outcome.delivered / target) * 100))
      : null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {label}
          </p>
          <Link
            href={`/sales/pipeline/${campaign.id}`}
            className="text-sm font-semibold text-neutral-900 hover:text-[#c2410c]"
          >
            {campaign.name}
          </Link>
        </div>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
          {experimentStatusLabel(campaign.experiment_status || "none")}
        </span>
      </div>
      <p className="mt-2 text-xs text-neutral-600">
        {campaign.hypothesis || "No hypothesis set."}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-600">
        <div>
          <dt className="text-neutral-400">Offer</dt>
          <dd className="font-medium text-neutral-800">
            {campaign.offer_key || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-400">Structure</dt>
          <dd className="font-medium text-neutral-800">
            {campaign.structure_id || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-400">CTA type</dt>
          <dd className="font-medium text-neutral-800">
            {campaign.cta_type || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-400">Expression</dt>
          <dd className="truncate font-medium text-neutral-800">
            {campaign.expression_key || "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg bg-stone-50 px-2 py-1.5">
          <div className="font-semibold text-neutral-900">
            {metrics ? outcome.delivered : "—"}
          </div>
          <div className="text-neutral-400">Delivered</div>
        </div>
        <div className="rounded-lg bg-stone-50 px-2 py-1.5">
          <div className="font-semibold text-neutral-900">
            {metrics && outcome.delivered > 0
              ? `${outcome.positiveRate}%`
              : "—"}
          </div>
          <div className="text-neutral-400">Positive</div>
        </div>
        <div className="rounded-lg bg-stone-50 px-2 py-1.5">
          <div className="font-semibold text-neutral-900">
            {metrics && outcome.delivered > 0 ? outcome.meetingsPer100 : "—"}
          </div>
          <div className="text-neutral-400">Mtgs/100</div>
        </div>
      </div>
      {!metrics && (
        <p className="mt-3 text-xs text-neutral-500">
          No live metrics available for this arm.
        </p>
      )}
      {metrics && progress != null ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-neutral-500">
            <span>Sample progress</span>
            <span>
              {outcome.delivered}/{target}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-[#e85d2a]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OutboundExperimentCompare() {
  const board = useCachedJson<OutboundBoardPayload>(
    "/api/instantly/outbound-campaigns",
    "/api/instantly/outbound-campaigns",
    { staleMs: 60_000 },
  );
  const [pipeline, setPipeline] = useState<CompassCampaign[]>([]);
  const [controlId, setControlId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [challengerId, setChallengerId] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [reviewDate, setReviewDate] = useState(""),
    [comparable, setComparable] = useState(false),
    [mature, setMature] = useState(false);
  useEffect(() => {
    setNote("");
    setComparable(false);
    setMature(false);
  }, [controlId, challengerId]);

  useEffect(() => {
    let cancelled = false;
    void listCampaigns()
      .then((rows) => {
        if (cancelled) return;
        setPipeline(rows);
        const controls = rows.filter(
          (r) =>
            r.experiment_role === "control" ||
            (!r.parent_campaign_id &&
              r.experiment_status &&
              r.experiment_status !== "none"),
        );
        if (!controlId && controls[0]) setControlId(controls[0].id);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [controlId]);

  const enrichedBoard = useMemo(() => {
    const live = board.data?.source === 'instantly' ? board.data.live : [];
    const history = board.data?.source === 'instantly' ? board.data.history : [];
    return [...live, ...history].map((c) =>
      enrichOutboundCampaignFactors(c, pipeline),
    );
  }, [board.data, pipeline]);

  const control = pipeline.find((c) => c.id === controlId) || null;
  const challengers = useMemo(
    () => pipeline.filter((c) => c.parent_campaign_id === controlId),
    [pipeline, controlId],
  );
  const challenger = challengers.find((c) => c.id === challengerId) || null;

  const controlMetrics = control ? metricsFor(control, enrichedBoard) : null;
  const challengerMetrics = challenger
    ? metricsFor(challenger, enrichedBoard)
    : null;

  const mixed =
    controlMetrics && challengerMetrics
      ? countFactorDifferences(controlMetrics, challengerMetrics) > 1
      : false;

  const controls = pipeline.filter(
    (r) =>
      r.experiment_role === "control" ||
      r.experiment_role === "solo" ||
      (!r.parent_campaign_id &&
        r.experiment_status &&
        r.experiment_status !== "none"),
  );

  const reasons = reviewReadiness({
    control,
    challenger,
    controlMetrics,
    challengerMetrics,
    note,
    reviewDate,
    today: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
    }).format(new Date()),
    comparable,
    mature,
  });
  if (mixed) reasons.push("More than one tracked factor differs.");
  if (board.error || board.data?.source !== "instantly")
    reasons.push("Live campaign evidence is unavailable.");
  async function setStatus(status: string, decision?: string) {
    if (!control) return;
    if (["won", "lost", "ready_to_call"].includes(status) && reasons.length)
      return;
    if (!note.trim()) {
      setError("Add evidence or explain why the test is inconclusive.");
      return;
    }
    setBusy(true);
    setError("");
    decision = JSON.stringify({
      assessment: note,
      reviewDate,
      comparable,
      mature,
      recordedAt: new Date().toISOString(),
      control: controlMetrics,
      challenger: challengerMetrics,
    });
    try {
      await updateCampaign(control.id, {
        experiment_status: status,
        experiment_decision: decision ?? control.experiment_decision,
      });
      if (challenger) {
        const challengerStatus =
          status === "won" ? "lost" : status === "lost" ? "won" : status;
        await updateCampaign(challenger.id, {
          experiment_status: challengerStatus,
          experiment_decision: decision ?? challenger.experiment_decision,
        });
      }
      const rows = await listCampaigns({ force: true });
      setPipeline(rows);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Assessment was not fully saved. Reload both arms before retrying.",
      );
      setPipeline(await listCampaigns({ force: true }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Experiment compare</CardTitle>
          <CardDescription>
            Control vs challenger — one factor at a time. Separate Instantly
            campaigns only.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(error || board.error) && (
          <p role="alert" className="text-sm text-red-700">
            {error || "Campaign metrics could not be loaded."}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            Control campaign
          </span>
          <select
            value={controlId}
            onChange={(e) => setControlId(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
          >
            <option value="">Select…</option>
            {controls.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.experiment_factor && c.experiment_factor !== "none"
                  ? ` (${experimentFactorLabel(c.experiment_factor)})`
                  : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Challenger campaign
          <select
            className="compass-input"
            value={challengerId}
            onChange={(e) => setChallengerId(e.target.value)}
          >
            <option value="">Choose the specific challenger…</option>
            {challengers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {!control ? (
          <p className="text-sm text-neutral-500">
            No experiment campaigns yet. Set a hypothesis on a Planner card or
            spawn a challenger.
          </p>
        ) : (
          <>
            {mixed ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Mixed factors — don’t call a single winner yet. Align on one
                changed dimension.
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <ArmCard
                campaign={control}
                metrics={controlMetrics}
                label="Control"
              />
              {challenger ? (
                <ArmCard
                  campaign={challenger}
                  metrics={challengerMetrics}
                  label={`Challenger · ${experimentFactorLabel(challenger.experiment_factor || "none")}`}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-3 text-sm text-neutral-500">
                  No challenger linked. Use Spawn challenger on the Planner
                  card.
                </div>
              )}
            </div>
            <div className="space-y-3 rounded-xl bg-stone-50 p-4">
              <p className="text-sm">
                A manual assessment is not a statistical significance claim. A
                sample target alone does not establish certainty.
              </p>
              <label className="block text-sm">
                Planned review date
                <input
                  type="date"
                  className="compass-input ml-3"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={comparable}
                  onChange={(e) => setComparable(e.target.checked)}
                />
                I checked non-overlapping company cohorts, sender conditions,
                timing and the intended changed factor.
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mature}
                  onChange={(e) => setMature(e.target.checked)}
                />
                Both arms have had the planned follow-ups and enough time for
                the chosen outcome.
              </label>
              <label className="block text-sm">
                Evidence, outcome window and limitations
                <textarea
                  className="compass-input mt-1 w-full"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {reasons.length > 0 && (
                <p className="text-xs text-neutral-600">
                  Winner assessment unavailable: {reasons.join(" ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["ready_to_call", "Ready to call"],
                  ["won", "Control wins"],
                  ["lost", "Challenger wins"],
                  ["inconclusive", "Inconclusive"],
                  ["killed", "Kill"],
                ] as const
              ).map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  disabled={
                    busy ||
                    !note.trim() ||
                    (["won", "lost", "ready_to_call"].includes(status) &&
                      reasons.length > 0)
                  }
                  onClick={() => void setStatus(status)}
                  className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 disabled:opacity-60"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
