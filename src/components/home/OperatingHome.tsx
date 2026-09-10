"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { OutboundOverview } from "@/components/outbound/OutboundOverview";
import { ArrowRight, Check, Plus, RefreshCw } from "lucide-react";
import {
  FolioDialog,
  FolioFolders,
  FolioNotice,
} from "@/components/folio/FolioPrimitives";
import { workFetch, onWorkChanged } from "@/lib/workspace-change";
import { sydneyDay, safeLink, type WorkTask } from "@/lib/operating-core";
import type { loadOperatingDay } from "@/lib/operating-server";

type Day = Awaited<ReturnType<typeof loadOperatingDay>>;
export function OperatingHome() {
  const [data, setData] = useState<Day | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [day, setDay] = useState(sydneyDay()),
    [view, setView] = useState<"day" | "week" | "month" | "sources">("day");
  const [domain, setDomain] = useState("all"),
    [selected, setSelected] = useState<WorkTask | null>(null);
  const [capture, setCapture] = useState(false),
    [body, setBody] = useState(""),
    [commitment, setCommitment] = useState(false),
    [due, setDue] = useState(""),
    [personal, setPersonal] = useState(false);
  const [notice, setNotice] = useState("");
  const readVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++readVersion.current;
    try {
      const r = await fetch(`/api/operating?day=${day}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Unable to load your work");
      if (version !== readVersion.current) return;
      setData(b);
      setError("");
    } catch (e) {
      if (version !== readVersion.current) return;
      setError(e instanceof Error ? e.message : "Unable to load");
    }
  }, [day]);
  useEffect(() => {
    void reload();
    const unsubscribe = onWorkChanged(() => void reload());
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [reload]);
  const refreshAttempt = useRef(0);
  const providerChecked = data?.sources.find((s) => s.id === "source:instantly")
    ?.data.checked_at;
  useEffect(() => {
    if (
      !data ||
      Date.now() - Date.parse(providerChecked || "1970-01-01") < 300000 ||
      Date.now() - refreshAttempt.current < 300000
    )
      return;
    refreshAttempt.current = Date.now();
    void fetch("/api/operating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    })
      .then(async (r) => {
        if (!r.ok)
          setError("Provider refresh failed; previous evidence retained");
        await reload();
      })
      .catch(() =>
        setError("Provider refresh failed; previous evidence retained"),
      );
  }, [data, providerChecked, reload]);
  useEffect(() => {
    try {
      const previous = localStorage.getItem("compass.home.brainDump");
      if (previous) setBody(previous);
    } catch {}
  }, []);
  async function mutate(command: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await workFetch("/api/operating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Unable to save");
      if (b.ok === false)
        throw new Error(b.failures?.join(", ") || "Source refresh failed");
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function captureWork() {
    const request_id = crypto.randomUUID(),
      title = body.trim().split("\n")[0].slice(0, 200);
    const command = commitment
      ? {
          action: "task",
          request_id,
          key: `capture:${request_id}`,
          task: { title, notes: body, status: "not-started", due: due || null },
          context: {
            domain: personal ? "personal" : "business",
            reason: body,
            next_action: title,
            done_when: "Fulfil the commitment and record the result.",
            source: "Jules · Home capture",
            source_kind: "explicit",
            state: "ready",
            owner: "Jules",
          },
        }
      : {
          action: "record",
          request_id,
          id: `capture:${request_id}`,
          revision: 0,
          kind: "capture",
          data: {
            body,
            source: "Jules · Home capture",
            source_kind: "explicit",
            domain: personal ? "personal" : "business",
            observed_at: new Date().toISOString(),
            resolved: false,
          },
        };
    if (await mutate(command)) {
      setCapture(false);
      setBody("");
      setDue("");
      setNotice(
        commitment
          ? "Commitment saved in Tasks and your queue."
          : "Captured with its source. It is available for the next review.",
      );
    }
  }
  const matches = (t: WorkTask) =>
    domain === "all" || (t.operating_context?.domain || "business") === domain;
  const queue = (data?.queue || []).filter(matches),
    next = queue[0];
  const relatedProject = (t: WorkTask) =>
    data?.projects.find((p: any) => p.id === t.project_id);
  function calendarList(events: Day["calendar"]) {
    const visible = events.filter(
      (e) =>
        domain === "all" || e.domain === domain || e.domain === "unclassified",
    );
    return (
      <section className="operating-section">
        <h3>Calendar commitments</h3>
        {visible.length ? (
          <ul className="operating-list">
            {visible.map((e) => (
              <li key={e.id} className="operating-row">
                <div>
                  {e.url ? <a href={e.url}>{e.title}</a> : e.title}
                  <p className="folio-small">
                    {new Date(e.start).toLocaleString("en-AU", {
                      timeZone: "Australia/Sydney",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {e.domain === "unclassified" ? "Calendar" : e.domain}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="folio-small">
            No commitments in the reviewed calendar window. Check source
            coverage before treating time as available.
          </p>
        )}
      </section>
    );
  }
  function workRow(t: WorkTask, why?: string) {
    return (
      <li key={t.id} className="operating-row">
        <button onClick={() => setSelected(t)}>
          <span>{t.title}</span>
          <small>
            {why ||
              (t.status === "blocked"
                ? t.operating_context?.blocker || "Blocked"
                : "") ||
              t.operating_context?.next_action ||
              t.notes?.slice(0, 120) ||
              "Open task context"}
            {t.due ? ` · Due ${t.due.slice(0, 10)}` : ""}
          </small>
        </button>
        <span className="folio-status">
          {t.operating_context?.domain === "personal"
            ? "Personal"
            : relatedProject(t)?.name || t.task_type || "Work"}
        </span>
      </li>
    );
  }
  return (
    <main className="folio-home operating-home">
      <header className="folio-page-heading">
        <div>
          <h1>Your next move.</h1>
          <p>One queue, with the work behind it.</p>
        </div>
        <div className="folio-actions">
          <button
            className="compass-btn-secondary"
            disabled={busy}
            onClick={() => void mutate({ action: "refresh" })}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {busy ? "Working…" : "Check campaigns"}
          </button>
          <button
            className="compass-btn-primary"
            onClick={() => setCapture(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Capture
          </button>
        </div>
      </header>
      {error ? (
        <FolioNotice error>
          <span role="alert">
            {error}. {data ? "Your previous view is retained. " : ""}
          </span>
          <button onClick={() => void reload()}>Retry</button>
        </FolioNotice>
      ) : null}
      {notice ? (
        <p role="status" className="folio-small">
          {notice}
        </p>
      ) : null}
      <div className="operating-toolbar">
        <FolioFolders
          value={view}
          onChange={setView}
          label="Planning horizon"
          items={[
            { id: "day", label: "Your day" },
            { id: "week", label: "This week" },
            { id: "month", label: "This month" },
            { id: "sources", label: "Sources & preparation" },
          ]}
        />
        <button
          className="compass-btn-ghost"
          onClick={() => setDay(sydneyDay())}
        >
          Today
        </button>
        <button
          className="compass-btn-ghost"
          onClick={() => {
            const d = new Date(`${sydneyDay()}T12:00:00Z`);
            d.setUTCDate(d.getUTCDate() + 1);
            setDay(d.toISOString().slice(0, 10));
          }}
        >
          Tomorrow
        </button>
        <label>
          Day{" "}
          <input
            aria-label="Planning day"
            type="date"
            value={day}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value);
            }}
          />
        </label>
        <label>
          Show{" "}
          <select value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="all">Everything</option>
            <option value="business">Business</option>
            <option value="personal">Personal</option>
          </select>
        </label>
      </div>
      {!data ? (
        <p role="status">Loading current work…</p>
      ) : view === "day" ? (
        <div className="folio-home-layout">
          <article className="folio-paper">
            <div className="folio-paper-meta">
              <p className="folio-caption">
                {day} ·{" "}
                {data.review?.data.status === "accepted"
                  ? "Reviewed order"
                  : "Morning review"}
              </p>
              <span className="folio-status">
                {queue.length} available actions
              </span>
            </div>
            {data.interruption && domain === "all" ? (
              <FolioNotice>
                <strong>A change to review.</strong>
                <p>
                  New priority work is ready. Your reviewed order is retained.
                  Compare the proposed order below before changing this section.
                </p>
                <details>
                  <summary>Proposed order</summary>
                  <ol>
                    {data.recommended.slice(0, 8).map((id: string) => (
                      <li key={id}>
                        {data.queue.find((t: WorkTask) => t.id === id)?.title}
                      </li>
                    ))}
                  </ol>
                </details>
                <button
                  className="compass-btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void mutate({
                      action: "review_day",
                      request_id: crypto.randomUUID(),
                      day,
                      revision: data.review?.revision || 0,
                      task_ids: data.recommended,
                      task_versions: Object.fromEntries(
                        data.queue.map((t) => [t.id, t.updated_at]),
                      ),
                    })
                  }
                >
                  Use proposed order
                </button>
              </FolioNotice>
            ) : null}
            <section className="operating-next">
              <p className="folio-caption">Do next</p>
              <h2>{next?.title || "No ready action in this view."}</h2>
              <p>
                {next?.operating_context?.reason ||
                  next?.reason ||
                  "Review proposed work, resolve a blocker, or capture your next commitment."}
              </p>
              {next ? (
                <>
                  <p className="folio-small">
                    {next.reason}
                    {next.operating_context?.estimate_minutes
                      ? ` · About ${next.operating_context.estimate_minutes} minutes`
                      : ""}
                  </p>
                  <button
                    className="compass-btn-primary"
                    onClick={() => setSelected(next)}
                  >
                    Open the work <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </section>
            {data.review?.data.status !== "accepted" &&
            queue.length &&
            domain === "all" ? (
              <div className="folio-actions">
                <button
                  disabled={busy}
                  className="compass-btn-secondary"
                  onClick={() =>
                    void mutate({
                      action: "review_day",
                      request_id: crypto.randomUUID(),
                      day,
                      revision: data.review?.revision || 0,
                      task_ids: data.queue.map((t: WorkTask) => t.id),
                      task_versions: Object.fromEntries(
                        data.queue.map((t) => [t.id, t.updated_at]),
                      ),
                    })
                  }
                >
                  Accept morning queue
                </button>
                <p className="folio-small">
                  Keeps this order while you work. Later changes are proposed.
                </p>
              </div>
            ) : null}
            <section className="operating-section">
              <h2>Close alternatives</h2>
              <ul className="operating-list">
                {queue.slice(1, 6).map((t) => workRow(t, t.reason))}
              </ul>
              {queue.length > 6 ? (
                <details>
                  <summary>All {queue.length} available actions</summary>
                  <ul className="operating-list">
                    {queue.slice(6).map((t) => workRow(t, t.reason))}
                  </ul>
                </details>
              ) : null}
              {queue.length < 2 ? (
                <p className="folio-small">
                  No other ready actions in this view.
                </p>
              ) : null}
            </section>
            {data.confirmation.filter(matches).length ? (
              <section className="operating-section">
                <h2>Finished work to confirm</h2>
                <ul className="operating-list">
                  {data.confirmation
                    .filter(matches)
                    .map((t) => workRow(t, "Evidence ready for your review"))}
                </ul>
              </section>
            ) : null}
            {data.proposals.filter(matches).length ? (
              <section className="operating-section">
                <h2>Proposed work</h2>
                <ul className="operating-list">
                  {data.proposals
                    .filter(matches)
                    .map((t) =>
                      workRow(t, "Review before including in your day"),
                    )}
                </ul>
              </section>
            ) : null}
          </article>
          <aside className="operating-aside">
            {domain !== "personal" ? (
              <section>
                <OutboundOverview compact />
                <h2>Campaigns</h2>
                {data.campaigns.map((c: any) => (
                  <div key={c.id} className="operating-campaign">
                    <Link href={`/sales/outbound/editor/${c.id}`}>
                      {c.name}
                    </Link>
                    <strong>
                      {c.provider?.status || "Not checked"} ·{" "}
                      {c.provider?.sent ?? "Unknown"} sent
                    </strong>
                    <p>
                      {c.preparations
                        .map(
                          (p: any) =>
                            `${p.data.lead_ids.length} ${p.data.status}`,
                        )
                        .join(" · ") || "No preparation receipt registered"}
                    </p>
                    <small>
                      {c.provider?.observed_at
                        ? `Provider checked ${new Date(c.provider.observed_at).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit" })}`
                        : "Provider state needs checking"}
                    </small>
                  </div>
                ))}
              </section>
            ) : null}
            {calendarList(data.calendar)}
            <section>
              <h2>Waiting</h2>
              <ul className="operating-list">
                {data.waiting.filter(matches).map((t) => workRow(t, t.reason))}
              </ul>
              {!data.waiting.filter(matches).length ? (
                <p>No recorded blockers.</p>
              ) : null}
            </section>
            <section>
              <h2>Coverage</h2>
              <p>{data.capacity.message}</p>
              {data.sources
                .filter((s) => s.data.status !== "current")
                .map((s) => (
                  <p key={s.id}>
                    <strong>{s.data.name}</strong> · {s.data.status}
                  </p>
                ))}
              <button
                className="compass-btn-ghost"
                onClick={() => setView("sources")}
              >
                Inspect sources
              </button>
            </section>
          </aside>
        </div>
      ) : view === "week" || view === "month" ? (
        <article className="folio-paper">
          <p className="folio-caption">
            {data.horizons[view].from} to {data.horizons[view].to}
          </p>
          <h2>
            {view === "week" ? "The week ahead" : "This month’s direction"}
          </h2>
          <p className="folio-small">
            Existing commitments and linked goals. Targets are separate from
            completed work.
          </p>
          <div className="operating-goals">
            {data.goals
              .filter(
                (g: any) =>
                  domain === "all" || (g.data.domain || "business") === domain,
              )
              .map((g: any) => (
                <section key={g.id}>
                  <Link href={`/planning?record=${g.id}`}>
                    <h3>{g.data.title}</h3>
                  </Link>
                  <p>
                    {g.data.status === "draft" ? "Proposed" : "Agreed"} · Due{" "}
                    {g.data.due || "not set"}
                  </p>
                  <p>
                    {g.tasks.length} linked open actions ·{" "}
                    {g.data.measurementType === "qualitative"
                      ? "Outcome"
                      : `${g.data.regular ?? "Target not set"} ${g.data.unit}`}
                  </p>
                  {g.data.criteria ? <p>{g.data.criteria}</p> : null}
                  {!g.tasks.length ? (
                    <p className="folio-small">No execution work linked yet.</p>
                  ) : null}
                </section>
              ))}
          </div>
          {calendarList(data.horizons[view].calendar)}
          <h3>Dated work</h3>
          <ul className="operating-list">
            {data.horizons[view].tasks
              .filter(matches)
              .map((t: WorkTask) => workRow(t))}
          </ul>
          <h3>Current projects</h3>
          {data.projects
            .filter(
              (p: any) =>
                !["completed", "canceled", "cancelled", "archived"].includes(
                  p.status,
                ) &&
                (p.status === "active" ||
                  p.operating_context?.state === "ready" ||
                  p.operating_context?.state === "awaiting_confirmation") &&
                (domain === "all" ||
                  (p.operating_context?.domain || "business") === domain),
            )
            .map((p: any) => (
              <section key={p.id} className="operating-section">
                <Link href={`/projects/${p.id}`}>{p.name}</Link>
                <p>
                  {p.operating_context?.reason ||
                    p.summary ||
                    "Project context has not been captured."}
                </p>
                <p className="folio-small">
                  {p.operating_context?.next_action}
                </p>
              </section>
            ))}
        </article>
      ) : (
        <article className="folio-paper">
          <h2>What Compass knows</h2>
          <p>
            Source updates describe observed facts. Missing access or failed
            checks remain visible.
          </p>
          {data.sources.map((s) => (
            <section key={s.id} className="operating-section">
              <h3>
                {s.data.name}{" "}
                <span className="folio-status">{s.data.status}</span>
              </h3>
              <p>{s.data.coverage}</p>
              <p className="folio-small">
                {s.data.checked_at
                  ? `Checked ${s.data.checked_at}`
                  : "Not yet checked"}
                {s.data.error ? ` · ${s.data.error}` : ""}
              </p>
            </section>
          ))}
          <h2>Prepared work</h2>
          {data.preparations.map((p: any) => (
            <section key={p.id} className="operating-section">
              <h3>{p.data.title || p.id}</h3>
              <p>
                {p.data.lead_ids.length} {p.data.status} recipients ·{" "}
                {p.data.source}
              </p>
              {p.data.url && safeLink(p.data.url) ? (
                <a className="compass-btn-secondary" href={p.data.url}>
                  Open review
                </a>
              ) : null}
              <details>
                <summary>Exact records</summary>
                <ul>
                  {p.data.lead_ids.map((id: string) => (
                    <li key={id}>
                      <Link href={`/leads?q=${encodeURIComponent(id)}`}>
                        {id}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ))}
          <h2>Preparation jobs</h2>
          {data.runs.map((r: any) => (
            <p key={r.id}>
              {r.id} · {r.status}
              {r.error ? ` · ${r.error}` : ""}
            </p>
          ))}
          <h2>Captured for review</h2>
          {data.captures.map((c: any) => (
            <section className="operating-section" key={c.id}>
              <p style={{ whiteSpace: "pre-wrap" }}>{c.data.body}</p>
              <small>
                {c.data.source_kind} · {c.data.source}
              </small>
            </section>
          ))}
        </article>
      )}
      <FolioDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title || "Task"}
      >
        {selected ? (
          <>
            <p className="folio-caption">
              {selected.operating_context?.domain || "business"} ·{" "}
              {selected.operating_context?.owner || "Jules"} · {selected.status}
            </p>
            <h3>Why this matters</h3>
            <p>
              {selected.operating_context?.reason ||
                selected.notes ||
                "No context recorded."}
            </p>
            <h3>Next action</h3>
            <p>{selected.operating_context?.next_action || selected.title}</p>
            <h3>Done when</h3>
            <p>
              {selected.operating_context?.done_when ||
                "Confirm the outcome after completing the task."}
            </p>
            {selected.notes &&
            selected.notes !== selected.operating_context?.reason ? (
              <details>
                <summary>Working notes and materials</summary>
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                  {selected.notes}
                </p>
              </details>
            ) : null}
            {selected.operating_context?.links
              ?.filter((l) => safeLink(l.url))
              .map((l) => (
                <p key={l.url}>
                  <a className="compass-btn-secondary" href={l.url}>
                    {l.label}
                    <ArrowRight size={14} aria-hidden="true" />
                  </a>
                </p>
              ))}
            {selected.operating_context?.evidence?.map((e, i) => (
              <p key={i}>
                {e.detail}
                <br />
                <small>
                  {e.source} · {e.at}
                </small>
              </p>
            ))}
            <p className="folio-small">
              Source:{" "}
              {selected.operating_context?.source ||
                selected.source ||
                "Existing Compass task"}
            </p>
            <div className="folio-dialog-actions">
              {selected.operating_context?.state === "proposed" ? (
                <button
                  disabled={busy}
                  className="compass-btn-primary"
                  onClick={async () => {
                    if (
                      await mutate({
                        action: "task",
                        request_id: crypto.randomUUID(),
                        key: selected.id,
                        id: selected.id,
                        expected_updated_at: selected.updated_at,
                        task: { title: selected.title },
                        context: {
                          ...selected.operating_context,
                          state: "ready",
                        },
                      })
                    )
                      setSelected(null);
                  }}
                >
                  Include in queue
                </button>
              ) : null}
              <button
                disabled={busy}
                className="compass-btn-secondary"
                onClick={async () => {
                  if (
                    await mutate({
                      action: "complete",
                      request_id: crypto.randomUUID(),
                      id: selected.id,
                      expected_updated_at: selected.updated_at,
                    })
                  )
                    setSelected(null);
                }}
              >
                <Check size={15} aria-hidden="true" />
                Confirm complete
              </button>
              <Link className="compass-btn-ghost" href="/tasks">
                Open Tasks
              </Link>
            </div>
            {error ? <p role="alert">{error}</p> : null}
          </>
        ) : null}
      </FolioDialog>
      <FolioDialog
        open={capture}
        onClose={() => setCapture(false)}
        title="Capture what happened"
      >
        <label className="operating-field">
          Note or commitment
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened, who it concerns, and what comes next…"
          />
        </label>
        <label className="operating-field">
          <span>
            <input
              type="checkbox"
              checked={commitment}
              onChange={(e) => setCommitment(e.target.checked)}
            />{" "}
            This is a commitment. Add it to my tasks.
          </span>
        </label>
        {commitment ? (
          <label className="operating-field">
            Due date, if agreed
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
        ) : null}
        <label>
          <input
            type="checkbox"
            checked={personal}
            onChange={(e) => setPersonal(e.target.checked)}
          />{" "}
          Personal
        </label>
        <div className="folio-dialog-actions">
          <button
            disabled={busy || !body.trim()}
            className="compass-btn-primary"
            onClick={() => void captureWork()}
          >
            {busy ? "Saving…" : "Save capture"}
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </FolioDialog>
    </main>
  );
}
