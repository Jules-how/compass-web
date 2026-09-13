"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { RichNotebook } from "./RichNotebook";
import {
  CITIES,
  cityZone,
  sessionQueue,
  type GoalSession,
} from "@/lib/goal-actions";
import {
  OUTCOMES,
  restrictionReason,
  localDateTimeToIso,
  callWindow,
} from "@/lib/outbound-rhythm";
import { workFetch } from "@/lib/workspace-change";
import { readJson } from "./GoalsActions";
const rhythm = "/api/operator/outbound/rhythm";
async function write(url: string, payload: unknown) {
  const r = await workFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const b = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(b.error || "Save failed."), {
      status: r.status,
    });
  return b;
}
function sessionPayload(s: GoalSession) {
  return {
    id: s.data.id,
    revision: s.revision,
    goal_id: s.data.goal_id,
    city: s.data.city,
    phase: s.data.phase,
    lead_ids: s.data.lead_ids,
    priorities: s.data.priorities,
    status: s.data.status,
    due: s.data.due,
  };
}
export function NewSession({
  goalId,
  onClose,
  onSaved,
}: {
  goalId: string;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [city, setCity] = useState<(typeof CITIES)[number]>("Sydney"),
    [date, setDate] = useState(""),
    [query, setQuery] = useState(""),
    [leads, setLeads] = useState<any[]>([]),
    [selected, setSelected] = useState<Record<string, any>>({}),
    [cursor, setCursor] = useState<string | null>(null),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<any>(null);
  const [id] = useState(() => crypto.randomUUID());
  async function search(more = false) {
    setBusy(true);
    setError("");
    try {
      const d = await readJson(
        `/api/goals/actions?section=prospects&city=${city}&q=${encodeURIComponent(query)}${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setLeads((old) => (more ? [...old, ...d.leads] : d.leads));
      setCursor(d.next_cursor);
      setTotal(d.total);
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      )
        pending.current = null;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      pending.current ??= {
        id,
        request_id: crypto.randomUUID(),
        revision: 0,
        goal_id: goalId,
        city,
        phase: "warmup",
        status: "ready",
        lead_ids: Object.keys(selected),
        priorities: Object.fromEntries(
          Object.keys(selected).map((id) => [
            id,
            { tier: "unknown", reason: "" },
          ]),
        ),
        due: date || null,
      };
      const b = await write("/api/goals/actions", pending.current);
      await onSaved(b.session.id);
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      )
        pending.current = null;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame
      open
      onClose={onClose}
      label="Create city calling session"
      motion="dialog"
      overlayClassName="ga-overlay"
      contentClassName="ga-dialog"
    >
      <div className="ga-dialog-title">
        <h2>City calling session</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <p>
        Choose prospects from the existing ledger. Review their installation fit
        and priority before calling.
      </p>
      <fieldset disabled={busy || Boolean(pending.current)}>
        <div className="ga-form-row">
          <label>
            City
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value as typeof city);
                setLeads([]);
                setSelected({});
                setCursor(null);
              }}
            >
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Day · optional
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Find a company
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
            />
          </label>
          <button onClick={() => void search()}>Find prospects</button>
        </div>
        <div className="ga-prospect-pick">
          {leads.map((l) => (
            <label key={l.id}>
              <input
                type="checkbox"
                checked={Boolean(selected[l.id])}
                disabled={
                  !l.phone || Boolean(l.is_archived) || l.icp_status === "fail"
                }
                onChange={(e) =>
                  setSelected((old) => {
                    const n = { ...old };
                    if (e.target.checked) n[l.id] = l;
                    else delete n[l.id];
                    return n;
                  })
                }
              />
              <span>
                <b>{l.company || l.name}</b>
                <small>
                  {l.phone || "Phone missing"} ·{" "}
                  {l.vertical || "Trade unverified"} · Fit:{" "}
                  {l.icp_status || "Unreviewed"}
                </small>
              </span>
            </label>
          ))}
        </div>
        {cursor && (
          <button onClick={() => void search(true)}>
            Load more · {leads.length} of {total}
          </button>
        )}
        <p>
          {Object.keys(selected).length} selected ·{" "}
          {cityZone(city).replace("Australia/", "")} time
        </p>
      </fieldset>
      {error && (
        <p className="ga-notice" role="alert">
          {error}
          {pending.current && " Retry sends the same request."}
        </p>
      )}
      <button
        className="ga-primary"
        disabled={busy || (!Object.keys(selected).length && !pending.current)}
        onClick={() => void save()}
      >
        {busy
          ? "Saving…"
          : pending.current
            ? "Retry session save"
            : "Create session"}
      </button>
    </ModalFrame>
  );
}
export function CallSession({
  session,
  onBack,
  onChanged,
}: {
  session: GoalSession;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [leadId, setLeadId] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [priorities, setPriorities] = useState(session.data.priorities);
  const pending = useRef<any>(null);
  const [editBase, setEditBase] = useState<GoalSession | null>(null);
  const load = useCallback(
    () =>
      readJson(`/api/goals/actions?section=session&id=${session.id}`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [session.id],
  );
  useEffect(() => {
    void load();
  }, [load, session.revision]);
  useEffect(() => {
    if (!editing) setPriorities(session.data.priorities);
  }, [session.revision, session.data.priorities, editing]);
  async function save(patch: Record<string, unknown>, base = session) {
    setBusy(true);
    setError("");
    try {
      pending.current ??= {
        ...sessionPayload(base),
        ...patch,
        request_id: crypto.randomUUID(),
      };
      await write("/api/goals/actions", pending.current);
      pending.current = null;
      setEditing(false);
      setEditBase(null);
      await onChanged();
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      )
        pending.current = null;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="ga-paper">
        <button onClick={onBack}>← Weekly board</button>
        <p role={error ? "alert" : "status"}>{error || "Loading session…"}</p>
      </div>
    );
  const eligible = data.leads
    .filter(
      (l: any) =>
        !restrictionReason(l, "call") &&
        !l.is_archived &&
        l.icp_status !== "fail" &&
        !data.tasks.some(
          (t: any) =>
            t.lead_id === l.id &&
            t.outreach_state === "accepted" &&
            t.due &&
            Date.parse(t.due) > Date.now(),
        ),
    )
    .map((l: any) => l.id);
  const promises = data.tasks
    .filter(
      (t: any) =>
        t.outreach_state === "accepted" &&
        t.due &&
        Date.parse(t.due) <= Date.now(),
    )
    .sort((a: any, b: any) => Date.parse(a.due) - Date.parse(b.due))
    .map((t: any) => t.lead_id);
  const queue = sessionQueue(session, eligible, [...new Set<string>(promises)]);
  return (
    <div className="ga-session">
      <div className="ga-board-tools">
        <button onClick={onBack}>← Weekly board</button>
        <h2>{session.data.city} calls</h2>
        <span>
          {session.data.handled_ids?.length || 0} outcomes ·{" "}
          {session.data.lead_ids.length} prospects
        </span>
        <button
          disabled={busy || Boolean(pending.current)}
          onClick={() => {
            if (!editing) {
              setEditBase(session);
              setPriorities(session.data.priorities);
            }
            setEditing((v) => !v);
          }}
        >
          Review priorities
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void save({
              status: session.data.status === "paused" ? "ready" : "paused",
            })
          }
        >
          {session.data.status === "paused" ? "Resume" : "Pause"}
        </button>
        <button
          disabled={busy}
          onClick={() => void save({ status: "finished" })}
        >
          Finish session
        </button>
      </div>
      {error && (
        <p role="alert" className="ga-notice">
          {error}
          {pending.current && (
            <button onClick={() => void save({})}>Retry same save</button>
          )}
        </p>
      )}
      {session.data.status !== "ready" && (
        <p className="ga-notice">
          Session {session.data.status}.{" "}
          <button onClick={() => void save({ status: "ready" })}>
            Resume session
          </button>{" "}
          Finishing a session keeps its task available for your completion
          review.
        </p>
      )}
      {editing ? (
        <div className="ga-paper">
          <h3>Priority and evidence</h3>
          <p>
            Use commercial fit, timing or capacity, a buying trigger, and access
            to the decision-maker. Unknown details stay unknown.
          </p>
          {editBase && editBase.revision !== session.revision && (
            <div className="ga-notice" role="alert">
              This session changed while you were editing. Your draft is
              retained.
              <details>
                <summary>Compare the latest saved priorities</summary>
                {data.leads.map((l: any) => (
                  <p key={l.id}>
                    {l.company || l.name}:{" "}
                    {session.data.priorities[l.id]?.tier || "unknown"} ·{" "}
                    {session.data.priorities[l.id]?.reason ||
                      "No evidence recorded"}
                  </p>
                ))}
              </details>
              <button
                disabled={busy || Boolean(pending.current)}
                onClick={() => {
                  setEditBase(session);
                  setError("");
                }}
              >
                I reviewed the changes; keep my edited priorities
              </button>
            </div>
          )}
          <fieldset disabled={busy || Boolean(pending.current)}>
            {data.leads.map((l: any) => (
              <div className="ga-priority-row" key={l.id}>
                <b>{l.company || l.name}</b>
                <select
                  aria-label={`Priority for ${l.company || l.name}`}
                  value={priorities[l.id]?.tier || "unknown"}
                  onChange={(e) =>
                    setPriorities({
                      ...priorities,
                      [l.id]: {
                        tier: e.target.value as any,
                        reason: priorities[l.id]?.reason || "",
                      },
                    })
                  }
                >
                  <option value="unknown">Unranked</option>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="lower">Lower priority</option>
                </select>
                <input
                  aria-label={`Evidence for ${l.company || l.name}`}
                  placeholder="Why this priority? Source or call evidence"
                  value={priorities[l.id]?.reason || ""}
                  onChange={(e) =>
                    setPriorities({
                      ...priorities,
                      [l.id]: {
                        tier: priorities[l.id]?.tier || "unknown",
                        reason: e.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}
          </fieldset>
          <button
            disabled={
              busy ||
              (editBase?.revision !== session.revision && !pending.current)
            }
            onClick={() => void save({ priorities }, editBase || session)}
          >
            Save priorities
          </button>
        </div>
      ) : (
        <>
          <div className="ga-session-phases" aria-label="Calling phase">
            {[
              { key: "warmup", label: `Warm up · ${queue.warm.length}` },
              { key: "priority", label: `Priority · ${queue.priority.length}` },
              { key: "finish", label: `Finish · ${queue.finish.length}` },
            ].map((p) => (
              <button
                key={p.key}
                disabled={busy}
                aria-pressed={session.data.phase === p.key}
                onClick={() => void save({ phase: p.key })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="ga-muted">
            Due promises come first. Start the priority group whenever you feel
            ready.{" "}
            {queue.unknown.length > 0
              ? `${queue.unknown.length} prospects are still unranked.`
              : ""}
          </p>
          <div className="ga-prospect-grid">
            {queue.ordered.map((id) => {
              const l = data.leads.find((l: any) => l.id === id);
              return (
                <button
                  className="ga-prospect"
                  key={id}
                  onClick={() => setLeadId(id)}
                >
                  <span className="ga-card-kind">
                    {queue.due.includes(id)
                      ? "Due promise"
                      : session.data.priorities[id]?.tier || "Unranked"}
                  </span>
                  <strong>{l.company || l.name}</strong>
                  <span>
                    {l.name && l.name !== l.company
                      ? `${l.name}${l.role ? ` · ${l.role}` : ""}`
                      : "Owner not verified"}
                  </span>
                  <b>{l.phone}</b>
                  <small>
                    {session.data.priorities[id]?.reason ||
                      "Priority evidence not recorded"}
                  </small>
                </button>
              );
            })}
          </div>
          {!queue.ordered.length && (
            <p className="ga-empty">
              No eligible prospects remain in this phase. Switch phase or review
              priorities.
            </p>
          )}
          <details className="ga-paper">
            <summary>Completed outcomes and held prospects</summary>
            {data.leads
              .filter((l: any) => !queue.ordered.includes(l.id))
              .map((l: any) => (
                <button
                  className="ga-evidence-row"
                  key={l.id}
                  onClick={() => setLeadId(l.id)}
                >
                  {l.company || l.name} ·{" "}
                  {session.data.handled_ids?.includes(l.id)
                    ? "Outcome recorded"
                    : restrictionReason(l, "call") ||
                      "Another phase / fit review"}
                </button>
              ))}
          </details>
        </>
      )}
      {leadId && (
        <ContactPanel
          key={leadId}
          leadId={leadId}
          session={session}
          onClose={() => setLeadId("")}
          onSaved={async () => {
            setLeadId("");
            await onChanged();
            await load();
          }}
        />
      )}
    </div>
  );
}
function ContactPanel({
  leadId,
  session,
  onClose,
  onSaved,
}: {
  leadId: string;
  session: GoalSession;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pane, setPane] = useState("Context"),
    [handoff, setHandoff] = useState(false);
  const [outcome, setOutcome] = useState(""),
    [note, setNote] = useState(""),
    [conversation, setConversation] = useState(false),
    [signals, setSignals] = useState<string[]>([]),
    [nextTitle, setNextTitle] = useState(""),
    [due, setDue] = useState(""),
    [nextChannel, setNextChannel] = useState("call"),
    [smsBasis, setSmsBasis] = useState(""),
    [disposition, setDisposition] = useState("unresolved"),
    [complete, setComplete] = useState(""),
    [additional, setAdditional] = useState(false),
    [restriction, setRestriction] = useState("unknown");
  const pending = useRef<any>(null),
    dialRef = useRef<HTMLAnchorElement>(null);
  const load = useCallback(async () => {
    const d = await readJson(`${rhythm}?lead=${encodeURIComponent(leadId)}`);
    setData(d);
    return d;
  }, [leadId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const dirty = Boolean(outcome || note || nextTitle || pending.current);
  const close = () => {
    if (
      !dirty ||
      window.confirm(
        "Discard the unsaved call outcome? Notebook drafts remain available.",
      )
    )
      onClose();
  };
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  async function dial() {
    setBusy(true);
    setError("");
    try {
      const d = await load();
      const blocked = restrictionReason(d.lead, "call");
      if (blocked || d.lead.is_archived || d.lead.icp_status === "fail")
        throw new Error(blocked || "Review this business before calling.");
      const phone = String(d.lead.phone).replace(/[^+0-9]/g, "");
      if (!/^\+?\d{6,15}$/.test(phone))
        throw new Error("Review the stored phone number before calling.");
      if (dialRef.current) {
        dialRef.current.href = `tel:${phone}`;
        dialRef.current.click();
        setHandoff(true);
      }
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      )
        pending.current = null;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!pending.current) {
        const task = data.tasks.find((t: any) => t.id === complete);
        pending.current = {
          operation: "capture",
          lead_id: leadId,
          revision: data.lead.rhythm_revision,
          request_id: crypto.randomUUID(),
          occurred_at: new Date().toISOString(),
          channel: "call",
          direction: "outbound",
          outcome,
          note,
          person_reached: "",
          disposition: due ? "schedule" : disposition,
          goal_id: session.data.goal_id,
          session_id: session.data.id,
          conversation,
          signals: conversation ? signals : [],
          ...(outcome === "do_not_contact" ? { restriction } : {}),
          ...(nextTitle
            ? {
                next: {
                  title: nextTitle,
                  channel: nextChannel,
                  reason: note.slice(0, 2000),
                  timezone: cityZone(session.data.city),
                  ...(due
                    ? {
                        due: localDateTimeToIso(
                          due,
                          cityZone(session.data.city),
                        ),
                      }
                    : {}),
                  state: due ? "accepted" : "proposed",
                  ...(nextChannel === "sms" ? { sms_basis: smsBasis } : {}),
                },
              }
            : {}),
          ...(task
            ? {
                task_id: task.id,
                expected_updated_at: task.updated_at,
                complete_task: true,
              }
            : {}),
          additional,
        };
      }
      await write(rhythm, pending.current);
      pending.current = null;
      await onSaved();
    } catch (e) {
      if (
        (e as { status?: number }).status &&
        (e as { status: number }).status < 500
      )
        pending.current = null;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalFrame
      open
      onClose={close}
      label={data?.lead.company || "Prospect"}
      motion="dialog"
      overlayClassName="ga-overlay"
      contentClassName="ga-dialog ga-contact-dialog"
    >
      <div className="ga-dialog-title">
        <div>
          <h2>{data?.lead.company || "Loading prospect…"}</h2>
          <p>
            {data?.lead.name || "Owner not verified"}
            {data?.lead.role ? ` · ${data.lead.role}` : ""}
          </p>
        </div>
        <button onClick={close}>Close</button>
      </div>
      {error && (
        <p className="ga-notice" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="ga-contact-bar">
            <strong>{data.lead.phone || "Phone missing"}</strong>
            <button
              className="ga-primary"
              disabled={
                busy ||
                Boolean(restrictionReason(data.lead, "call")) ||
                session.data.status !== "ready"
              }
              onClick={() => void dial()}
            >
              Call with phone app
            </button>
            <a ref={dialRef} hidden aria-hidden="true" tabIndex={-1}>
              Phone handoff
            </a>
            <span>
              {cityZone(session.data.city)} ·{" "}
              {callWindow(cityZone(session.data.city)) ||
                "Within usual calling hours"}
            </span>
          </div>
          {handoff && (
            <p className="ga-notice">
              Phone app opened. Record the actual outcome when you return.
            </p>
          )}
          <div className="ga-controls">
            <nav aria-label="Contact views">
              {["Context", "Contact history", "Notebook", "Record outcome"].map(
                (p) => (
                  <button
                    key={p}
                    aria-current={pane === p ? "page" : undefined}
                    onClick={() => setPane(p)}
                  >
                    {p}
                  </button>
                ),
              )}
            </nav>
          </div>
          {pane === "Context" && (
            <div className="ga-paper">
              <dl>
                <dt>Installation fit</dt>
                <dd>{data.lead.icp_status || "Not reviewed"}</dd>
                <dt>Estimated revenue / team size</dt>
                <dd>Use sourced research below; no estimate assumed.</dd>
                <dt>Website</dt>
                <dd>
                  {/^https?:\/\//.test(data.lead.website || "") ? (
                    <a
                      href={data.lead.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {data.lead.website}
                    </a>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
                <dt>Research checked</dt>
                <dd>
                  {data.lead.lead_context_updated_at
                    ? new Date(
                        data.lead.lead_context_updated_at,
                      ).toLocaleDateString("en-AU")
                    : "Unknown"}
                </dd>
              </dl>
              <h3>Saved business research</h3>
              <Research value={data.lead.lead_facts} />
              {data.tasks
                .filter(
                  (t: any) => !["completed", "cancelled"].includes(t.status),
                )
                .map((t: any) => (
                  <a
                    className="ga-evidence-row"
                    key={t.id}
                    href={`/sales/outbound/rhythm?lead=${leadId}`}
                  >
                    {t.title} ·{" "}
                    {t.due
                      ? new Date(t.due).toLocaleString("en-AU", {
                          timeZone:
                            t.outreach_timezone || cityZone(session.data.city),
                        })
                      : "Date unresolved"}
                  </a>
                ))}
            </div>
          )}
          {pane === "Contact history" && (
            <div className="ga-paper">
              <p>
                Latest {data.historyLimit} recorded interactions. Missing
                provider history is not proof that no email was sent.
              </p>
              {data.touches.map((t: any) => (
                <article className="ga-evidence-row" key={t.id}>
                  <strong>
                    {t.channel} · {t.outcome || t.source}
                  </strong>
                  <span>
                    {new Date(t.contacted_at).toLocaleString("en-AU")}
                  </span>
                  <p>{t.note || "Message body / summary not recorded."}</p>
                </article>
              ))}
              {!data.touches.length && (
                <p>No interaction history is recorded here.</p>
              )}
              <p>
                Last recorded outbound:{" "}
                {data.lead.last_outbound_at
                  ? new Date(data.lead.last_outbound_at).toLocaleString("en-AU")
                  : "Unknown"}{" "}
                · {data.lead.instantly_campaign_name || "No linked campaign"}
              </p>
            </div>
          )}
          {pane === "Notebook" && (
            <RichNotebook
              subject={{ kind: "contact", id: leadId }}
              tasks={data.tasks}
            />
          )}
          {pane === "Record outcome" && (
            <form
              className="ga-outcome-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy || Boolean(pending.current)}>
                <label>
                  What happened?
                  <select
                    required
                    value={outcome}
                    onChange={(e) => {
                      setOutcome(e.target.value);
                      if (e.target.value === "do_not_contact") {
                        setNextTitle("");
                        setDue("");
                        setDisposition("closed");
                      }
                      if (
                        ["no_answer", "invalid_route", "next_step"].includes(
                          e.target.value,
                        )
                      ) {
                        setConversation(false);
                        setSignals([]);
                      }
                    }}
                  >
                    <option value="">Choose outcome</option>
                    {Object.entries(OUTCOMES)
                      .filter(([k]) => k !== "next_step")
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={conversation}
                    disabled={["no_answer", "invalid_route"].includes(outcome)}
                    onChange={(e) => setConversation(e.target.checked)}
                  />{" "}
                  A sales conversation took place
                </label>
                {conversation && (
                  <div className="ga-signals">
                    {[
                      ["value", "Seems valuable"],
                      ["demand", "Seems wanted"],
                      ["next_step", "Conversation advancing"],
                      ["meeting_booked", "Next meeting booked"],
                    ].map(([id, label]) => (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={signals.includes(id)}
                          onChange={(e) =>
                            setSignals((s) =>
                              e.target.checked
                                ? [...s, id]
                                : s.filter((v) => v !== id),
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
                <label>
                  Outcome notes
                  <textarea
                    required
                    value={note}
                    maxLength={4000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                {outcome === "do_not_contact" ? (
                  <label>
                    Contact restriction
                    <select
                      value={restriction}
                      onChange={(e) => setRestriction(e.target.value)}
                    >
                      <option value="unknown">
                        Unclear — hold all contact
                      </option>
                      <option value="all">All channels</option>
                      <option value="call">Calls</option>
                      <option value="email">Email</option>
                      <option value="sms">Texts</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label>
                      Promised next action · optional
                      <input
                        value={nextTitle}
                        maxLength={250}
                        onChange={(e) => setNextTitle(e.target.value)}
                      />
                    </label>
                    {nextTitle && (
                      <div className="ga-form-row">
                        <label>
                          Channel
                          <select
                            value={nextChannel}
                            onChange={(e) => setNextChannel(e.target.value)}
                          >
                            {["call", "email", "sms", "other"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Agreed time · {session.data.city}
                          <input
                            type="datetime-local"
                            value={due}
                            onChange={(e) => setDue(e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    {nextTitle && nextChannel === "sms" && (
                      <label>
                        Invitation to text
                        <input
                          required
                          value={smsBasis}
                          onChange={(e) => setSmsBasis(e.target.value)}
                        />
                      </label>
                    )}
                    {!due && (
                      <label>
                        Follow-up state
                        <select
                          value={disposition}
                          onChange={(e) => setDisposition(e.target.value)}
                        >
                          <option value="unresolved">
                            Keep next action / date unresolved
                          </option>
                          <option value="closed">
                            No follow-up needed (reason in notes)
                          </option>
                        </select>
                      </label>
                    )}
                  </>
                )}
                <label>
                  Complete the action this call fulfilled
                  <select
                    value={complete}
                    onChange={(e) => setComplete(e.target.value)}
                  >
                    <option value="">Keep existing tasks open</option>
                    {data.tasks
                      .filter(
                        (t: any) =>
                          !["completed", "cancelled"].includes(t.status),
                      )
                      .map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={additional}
                    onChange={(e) => setAdditional(e.target.checked)}
                  />{" "}
                  Keep a separate additional promise alongside open actions
                </label>
              </fieldset>
              <button className="ga-primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : pending.current
                    ? "Retry same outcome"
                    : "Save outcome & follow-up"}
              </button>
              {error && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await load();
                      pending.current = null;
                      setError(
                        "Current contact reloaded. Review the history and your draft before saving again.",
                      );
                    } catch (e) {
                      if (
                        (e as { status?: number }).status &&
                        (e as { status: number }).status < 500
                      )
                        pending.current = null;
                      setError((e as Error).message);
                    }
                  }}
                >
                  Reload contact and review draft
                </button>
              )}
            </form>
          )}
        </>
      )}
    </ModalFrame>
  );
}
function Research({ value }: { value: any }) {
  if (!value || !Object.keys(value).length)
    return <p>Business context has not been researched yet.</p>;
  return (
    <div className="ga-research">
      {Object.entries(value).map(([key, v]) => (
        <div key={key}>
          <h4>{key.replaceAll("_", " ")}</h4>
          {typeof v === "string" ? (
            <p>{v}</p>
          ) : (
            <pre>{JSON.stringify(v, null, 2)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
