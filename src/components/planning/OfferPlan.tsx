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
            title: "Installation booking — pricing scenario",
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
      "Google Search acquisition",
      "Eligible enquiries are insufficient",
      "Campaign setup, management and paid media budget",
      "Quote setup and management from scoped effort; media is a separate client cost.",
    ],
    [
      "Landing page",
      "The existing page cannot support the agreed enquiry journey",
      "One defined page, tracking and handoff",
      "Quote the build once; ongoing changes are separate unless agreed.",
    ],
    [
      "Additional enquiry stream or integration",
      "A second source or system needs its own workflow",
      "Mapping, testing, monitoring and exception handling",
      "Quote incremental setup and recurring support; avoid unlimited custom work.",
    ],
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap justify-between gap-3">
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
        <div className="flex flex-wrap justify-between gap-5">
          <div className="max-w-2xl">
            <p className="compass-section-label">
              Current offer · {offer?.gtm_status || "loading"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {offer?.name || "Installation booking"}
            </h2>
            <p className="mt-3 text-base leading-relaxed">
              {offer?.one_sentence || "Loading the current offer from Compass…"}
            </p>
          </div>
          <div className="rounded-xl bg-orange-50 p-5">
            <p className="text-2xl font-semibold">
              A${offer?.retainer_low_aud?.toLocaleString("en-AU") || "—"} /
              month
            </p>
            <p className="mt-2 max-w-xs text-sm text-neutral-600">
              Retainer direction to test. Setup, start date and cancellation
              need agreement. No GST while unregistered.
            </p>
          </div>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        {[
          [
            "Who buys",
            "Established Sydney residential ducted installation/replacement businesses with existing enquiries, a demonstrable response or booking gap, estimating capacity and access to outcomes.",
          ],
          [
            "What the client gets",
            "A managed route from an eligible enquiry to a suitable quote appointment. Response, qualification, scheduling, reminders, human handoff and reporting for one agreed enquiry stream.",
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
              "1 · Existing enquiries",
              "Best first test when a booking gap exists. Fewer delivery dependencies and a repeatable process.",
            ],
            [
              "2 · Ads + booking",
              "Use when demand is the constraint and acquisition delivery is ready. More scope, spend and attribution complexity; quote separately.",
            ],
            [
              "3 · Bespoke AI build",
              "Use for a specific funded requirement. It can be valuable, but each custom build increases scoping and maintenance effort.",
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
          toward the 2–4 client goal. Client benefit: fewer eligible enquiries
          left without a next step and clear appointment outcomes. Both remain
          hypotheses until measured.
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
