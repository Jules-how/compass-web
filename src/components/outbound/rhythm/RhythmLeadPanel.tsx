"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  OUTCOMES,
  localDateTimeToIso,
  isOpen,
  callWindow,
  restrictionReason,
  type RhythmLead,
  type RhythmTask,
  type RhythmTouch,
} from "@/lib/outbound-rhythm";
const endpoint = "/api/operator/outbound/rhythm";
export const field =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600";
export const button =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50";
const zones = [
  "Australia/Perth",
  "Australia/Sydney",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Hobart",
  "Australia/Melbourne",
];
export function when(value: string | null, zone = "Australia/Sydney") {
  if (!value) return "No date";
  try {
    return (
      new Intl.DateTimeFormat("en-AU", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)) +
      " · " +
      zone.split("/")[1]
    );
  } catch {
    return value;
  }
}
function localInput(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function RhythmLeadPanel({
  leadId,
  onSaved,
}: {
  leadId: string;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<{
      lead: RhythmLead;
      tasks: RhythmTask[];
      touches: RhythmTouch[];
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<keyof typeof OUTCOMES>("no_answer"),
    [channel, setChannel] = useState("call"),
    [direction, setDirection] = useState("outbound"),
    [note, setNote] = useState(""),
    [person, setPerson] = useState("");
  const [disposition, setDisposition] = useState("unresolved"),
    [zone, setZone] = useState(""),
    [due, setDue] = useState(""),
    [title, setTitle] = useState(""),
    [nextChannel, setNextChannel] = useState("call"),
    [reason, setReason] = useState(""),
    [accepted, setAccepted] = useState(false),
    [restriction, setRestriction] = useState("unknown"),
    [smsBasis, setSmsBasis] = useState("");
  const [complete, setComplete] = useState(""),
    [additional, setAdditional] = useState(false),
    [edit, setEdit] = useState<RhythmTask | null>(null),
    [occurred, setOccurred] = useState(new Date().toISOString());
  const request = useRef<{ body: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(endpoint + "?lead=" + encodeURIComponent(leadId), {
      cache: "no-store",
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setData(body);
    return body;
  }, [leadId]);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    setEdit(null);
    setComplete("");
    request.current = null;
    fetch(endpoint + "?lead=" + encodeURIComponent(leadId), {
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (live) {
          setData(b);
          setZone(b.lead.rhythm_timezone || "");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [leadId]);
  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const raw = JSON.stringify(payload);
      if (!request.current || request.current.body !== raw)
        request.current = { body: raw, id: crypto.randomUUID() };
      const body = {
        ...payload,
        ...(payload.operation === "capture"
          ? { request_id: request.current.id }
          : {}),
      };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      request.current = null;
      await load();
      setNotice("Saved. Your history and next action are up to date.");
      onSaved?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div aria-busy={!error}>
        {error ? (
          <p role="alert">
            {error}{" "}
            <button
              className={button}
              onClick={() => load().catch((e) => setError(e.message))}
            >
              Retry
            </button>
          </p>
        ) : (
          <p role="status">Loading contact…</p>
        )}
      </div>
    );
  const { lead, tasks, touches } = data;
  const open = tasks.filter(isOpen);
  async function save() {
    setNotice("");
    setError("");
    try {
      const next =
        disposition === "schedule" || edit
          ? {
              title,
              channel: nextChannel,
              reason,
              timezone: zone,
              due: localDateTimeToIso(due, zone),
              state: accepted ? "accepted" : "proposed",
              sms_basis: smsBasis,
            }
          : undefined;
      const action = open.find((t) => t.id === complete);
      const payload = edit
        ? {
            operation: "task",
            lead_id: leadId,
            revision: lead.rhythm_revision,
            task_id: edit.id,
            expected_updated_at: edit.updated_at,
            next,
          }
        : {
            operation: "capture",
            lead_id: leadId,
            revision: lead.rhythm_revision,
            occurred_at: occurred,
            channel,
            direction,
            outcome,
            note,
            person_reached: person,
            disposition,
            restriction: outcome === "do_not_contact" ? restriction : undefined,
            next,
            task_id: action?.id,
            expected_updated_at: action?.updated_at,
            complete_task: !!action,
            additional,
          };
      if (await send(payload)) {
        setNote("");
        setPerson("");
        setComplete("");
        setAdditional(false);
        setEdit(null);
        setOccurred(new Date().toISOString());
        setDisposition("unresolved");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the form");
    }
  }
  return (
    <section
      className="space-y-4"
      aria-label="Outreach history and next action"
    >
      <div>
        <h3 className="font-display text-xl">
          {lead.company || lead.name || "Contact"}
        </h3>
        <div className="flex flex-wrap gap-3 text-sm">
          {lead.phone && (
            <a className="underline" href={"tel:" + lead.phone}>
              {lead.phone}
            </a>
          )}
          {lead.email && (
            <a className="underline" href={"mailto:" + lead.email}>
              {lead.email}
            </a>
          )}
        </div>
        <p className="mt-1 text-xs text-stone-600">
          {callWindow(lead.rhythm_timezone) ||
            "Within the local calling window"}
        </p>
        {lead.instantly_campaign_id && (
          <p className="mt-2 text-sm">
            Email sequence state needs checking before another channel.{" "}
            <a
              className="underline"
              target="_blank"
              rel="noreferrer"
              href={
                "https://app.instantly.ai/app/campaign/" +
                encodeURIComponent(lead.instantly_campaign_id)
              }
            >
              Review in Instantly
            </a>
          </p>
        )}
        {restrictionReason(lead, "call") && (
          <p className="text-sm text-red-800">
            {restrictionReason(lead, "call")}
          </p>
        )}
      </div>
      {lead.rhythm_selected_at && !open.length && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            send({
              operation: "select",
              lead_id: leadId,
              revision: lead.rhythm_revision,
              selected: false,
              timezone: lead.rhythm_timezone || zone || "Australia/Sydney",
            })
          }
        >
          Remove from my outreach queue
        </button>
      )}
      {!lead.rhythm_selected_at && (
        <div className="space-y-2">
          <label className="block text-sm">
            Prospect timezone
            <select
              className={field}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">Choose timezone</option>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <button
            className={button}
            disabled={busy || !zone}
            onClick={() =>
              send({
                operation: "select",
                lead_id: leadId,
                revision: lead.rhythm_revision,
                selected: true,
                timezone: zone,
              })
            }
          >
            Add to my outreach queue
          </button>
        </div>
      )}
      <div>
        <h4 className="font-semibold">Next actions</h4>
        {!open.length ? (
          <p className="text-sm text-stone-600">No open action.</p>
        ) : (
          <ul className="space-y-3">
            {open.map((t) => (
              <li key={t.id} className="rounded-lg border border-stone-200 p-3">
                <p>{t.title}</p>
                <p className="text-xs text-stone-600">
                  {t.outreach_state} ·{" "}
                  {when(t.due, t.outreach_timezone || "Australia/Sydney")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      setEdit(t);
                      setTitle(t.title);
                      setReason(t.outreach_reason || "");
                      setNextChannel(t.outreach_channel || "call");
                      setZone(t.outreach_timezone || "");
                      setDue("");
                      setAccepted(t.outreach_state === "accepted");
                    }}
                  >
                    Reschedule / edit
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      send({
                        operation: "task",
                        lead_id: leadId,
                        revision: lead.rhythm_revision,
                        task_id: t.id,
                        expected_updated_at: t.updated_at,
                        task_status: "completed",
                      })
                    }
                  >
                    Complete action
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      setComplete(t.id);
                      setDisposition("closed");
                      setNote("");
                      setEdit(null);
                    }}
                  >
                    Close with reason
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-3"
        aria-describedby={error ? "rhythm-form-error" : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h4 className="font-semibold">
          {edit ? "Edit next action" : "Log outcome or plan a next action"}
        </h4>
        {!edit && (
          <>
            <label className="block text-sm">
              Outcome
              <select
                className={field}
                value={outcome}
                onChange={(e) => {
                  const value = e.target.value as keyof typeof OUTCOMES;
                  setOutcome(value);
                  if (value === "next_step") {
                    setChannel("other");
                    setDisposition("schedule");
                  }
                }}
              >
                {Object.entries(OUTCOMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                Channel
                <select
                  className={field}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  {["call", "email", "sms", "other"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Direction
                <select
                  className={field}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option>outbound</option>
                  <option>inbound</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              When it happened ({zone || "Australia/Sydney"})
              <input
                className={field}
                type="datetime-local"
                required
                value={localInput(occurred, zone || "Australia/Sydney")}
                onChange={(e) => {
                  try {
                    setOccurred(
                      localDateTimeToIso(
                        e.target.value,
                        zone || "Australia/Sydney",
                      ),
                    );
                    setError("");
                  } catch (error) {
                    setError(
                      error instanceof Error ? error.message : "Check the time",
                    );
                  }
                }}
              />
            </label>
            <label className="block text-sm">
              Person / role reached
              <input
                className={field}
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                maxLength={250}
              />
            </label>
            <label className="block text-sm">
              Short note / buyer’s words
              <textarea
                className={field}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={4000}
                required={disposition === "closed"}
              />
            </label>
            {outcome === "do_not_contact" && (
              <label className="block text-sm">
                Restriction scope
                <select
                  className={field}
                  value={restriction}
                  onChange={(e) => setRestriction(e.target.value)}
                >
                  {["unknown", "all", "call", "email", "sms"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              What happens next?
              <select
                className={field}
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
              >
                <option value="unresolved">
                  Keep next step visible for review
                </option>
                <option value="schedule">Schedule a next action</option>
                <option value="closed">
                  Close this outreach with a reason
                </option>
              </select>
            </label>
          </>
        )}
        {(disposition === "schedule" || edit) && (
          <>
            <label className="block text-sm">
              Next action
              <input
                className={field}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={250}
                placeholder="Call to discuss installation capacity"
              />
            </label>
            <label className="block text-sm">
              Reason
              <input
                className={field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
              />
            </label>
            <label className="block text-sm">
              Next channel
              <select
                className={field}
                value={nextChannel}
                onChange={(e) => setNextChannel(e.target.value)}
              >
                {["call", "email", "sms", "other"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Prospect timezone
              <select
                className={field}
                required
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                <option value="">Choose timezone</option>
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Date and time in that timezone
              <input
                className={field}
                type="datetime-local"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            {nextChannel === "sms" && (
              <label className="block text-sm">
                Invitation or agreement to text
                <textarea
                  className={field}
                  required
                  value={smsBasis}
                  onChange={(e) => setSmsBasis(e.target.value)}
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I confirm this action and time
            </label>
          </>
        )}
        {!edit && open.length > 0 && (
          <>
            <label className="block text-sm">
              Complete an existing action with this entry
              <select
                className={field}
                value={complete}
                onChange={(e) => setComplete(e.target.value)}
              >
                <option value="">Keep existing actions open</option>
                {open.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {disposition !== "closed" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={additional}
                  onChange={(e) => setAdditional(e.target.checked)}
                />
                Keep this as an additional commitment
              </label>
            )}
          </>
        )}
        <button
          className={"bg-orange-700 text-white " + button}
          disabled={busy}
        >
          {busy
            ? "Saving…"
            : edit
              ? "Save next action"
              : "Save outcome and next step"}
        </button>
        {edit && (
          <button
            type="button"
            className={button}
            onClick={() => setEdit(null)}
          >
            Cancel edit
          </button>
        )}
      </form>
      {error && (
        <div
          id="rhythm-form-error"
          role="alert"
          className="text-sm text-red-800"
        >
          {error}
          <button
            className={"ml-2 " + button}
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Reload current record
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-800">
          {notice}
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          Recent history ({touches.length})
        </summary>
        <ol className="mt-2 space-y-3">
          {touches.map((t) => (
            <li key={t.id} className="border-b border-stone-200 pb-2 text-sm">
              <p>
                {t.outcome
                  ? OUTCOMES[t.outcome as keyof typeof OUTCOMES] || t.outcome
                  : "Recorded outreach"}{" "}
                · {t.channel}
              </p>
              <p className="text-xs text-stone-600">
                {when(
                  t.contacted_at,
                  lead.rhythm_timezone || "Australia/Sydney",
                )}{" "}
                · {t.source}
              </p>
              {t.person_reached && <p>{t.person_reached}</p>}
              {t.note && <p className="whitespace-pre-wrap">{t.note}</p>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
