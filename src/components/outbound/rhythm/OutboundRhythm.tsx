"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dayKey,
  callWindow,
  restrictionReason,
  type RhythmLead,
  type RhythmTask,
  type RhythmTouch,
} from "@/lib/outbound-rhythm";
import { RhythmLeadPanel, button, field, when } from "./RhythmLeadPanel";
const endpoint = "/api/operator/outbound/rhythm";
type Payload = {
  commercial: {
    signed: number;
    paymentReceipts: number;
    paidAud: number;
    scope: string;
  } | null;
  checkedAt: string;
  since: string;
  leads: RhythmLead[];
  tasks: RhythmTask[];
  touches: RhythmTouch[];
  preferences: {
    revision: number;
    call_target: number;
    ready_days: number;
    accepted: boolean;
  };
  ready: string[];
  shortfall: number;
  due: string[];
  unresolved: string[];
  replies: string[];
  metrics: Record<string, number>;
  partial: boolean;
  reportCoverage: string;
  emailSchedule: { message: string };
  work: { id: string; day: string; category: string; minutes: number }[];
};
export function OutboundRhythm({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState("today"),
    [query, setQuery] = useState(""),
    [found, setFound] = useState<RhythmLead[]>([]);
  const [target, setTarget] = useState(10),
    [days, setDays] = useState(2),
    [minutes, setMinutes] = useState(""),
    [category, setCategory] = useState("selling"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [newCompany, setNewCompany] = useState(""),
    [newPhone, setNewPhone] = useState(""),
    [newCity, setNewCity] = useState(""),
    [phoneSource, setPhoneSource] = useState("");
  const workRequest = useRef<{ body: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    setData(b);
    setTarget(b.preferences.call_target);
    setDays(b.preferences.ready_days);
    setError("");
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    if (!compact)
      setSelected(new URLSearchParams(window.location.search).get("lead"));
    const update = () => void load().catch((e) => setError(e.message));
    window.addEventListener("outbound-rhythm-changed", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("outbound-rhythm-changed", update);
      window.removeEventListener("focus", update);
    };
  }, [load, compact]);
  const changed = () =>
    window.dispatchEvent(new Event("outbound-rhythm-changed"));
  async function save(payload: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await load();
      setNotice("Saved.");
      changed();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function search() {
    setBusy(true);
    try {
      const r = await fetch(endpoint + "?q=" + encodeURIComponent(query));
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setFound(b.leads);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }
  if (compact)
    return (
      <section className="folio-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Outreach today</h2>
          <Link className="text-sm underline" href="/sales/outbound/rhythm">
            Open your queue →
          </Link>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm">
            Outreach queue unavailable.{" "}
            <button
              onClick={() => load().catch((e) => setError(e.message))}
              className={button}
            >
              Retry
            </button>
          </p>
        ) : data ? (
          <p className="mt-2 text-sm">
            {data.due.length} due ·{" "}
            {data.unresolved.length + data.replies.length} need review ·{" "}
            {data.ready.length} ready to call
            {data.partial ? " · partial coverage" : ""}
          </p>
        ) : (
          <p role="status">Loading outreach…</p>
        )}
      </section>
    );
  const leadMap = new Map(data?.leads.map((l) => [l.id, l]) || []);
  const today = dayKey(new Date());
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(Date.now() + i * 86400000)),
  );
  const row = (lead: RhythmLead, task?: RhythmTask, label?: string) => (
    <li key={task?.id || lead.id} className="border-b border-stone-200 py-3">
      <button
        className="w-full rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
        onClick={() => setSelected(lead.id)}
      >
        <span className="block font-semibold">{lead.company || lead.name}</span>
        <span className="block text-sm">
          {task?.title || label || "New contact"}
        </span>
        <span className="block text-xs text-stone-600">
          {task
            ? `${task.outreach_state} · ${task.outreach_channel} · ${when(task.due, task.outreach_timezone || "Australia/Sydney")}`
            : lead.phone || lead.email}
        </span>
        <span className="block text-xs text-stone-600">
          {restrictionReason(lead, task?.outreach_channel || "call") ||
            ((task?.outreach_channel || "call") === "call"
              ? callWindow(task?.outreach_timezone || lead.rhythm_timezone)
              : "")}
        </span>
      </button>
    </li>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-stone-600">Sales / Outbound</p>
          <h1 className="font-display text-3xl">Your outreach rhythm</h1>
          <p className="mt-1 text-sm text-stone-600">
            Keep each conversation moving.
          </p>
        </div>
        <button
          className={button}
          onClick={() => load().catch((e) => setError(e.message))}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading your queue…</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Outreach views">
            {[
              ["today", "Today"],
              ["upcoming", "Next seven days"],
              ["ready", "Ready queue"],
              ["review", "Weekly review"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={
                  button + (tab === key ? " bg-orange-100" : " bg-white")
                }
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {data.partial && (
            <p role="alert">
              This view reached its cohort limit. Counts are partial; narrow the
              selection before using the weekly totals.
            </p>
          )}
          <div
            className={
              "grid gap-6 " +
              (selected
                ? "xl:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]"
                : "")
            }
          >
            <div className="min-w-0 space-y-5">
              {tab === "today" && (
                <section className="folio-paper p-5">
                  <h2 className="font-display text-2xl">
                    Due and needing attention
                  </h2>
                  <p className="mt-1 text-sm text-stone-600">
                    Promises first, then unresolved next steps.
                  </p>
                  <ul>
                    {data.tasks
                      .filter(
                        (t) =>
                          data.due.includes(t.id) ||
                          data.unresolved.includes(t.id),
                      )
                      .map((t) =>
                        leadMap.has(t.lead_id)
                          ? row(leadMap.get(t.lead_id)!, t)
                          : null,
                      )}
                    {data.replies.map((id) =>
                      row(
                        leadMap.get(id)!,
                        undefined,
                        "Reply needs review — open the conversation",
                      ),
                    )}
                  </ul>
                  {!data.due.length &&
                    !data.unresolved.length &&
                    !data.replies.length && (
                      <p className="py-4 text-sm">
                        No due commitments in your selected cohort.
                      </p>
                    )}
                  <h3 className="mt-4 font-semibold">Next new contacts</h3>
                  <ul>
                    {data.ready
                      .slice(0, data.preferences.call_target)
                      .map((id) => row(leadMap.get(id)!))}
                  </ul>
                </section>
              )}
              {tab === "upcoming" && (
                <section className="folio-paper p-5">
                  <h2 className="font-display text-2xl">Known commitments</h2>
                  {dayKeys.map((day) => (
                    <div key={day} className="mt-4">
                      <h3 className="font-semibold">
                        {day === today ? "Today" : day} · Sydney date
                      </h3>
                      <ul>
                        {data.tasks
                          .filter((t) => t.due && dayKey(t.due) === day)
                          .map((t) => row(leadMap.get(t.lead_id)!, t))}
                      </ul>
                      {!data.tasks.some(
                        (t) => t.due && dayKey(t.due) === day,
                      ) && (
                        <p className="text-sm text-stone-600">
                          No actions scheduled.
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="mt-5 text-sm text-stone-600">
                    {data.emailSchedule.message}{" "}
                    <a
                      className="underline"
                      href="https://app.instantly.ai/app/campaigns"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Instantly
                    </a>
                  </p>
                  <h3 className="mt-4 font-semibold">Later / without a date</h3>
                  <ul>
                    {data.tasks
                      .filter((t) => !t.due || dayKey(t.due) > dayKeys[6])
                      .map((t) => row(leadMap.get(t.lead_id)!, t))}
                  </ul>
                </section>
              )}
              {tab === "ready" && (
                <section className="folio-paper space-y-4 p-5">
                  <h2 className="font-display text-2xl">
                    Keep the next block ready
                  </h2>
                  <p>
                    {data.ready.length} usable calling contacts ·{" "}
                    {data.shortfall} below the{" "}
                    {data.preferences.accepted ? "agreed" : "proposed"} target.
                  </p>
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save({
                        operation: "preferences",
                        revision: data.preferences.revision,
                        call_target: target,
                        ready_days: days,
                      });
                    }}
                  >
                    <label className="text-sm">
                      Calls per selling day
                      <input
                        className={field}
                        type="number"
                        min="0"
                        max="200"
                        value={target}
                        onChange={(e) => setTarget(Number(e.target.value))}
                      />
                    </label>
                    <label className="text-sm">
                      Days prepared
                      <input
                        className={field}
                        type="number"
                        min="1"
                        max="14"
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                      />
                    </label>
                    <button className={button} disabled={busy}>
                      Confirm workload
                    </button>
                  </form>
                  <p className="text-sm text-stone-600">
                    A shortfall is a preparation cue. It does not start a paid
                    list run or change your calendar.
                  </p>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void search();
                    }}
                  >
                    <label className="grow text-sm">
                      Find an existing prospect
                      <input
                        className={field}
                        required
                        minLength={2}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Company, email or phone"
                      />
                    </label>
                    <button className={button} disabled={busy}>
                      Search
                    </button>
                  </form>
                  <ul>
                    {found.map((l) =>
                      row(l, undefined, "Open to review and select"),
                    )}
                  </ul>
                  <details>
                    <summary className="cursor-pointer font-semibold">
                      Add a published calling contact
                    </summary>
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setBusy(true);
                        void fetch(endpoint + "/leads", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            company: newCompany,
                            phone: newPhone,
                            city: newCity,
                            phone_source_url: phoneSource,
                          }),
                        })
                          .then(async (r) => {
                            const b = await r.json();
                            if (!r.ok || !b.ok)
                              throw new Error(
                                b.error || "Contact could not be saved",
                              );
                            const id =
                              b.receipts?.[0]?.id ||
                              b.skipped?.[0]?.existing_id;
                            if (!id)
                              throw new Error(
                                b.skipped?.[0]?.reason ||
                                  "No contact identity returned",
                              );
                            setSelected(id);
                            setNotice(
                              "Contact saved. Review its timezone and add it to the queue.",
                            );
                            setNewCompany("");
                            setNewPhone("");
                            setPhoneSource("");
                          })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      <label className="block text-sm">
                        Company
                        <input
                          required
                          className={field}
                          value={newCompany}
                          onChange={(e) => setNewCompany(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm">
                        Published phone
                        <input
                          required
                          type="tel"
                          className={field}
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm">
                        City
                        <input
                          required
                          className={field}
                          value={newCity}
                          onChange={(e) => setNewCity(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm">
                        Page where the number is published
                        <input
                          required
                          type="url"
                          className={field}
                          value={phoneSource}
                          onChange={(e) => setPhoneSource(e.target.value)}
                        />
                      </label>
                      <button className={button} disabled={busy}>
                        Save calling contact
                      </button>
                    </form>
                  </details>
                  <h3 className="font-semibold">
                    Selected prospects ({data.leads.length})
                  </h3>
                  <ul>
                    {data.leads.map((l) =>
                      row(
                        l,
                        undefined,
                        data.ready.includes(l.id)
                          ? "Ready for a first call"
                          : "Review history / contact eligibility",
                      ),
                    )}
                  </ul>
                </section>
              )}
              {tab === "review" && (
                <section className="folio-paper space-y-5 p-5">
                  <h2 className="font-display text-2xl">Last seven days</h2>
                  <p className="text-sm text-stone-600">
                    {data.reportCoverage}
                  </p>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {Object.entries(data.metrics).map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-sm text-stone-600">
                          {key.replace(/([A-Z])/g, " $1")}
                        </dt>
                        <dd className="font-display text-2xl">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm">
                    {data.commercial
                      ? `${data.commercial.signed} agreements signed · ${data.commercial.paymentReceipts} payment receipts · A$${data.commercial.paidAud.toFixed(2)} recorded. ${data.commercial.scope}`
                      : "Commercial receipts unavailable; no revenue inferred."}
                  </p>
                  <p className="text-sm">
                    Review signed work and payment receipts in{" "}
                    <Link className="underline" href="/sales/pipeline">
                      your commercial pipeline
                    </Link>
                    ; these are not inferred from calls or replies.
                  </p>
                  <div className="rounded-lg bg-orange-50 p-3">
                    <h3 className="font-semibold">What to learn next</h3>
                    <p className="text-sm">
                      {data.metrics.callAttempts < 10
                        ? "Insufficient evidence for a pattern. Keep the offer stable and capture more conversations."
                        : data.metrics.decisionMakerConversations === 0
                          ? "The recorded calls have not established decision-maker conversations. Review contact routes and the actual office responses before rewriting the offer."
                          : "Review the recorded decision-maker conversations and agreed next steps. Choose one evidenced constraint to test next; these counts alone cannot identify a winning offer."}
                    </p>
                  </div>
                  <h3 className="font-semibold">Your recorded time</h3>
                  <p>
                    {["preparation", "selling", "systems"]
                      .map(
                        (c) =>
                          `${c}: ${data.work.filter((w) => w.category === c).reduce((a, w) => a + w.minutes, 0)} min`,
                      )
                      .join(" · ")}
                  </p>
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = JSON.stringify({
                        day: today,
                        category,
                        minutes: Number(minutes),
                        note: "",
                      });
                      if (workRequest.current?.body !== body)
                        workRequest.current = { body, id: crypto.randomUUID() };
                      void save({
                        operation: "work",
                        request_id: workRequest.current.id,
                        ...JSON.parse(body),
                      }).then((ok) => {
                        if (ok) {
                          workRequest.current = null;
                          setMinutes("");
                        }
                      });
                    }}
                  >
                    <label className="text-sm">
                      Today’s work
                      <select
                        className={field}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {["selling", "preparation", "systems"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Minutes
                      <input
                        className={field}
                        type="number"
                        min="1"
                        max="1440"
                        required
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                      />
                    </label>
                    <button className={button} disabled={busy}>
                      Record time
                    </button>
                  </form>
                </section>
              )}
              <p className="text-xs text-stone-600">
                Queue checked {when(data.checkedAt)}. No messages are sent from
                this view.
              </p>
            </div>
            {selected && (
              <aside className="folio-paper min-w-0 p-4">
                <button
                  className={button + " mb-4"}
                  onClick={() => setSelected(null)}
                >
                  Close contact
                </button>
                <RhythmLeadPanel
                  key={selected}
                  leadId={selected}
                  onSaved={changed}
                />
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
