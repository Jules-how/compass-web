"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { pricingScenario } from "@/lib/planning-core.mjs";
export function OfferPlan() {
  const [offer, setOffer] = useState<Record<string, any> | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false);
  const [cost, setCost] = useState({
    monthly: "2500",
    hours: "",
    hourlyCost: "",
    tools: "",
    contribution: "",
  });
  useEffect(() => {
    void fetch("/api/offers/desk")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const row = [
          ...(d.testing || []),
          ...(d.live || []),
          ...(d.retired || []),
        ].find((x) => x.offer.offer_key === "installation-booking");
        if (!row) throw new Error("Current offer could not be found.");
        setOffer(row.offer);
        setCost((c) => ({
          ...c,
          monthly: String(row.offer.retainer_low_aud ?? ""),
        }));
      })
      .catch((e) => setError(e.message));
  }, []);
  let result: ReturnType<typeof pricingScenario> | null = null;
  try {
    result = pricingScenario(cost);
  } catch {}
  async function saveScenario() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "note",
          id: `planning.note.${crypto.randomUUID()}`,
          data: {
            title: "Ads + booking — pricing scenario",
            status: "idea",
            body: `Working scenario, not approved pricing or validated client value.\nInputs: ${JSON.stringify(cost)}\nCalculated result: ${JSON.stringify(result)}\nExcludes acquisition costs, general overhead, tax and unexpected work.`,
            links: "/sales/offer-plan",
          },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setSaved("Scenario saved to Goals & notes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const addons = [
    [
      "Additional enquiry stream or integration",
      "A second source or system needs its own workflow",
      "Mapping, testing, monitoring and exception handling",
      "Quote incremental setup and recurring support; avoid unlimited custom work.",
    ],
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="compass-page-title">Offer & economics</h1>
          <p className="compass-page-subtitle">
            One clear service, the reason to buy, and the work needed to deliver
            it.
          </p>
        </div>
        <Link className="compass-btn-secondary" href="/sales/offers">
          Open offer records
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <section className="compass-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="compass-section-label">
              Current offer · {offer?.gtm_status || "loading"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {offer?.name || "Ads + booking"}
            </h2>
            <p className="mt-3 text-base leading-relaxed">
              {offer?.one_sentence || "Loading the current offer from Compass…"}
            </p>
          </div>
          <div className="rounded-xl bg-orange-50 p-5">
            <p className="text-2xl font-semibold">
              A${offer?.retainer_low_aud?.toLocaleString("en-AU") || "—"} /
              proposed renewal
            </p>
            <p className="mt-2 max-w-xs text-sm text-neutral-600">
              Commercial proposal only. Pilot scope, media, acceptance and
              renewal need agreement. No GST while unregistered.
            </p>
          </div>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        {[
          [
            "Who buys",
            "Established Greater Sydney residential ducted installation/replacement businesses. Qualify demand opportunity, capacity, contribution, client-funded media budget and office cooperation. Existing enquiries or a booking leak are not required.",
          ],
          [
            "What the client gets",
            "Focused Google Search acquisition plus a managed enquiry-to-quote-appointment path: capture, qualification, booking, reminders, human handoff and reporting.",
          ],
          [
            "What Switchflow builds",
            "One tested, reusable workflow with clear ownership, monitoring and exception handling. The value is ongoing operation and improvement; a collection of tools alone does not justify a retainer.",
          ],
        ].map(([h, p]) => (
          <section key={h} className="compass-panel p-5">
            <h2 className="text-lg font-semibold">{h}</h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">{p}</p>
          </section>
        ))}
      </div>
      <section className="compass-panel p-6">
        <h2 className="text-lg font-semibold">Why this scope first?</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {[
            [
              "1 · Acquire",
              "Focused Google Search for the agreed residential installation offer and service area, with client-funded media.",
            ],
            [
              "2 · Qualify and book",
              "Capture homeowner details, qualify the enquiry and book the agreed next step around the installer’s process.",
            ],
            [
              "3 · Reconcile",
              "Track attended appointments and later quote/won outcomes. Separate acquisition results, delivery effort and client economics.",
            ],
          ].map(([h, p]) => (
            <div key={h} className="rounded-xl border border-stone-200 p-4">
              <h3 className="font-medium">{h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {p}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-neutral-600">
          Your benefit: a repeatable delivery process and recurring revenue
          toward the agreed business goal. Client benefit: suitable new
          enquiries, a clear next step and visible appointment outcomes. Both
          remain hypotheses until measured.
        </p>
      </section>
      <section className="compass-panel p-6">
        <h2 className="text-lg font-semibold">
          Optional work, priced separately
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          These are scoping options, not included services or approved prices.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {addons.map(([title, when, scope, price]) => (
            <div key={title} className="rounded-xl border border-stone-200 p-5">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm">
                <strong>When:</strong> {when}
              </p>
              <p className="mt-3 text-sm text-neutral-600">{scope}</p>
              <p className="mt-3 text-sm text-neutral-600">{price}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="compass-panel p-6">
        <h2 className="text-lg font-semibold">
          Does the price make economic sense?
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
          Enter a scenario. Include Jules’ supervision, fixes and maintenance in
          human hours. Use the client’s contribution per additional installation
          after their variable costs, not the full invoice value.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["monthly", "Monthly fee (AUD)"],
            ["hours", "Your hours / month"],
            ["hourlyCost", "Your cost / hour (AUD)"],
            ["tools", "Tools / month (AUD)"],
            ["contribution", "Client contribution / win (AUD)"],
          ].map(([k, label]) => (
            <label key={k} className="text-sm">
              {label}
              <input
                type="number"
                min="0"
                step="any"
                className="compass-input mt-1 w-full"
                value={cost[k as keyof typeof cost]}
                onChange={(e) => {
                  setSaved("");
                  setCost((c) => ({ ...c, [k]: e.target.value }));
                }}
              />
            </label>
          ))}
        </div>
        {result ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs text-neutral-500">Monthly delivery cost</p>
              <p className="mt-2 text-xl font-semibold">
                A${result.deliveryCost.toFixed(0)}
              </p>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs text-neutral-500">
                Contribution before other overheads
              </p>
              <p className="mt-2 text-xl font-semibold">
                A${result.contributionBeforeOverheads.toFixed(0)} ·{" "}
                {result.margin?.toFixed(0) ?? "—"}%
              </p>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs text-neutral-500">
                Additional client wins needed to cover fee
              </p>
              <p className="mt-2 text-xl font-semibold">
                {result.extraWinsToCoverFee ?? "Enter contribution per win"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-neutral-500">
            Enter the fee, hours, hourly cost and tools to calculate. Unknown
            costs are not assumed to be zero.
          </p>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          This is a scenario, not a forecast or proof of incremental wins. It
          excludes acquisition costs, general overhead and tax. Setup work needs
          a separate estimate.
        </p>
        <button
          disabled={!result || busy}
          className="compass-btn-secondary mt-4"
          onClick={() => void saveScenario()}
        >
          Save scenario to notes
        </button>
        {saved && (
          <p role="status" className="mt-3 text-sm text-green-800">
            {saved}
          </p>
        )}
      </section>
      <section className="compass-panel p-6">
        <h2 className="text-lg font-semibold">
          Questions that decide the offer
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          The Whimsical board is a source of ideas. These questions can confirm,
          narrow or reject the proposed service.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[
            [
              "Is there a valuable problem?",
              "Review recent real enquiries with the owner: eligible volume, response time, contact attempts, booking, attendance and won jobs. A slow response alone is not proof of lost revenue.",
            ],
            [
              "What actually limits growth?",
              "Separate insufficient demand, weak qualification, slow follow-up, low quote acceptance and full installation capacity. Choose the service that addresses the demonstrated constraint.",
            ],
            [
              "Would improvement pay for the service?",
              "Estimate recoverable opportunities, realistic close rates and contribution per additional job. Compare with the fee and all other incremental costs; do not use revenue as profit.",
            ],
            [
              "Why pay monthly?",
              "Specify ongoing monitoring, exceptions, reporting and improvement. If the work is mainly a one-off fix, consider a setup project plus lighter maintenance instead of forcing a retainer.",
            ],
            [
              "Can we measure and deliver it?",
              "Agree the enquiry source, consent and contact rules, booking qualification, human handoff and access to attended, quoted and won outcomes. Separate attributed results from proven incremental lift.",
            ],
            [
              "What would make us stop?",
              "No meaningful booking gap, too little eligible volume, no estimating capacity, inadequate job economics or no usable outcome data means narrow the scope or decline the pilot. Agent count is not a success metric.",
            ],
          ].map(([h, p]) => (
            <div key={h} className="rounded-xl border border-stone-200 p-4">
              <h3 className="font-medium">{h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {p}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-neutral-600">
          Market question: how many unique, suitable businesses can we actually
          reach, with relevant published contact details? Directory listings,
          branches and all HVAC contractors are not the addressable market. Team
          size and review counts are screening clues, not proof of budget or
          pain.
        </p>
      </section>
      <section className="compass-panel p-6">
        <h2 className="text-lg font-semibold">Before you promise results</h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Confirm eligible enquiry volume, the booking gap, available capacity,
          expected job contribution and who owns technical handoffs. Track
          contacted → qualified → booked → attended → quoted → won. Advertising,
          SEO, websites and unlimited integrations are excluded from the base
          service.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/clients" className="compass-btn-primary">
            Prepare client agreement
          </Link>
          <Link href="/sales/experiments" className="compass-btn-secondary">
            Plan an email test
          </Link>
          <Link href="/planning" className="compass-btn-secondary">
            Goals & notes
          </Link>
        </div>
      </section>
    </div>
  );
}
