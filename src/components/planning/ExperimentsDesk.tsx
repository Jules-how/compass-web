"use client";
import { NotebookEditor } from "./NotebookEditor";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listCampaigns, spawnChallenger } from "@/lib/campaigns-client";
import type { CompassCampaign } from "@/lib/campaigns";
import { OutboundExperimentCompare } from "@/components/outbound/OutboundExperimentCompare";
const dimensions = [
  ["expression", "Copy / length / tone"],
  ["expression", "Risk reversal"],
  ["structure", "Email structure"],
  ["audience", "Location"],
  ["audience", "Qualification signals"],
  ["opener_mode", "Personalisation"],
  ["cta", "Call to action"],
  ["subject", "Subject"],
  ["offer", "Offer"],
];
export function ExperimentsDesk() {
  const [rows, setRows] = useState<CompassCampaign[]>([]),
    [id, setId] = useState(""),
    [dimension, setDimension] = useState("0"),
    [hypothesis, setHypothesis] = useState(""),
    [target, setTarget] = useState(""),
    [reviewDate, setReviewDate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState<CompassCampaign | null>(null),
    [message, setMessage] = useState(""),
    [legacy, setLegacy] = useState(false);
  const requestId = useRef("");
  useEffect(() => {
    void listCampaigns()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  const current = rows.find((c) => c.id === id),
    options = rows.filter(
      (c) =>
        c.status !== "archived" &&
        c.status !== "cancelled" &&
        (legacy || c.offer_key === "installation-booking"),
    );
  async function create() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const [factor, label] = dimensions[Number(dimension)];
      const child = await spawnChallenger(current.id, {
        factor,
        name: `${current.name} · ${label}`,
        hypothesis: `${label}: ${hypothesis}\nReview on or after ${reviewDate}; wait until both planned samples and outcome windows are complete.`,
        sample_size_target: Number(target),
        cta_type: current.cta_type,
        opener_mode: current.opener_mode,
      });
      setCreated(child);
      setMessage(
        "Separate Compass draft created. Edit the chosen variation and inspect the whole sequence before preparation.",
      );
      setRows(await listCampaigns({ force: true }));
      requestId.current = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create draft.");
    } finally {
      setBusy(false);
    }
  }
  async function queue() {
    if (!created) return;
    setBusy(true);
    setError("");
    try {
      requestId.current ||= `planning.preparation.${crypto.randomUUID()}`;
      const r = await fetch("/api/experiments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId.current,
          campaignId: created.id,
          reviewDate,
          dimension: dimensions[Number(dimension)][1],
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setMessage(
        "Preparation request saved with a snapshot of the current draft. An agent must execute and verify it; no list build or upload has run yet.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue preparation.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="compass-page-title">Email tests</h1>
          <p className="compass-page-subtitle">
            Choose a change, prepare a separate draft, then compare the
            evidence.
          </p>
        </div>
        <Link href="/planning" className="compass-btn-secondary">
          Preparation queue
        </Link>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-orange-50 p-4 text-sm">
          {message}
        </p>
      )}
      <section className="outbound-notebook-page">
        <h2 className="text-lg font-semibold">Plan an outbound test</h2>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="block text-sm">
            Control campaign
            <select
              required
              disabled={busy || !!created}
              className="compass-input mt-1 w-full"
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              <option value="">Choose…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={legacy}
              onChange={(e) => setLegacy(e.target.checked)}
            />
            Show other offers for historical tests
          </label>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              What changes?
              <select
                disabled={busy || !!created}
                className="compass-input mt-1 w-full"
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
              >
                {dimensions.map(([, label], i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Planned delivered sample per arm
              <input
                required
                disabled={!!created}
                type="number"
                min="1"
                max="20000"
                className="compass-input mt-1 w-full"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Earliest outcome review
              <input
                required
                disabled={!!created}
                type="date"
                className="compass-input mt-1 w-full"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
              />
            </label>
          </div>
          <div><h3 className="text-sm font-medium">Test notebook</h3><NotebookEditor label="Test hypothesis and plan" value={hypothesis} onChange={setHypothesis} maxLength={3000} placeholder="What will change, why might it help, and what would count as useful evidence?" /></div>
          <p className="text-sm text-neutral-500">
            Creating a draft copies the control; it does not write the variation
            for you. Sample size is a planning choice, not a guarantee of
            statistical certainty. Set the control’s sample target in its
            campaign editor too.
          </p>
          <button disabled={busy || !!created} className="compass-btn-primary">
            {busy ? "Saving…" : "Create separate draft"}
          </button>
          {created && (
            <div className="flex flex-wrap gap-3">
              <Link
                className="compass-btn-primary"
                href={`/sales/pipeline/${created.id}`}
              >
                Edit draft copy & audience
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void queue()}
                className="compass-btn-secondary"
              >
                Queue preparation from current draft
              </button>
              <button
                type="button"
                className="compass-btn-ghost"
                onClick={() => {
                  setCreated(null);
                  setMessage("");
                  requestId.current = "";
                }}
              >
                Plan another test
              </button>
            </div>
          )}
        </form>
      </section>
      <section className="outbound-notebook-page">
        <h2 className="font-semibold">Preparation must produce evidence</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          The agent checks source-backed lead criteria, prior-contact
          exclusions, verification policy, all rendered names and
          personalisations, sequence spacing, inbox assignments, capacity and
          paused status. Changes to copy, audience or settings invalidate the
          old review. Queueing does not start paid scraping automatically.
        </p>
      </section>
      <OutboundExperimentCompare offerKey={legacy ? undefined : 'installation-booking'} />
    </div>
  );
}
