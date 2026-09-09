"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Plus,
  Search,
  Target,
} from "lucide-react";
import type { PlanningRow } from "@/lib/planning-server";
import { GOAL_PERIODS } from "@/lib/planning-core.mjs";
import { workFetch } from "@/lib/workspace-change";
import { NotebookEditor } from "./NotebookEditor";

type Kind = "note" | "goal";
type DocumentHandle = { flush: () => Promise<boolean> };
export const sydneyToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(
    new Date(),
  );
export const notebookDate = (day: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day.slice(0, 10)}T12:00:00`));
function newPage(kind: Kind): PlanningRow {
  const date = sydneyToday();
  return {
    id: `planning.${kind}.${crypto.randomUUID()}`,
    kind,
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
    data:
      kind === "note"
        ? { title: "", body: "", date, goalId: "", status: "idea", links: "" }
        : {
            title: "",
            notes: "",
            start: date,
            due: "",
            period: "quarterly",
            status: "draft",
            measurementType: "quantitative",
            direction: "increase",
            regular: "",
            stretch: "",
            unit: "",
            metricDefinition: "",
            criteria: "",
            owner: "Jules",
            freshnessDays: 30,
          },
  };
}

export function PlanningBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [kind, setKind] = useState<Kind>("note");
  const [selected, setSelected] = useState<PlanningRow | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const editor = useRef<DocumentHandle>(null);
  const opened = useRef(false);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const lists = await Promise.all(
        (["note", "goal"] as const).map(async (k) => {
          const all: PlanningRow[] = [];
          for (let page = 0; page < 100; page++) {
            const r = await workFetch(`/api/planning?kind=${k}&page=${page}`, {
              cache: "no-store",
            });
            const body = await r.json();
            if (!r.ok)
              throw new Error(body.error || "Unable to open your notebook.");
            all.push(...body.records);
            if (all.length >= body.total) return all;
          }
          throw new Error("There are too many pages to load at once.");
        }),
      );
      const all = lists.flat().filter((row) => !row.data.archived);
      setRows(all);
      if (!opened.current) {
        let restored: PlanningRow | undefined;
        try {
          const last = JSON.parse(
            localStorage.getItem("compass.notebook.active") || "null",
          );
          if (last?.id) {
            restored = all.find((r) => r.id === last.id);
            if (!restored) {
              const draft = JSON.parse(
                localStorage.getItem(`compass.notebook.draft.${last.id}`) ||
                  "null",
              );
              if (
                draft?.data &&
                draft.revision === 0 &&
                ["note", "goal"].includes(last.kind)
              )
                restored = {
                  ...newPage(last.kind),
                  id: last.id,
                  createdAt: last.createdAt,
                  data: draft.data,
                };
            }
          }
        } catch {
          /* start from the server when browser storage is unavailable */
        }
        const next =
          restored ?? all.find((row) => row.kind === "note") ?? newPage("note");
        setSelected(next);
        setKind(next.kind as Kind);
        opened.current = true;
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to open your notebook.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selected)
      try {
        localStorage.setItem(
          "compass.notebook.active",
          JSON.stringify({
            id: selected.id,
            kind: selected.kind,
            createdAt: selected.createdAt,
          }),
        );
      } catch {
        /* optional navigation memory */
      }
  }, [selected]);
  const saved = useCallback((row: PlanningRow) => {
    setRows((current) =>
      [row, ...current.filter((r) => r.id !== row.id)].filter(
        (r) => !r.data.archived,
      ),
    );
  }, []);
  async function move(action: () => void) {
    if (switching) return;
    setSwitching(true);
    try {
      if (!editor.current || (await editor.current.flush())) action();
    } finally {
      setSwitching(false);
    }
  }
  const shown = rows.filter(
    (row) =>
      row.kind === kind &&
      `${row.data.title} ${row.data.body ?? row.data.notes ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const goals = rows.filter((row) => row.kind === "goal");
  return (
    <div className="planning-workspace notebook-workspace">
      <header className="planning-heading">
        <div>
          <p className="compass-section-label">Your thinking space</p>
          <h1 className="compass-page-title">Goals & notes</h1>
          <p className="compass-page-subtitle">
            A little clarity. A place to begin.
          </p>
        </div>
        <div className="planning-heading-actions">
          <button
            className="compass-btn-ghost"
            onClick={() =>
              void move(() => router.push("/planning?view=activity"))
            }
          >
            Time & activity
          </button>
          <button
            className="compass-btn-secondary"
            onClick={() => void move(() => router.push("/planning"))}
          >
            Pathfinder <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="planning-error">
          {error} <button onClick={() => void load()}>Try again</button>
        </p>
      )}
      <div className="notebook-layout" aria-busy={loading || switching}>
        <aside className="notebook-index" aria-label="Notebook pages">
          <div className="notebook-index-heading">
            <BookOpen size={17} aria-hidden="true" />
            <span>Your notebook</span>
            <button
              aria-label={`New ${kind === "note" ? "page" : "goal"}`}
              onClick={() => void move(() => setSelected(newPage(kind)))}
              disabled={switching || loading}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="notebook-folders" role="group" aria-label="Page type">
            {(["note", "goal"] as const).map((k) => (
              <button
                key={k}
                aria-pressed={kind === k}
                disabled={switching}
                onClick={() =>
                  void move(() => {
                    setKind(k);
                    setQuery("");
                    setSelected(rows.find((r) => r.kind === k) ?? newPage(k));
                  })
                }
              >
                {k === "note" ? "Notes" : "Goals"}
                <span>{rows.filter((r) => r.kind === k).length}</span>
              </button>
            ))}
          </div>
          <label className="notebook-search">
            <Search size={14} aria-hidden="true" />
            <input
              aria-label="Search notebook"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a page…"
            />
          </label>
          <p className="notebook-index-caption">
            {kind === "note"
              ? "Pages & thoughts"
              : "What you’re working towards"}
          </p>
          <ul className="notebook-page-list">
            {shown.map((row) => (
              <li key={row.id}>
                <button
                  aria-current={selected?.id === row.id ? "page" : undefined}
                  disabled={switching}
                  onClick={() => void move(() => setSelected(row))}
                >
                  {kind === "note" ? (
                    <FileText size={16} aria-hidden="true" />
                  ) : (
                    <Target size={16} aria-hidden="true" />
                  )}
                  <span>
                    <strong>{row.data.title}</strong>
                    <small>
                      {kind === "note"
                        ? notebookDate(row.data.date || row.createdAt)
                        : row.data.due
                          ? `By ${notebookDate(row.data.due)}`
                          : "Date to be decided"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!shown.length && (
            <p className="notebook-index-empty">
              {loading
                ? "Opening your pages…"
                : query
                  ? "No pages match that search."
                  : "Your next idea starts here."}
            </p>
          )}
          <button
            className="notebook-new-page"
            disabled={switching || loading}
            onClick={() => void move(() => setSelected(newPage(kind)))}
          >
            <Plus size={15} aria-hidden="true" />
            {kind === "note" ? "New page" : "New goal"}
          </button>
          <p className="notebook-index-foot">
            Think on the page.
            <br />
            Connect it in Pathfinder.
          </p>
        </aside>
        {selected ? (
          <NotebookDocument
            key={selected.id}
            ref={editor}
            row={selected}
            goals={goals}
            onSaved={saved}
            onArchived={() => setSelected(newPage(kind))}
            onPathfinder={(id) =>
              void move(() =>
                router.push(`/planning?goal=${encodeURIComponent(id)}`),
              )
            }
          />
        ) : (
          <div className="notebook-paper" role="status">
            {loading
              ? "Opening your notebook…"
              : "Your notebook could not be loaded. Try again above."}
          </div>
        )}
      </div>
    </div>
  );
}

const NotebookDocument = forwardRef<
  DocumentHandle,
  {
    row: PlanningRow;
    goals: PlanningRow[];
    onSaved: (row: PlanningRow) => void;
    onArchived: () => void;
    onPathfinder: (id: string) => void;
  }
>(function NotebookDocument(
  { row, goals, onSaved, onArchived, onPathfinder },
  ref,
) {
  const [form, setForm] = useState(row.data);
  const [status, setStatus] = useState(
    row.revision ? "All changes saved" : "New page",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [record, setRecord] = useState(row);
  const current = useRef(row.data),
    revision = useRef(row.revision),
    version = useRef(0),
    savedVersion = useRef(0);
  const inflight = useRef<Promise<boolean> | null>(null);
  const conflict = useRef(false);
  const note = row.kind === "note";
  const draftKey = `compass.notebook.draft.${row.id}`;
  const localAvailable = useRef(true);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const date =
    form.date ||
    form.start ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(
      new Date(row.createdAt),
    );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.data && typeof draft.data === "object") {
          current.current = draft.data;
          setForm(draft.data);
          version.current++;
          setDirty(true);
          if (draft.revision !== row.revision) {
            conflict.current = true;
            setError(
              "This page changed elsewhere. Your recovered draft is kept here. Copy your text before loading the newer version.",
            );
          } else setStatus("Draft recovered");
        }
      }
    } catch {
      localAvailable.current = false;
    }
    setReady(true);
  }, [draftKey, row.revision]);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "0px";
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [form.title]);
  useEffect(() => {
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width && titleRef.current) {
        width = entry.contentRect.width;
        titleRef.current.style.height = "0px";
        titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
      }
    });
    if (titleRef.current) observer.observe(titleRef.current);
    return () => observer.disconnect();
  }, []);
  function change(key: string, value: unknown) {
    const next = { ...current.current, [key]: value };
    if (!conflict.current) setError("");
    current.current = next;
    version.current++;
    setForm(next);
    setDirty(true);
    setStatus(note ? "Saving soon…" : "Unsaved changes");
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ revision: revision.current, data: next }),
      );
    } catch {
      localAvailable.current = false;
    }
  }
  const flush = useCallback(async (): Promise<boolean> => {
    if (conflict.current) return false;
    if (inflight.current) return inflight.current;
    if (version.current === savedVersion.current) return true;
    const run = async () => {
      setBusy(true);
      setError("");
      try {
        while (savedVersion.current < version.current) {
          const captured = version.current;
          const data = { ...current.current };
          if (note && !String(data.title || "").trim())
            data.title = `Notes · ${notebookDate(data.date || date)}`;
          setStatus("Saving…");
          const r = await workFetch("/api/planning", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: row.kind,
              id: row.id,
              revision: revision.current || undefined,
              data,
            }),
          });
          const b = await r.json();
          if (!r.ok) {
            if (String(b.error).includes("changed")) conflict.current = true;
            throw new Error(b.error || "Your page could not be saved.");
          }
          revision.current = b.record.revision;
          savedVersion.current = captured;
          setRecord(b.record);
          onSaved(b.record);
          if (captured === version.current) {
            current.current = b.record.data;
            setForm(b.record.data);
            setDirty(false);
            try {
              localStorage.removeItem(draftKey);
            } catch {
              /* still saved remotely */
            }
          } else {
            try {
              localStorage.setItem(
                draftKey,
                JSON.stringify({
                  revision: revision.current,
                  data: current.current,
                }),
              );
            } catch {
              localAvailable.current = false;
            }
          }
        }
        setStatus("All changes saved");
        return true;
      } catch (e) {
        setError(
          `${e instanceof Error ? e.message : "Unable to save."} ${localAvailable.current ? "Your draft is kept on this browser." : "Keep this page open and copy your text before leaving."}`,
        );
        setStatus("Not saved");
        return false;
      } finally {
        setBusy(false);
        inflight.current = null;
      }
    };
    inflight.current = run();
    return inflight.current;
  }, [date, draftKey, note, onSaved, row.id, row.kind]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);
  useEffect(() => {
    if (!note || !dirty || !ready || error) return;
    const timer = setTimeout(() => void flush(), 1800);
    return () => clearTimeout(timer);
  }, [form, dirty, ready, note, flush, error]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  // Restore drafts after navigation through the global shell too.
  const flushOnExit = useRef(flush);
  flushOnExit.current = flush;
  useEffect(
    () => () => {
      void flushOnExit.current();
    },
    [],
  );
  async function archive() {
    if (!(await flush())) return;
    change("archived", true);
    if (await flush()) onArchived();
  }
  const field = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label key={key} className="notebook-property">
      <span>{label}</span>
      <input
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={form[key] ?? ""}
        placeholder={required ? "Add…" : "Empty"}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  return (
    <article className="notebook-paper">
      <div className="notebook-paper-bar">
        <span>
          <CalendarDays size={14} aria-hidden="true" />
          <time dateTime={date}>{notebookDate(date)}</time>
        </span>
        <span className="notebook-save-status" role="status">
          {!dirty && record.revision > 0 && (
            <Check size={13} aria-hidden="true" />
          )}
          {status}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void flush();
        }}
      >
        <div className="notebook-document-top">
          <span className="notebook-document-icon">
            {note ? (
              <FileText size={24} aria-hidden="true" />
            ) : (
              <Target size={24} aria-hidden="true" />
            )}
          </span>
          <span className="compass-section-label">
            {note ? "Room to think" : "An intention, made clear"}
          </span>
        </div>
        <textarea
          ref={titleRef}
          className="notebook-title"
          rows={1}
          aria-label={note ? "Page title" : "Goal title"}
          placeholder={note ? "Untitled" : "What do you want to achieve?"}
          value={form.title ?? ""}
          maxLength={200}
          onChange={(e) =>
            change("title", e.target.value.replaceAll("\n", " "))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.form
                ?.querySelector<HTMLTextAreaElement>(".notebook-block textarea")
                ?.focus();
            }
          }}
        />
        <div className="notebook-context">
          <label>
            {note ? "Connected to" : "Part of"}
            <select
              aria-label={note ? "Connected goal" : "Parent goal"}
              value={form[note ? "goalId" : "parentId"] || ""}
              onChange={(e) =>
                change(note ? "goalId" : "parentId", e.target.value)
              }
            >
              <option value="">
                {note ? "Choose a goal (optional)" : "An independent goal"}
              </option>
              {goals
                .filter(
                  (g) =>
                    g.id !== row.id &&
                    (note ||
                      GOAL_PERIODS.indexOf(g.data.period) >
                        GOAL_PERIODS.indexOf(form.period)),
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.data.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="sr-only" htmlFor={`status-${row.id}`}>
            Page status
          </label>
          <select
            id={`status-${row.id}`}
            aria-label="Page status"
            value={form.status}
            onChange={(e) => change("status", e.target.value)}
          >
            {note ? (
              <>
                <option value="idea">Working note</option>
                <option value="decision">Decision</option>
              </>
            ) : (
              <>
                <option value="draft">Proposed goal</option>
                <option value="committed">Committed goal</option>
              </>
            )}
          </select>
        </div>
        {!note && (
          <div className="notebook-goal-properties">
            <div className="notebook-key-properties">
              {form.measurementType !== "qualitative" && (
                <>
                  {field(
                    "regular",
                    "Target",
                    "number",
                    form.status === "committed",
                  )}
                  {field("stretch", "Stretch", "number")}
                  {field("unit", "Measured in")}
                </>
              )}
              {field("due", "By", "date", form.status === "committed")}
            </div>
            <details>
              <summary>
                <ChevronDown size={14} aria-hidden="true" /> Success definition
                & details
              </summary>
              <div className="notebook-property-grid">
                <label className="notebook-property">
                  <span>Measure</span>
                  <select
                    value={form.measurementType ?? "quantitative"}
                    onChange={(e) => change("measurementType", e.target.value)}
                  >
                    <option value="quantitative">Numeric target</option>
                    <option value="qualitative">Observable outcome</option>
                  </select>
                </label>
                <label className="notebook-property">
                  <span>Horizon</span>
                  <select
                    value={form.period}
                    onChange={(e) => change("period", e.target.value)}
                  >
                    {GOAL_PERIODS.map((p: string) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                {field("start", "Starts", "date")}
                {field("owner", "Owner")}
                {field("baseline", "Baseline", "number")}
                <label className="notebook-property">
                  <span>Direction</span>
                  <select
                    value={form.direction || "increase"}
                    onChange={(e) => change("direction", e.target.value)}
                  >
                    <option value="increase">Increase to target</option>
                    <option value="decrease">Decrease to target</option>
                  </select>
                </label>
                <label className="notebook-property notebook-property-wide">
                  <span>
                    {form.measurementType === "qualitative"
                      ? "What will demonstrate success?"
                      : "What counts towards this target?"}
                  </span>
                  <textarea
                    rows={2}
                    value={
                      form[
                        form.measurementType === "qualitative"
                          ? "criteria"
                          : "metricDefinition"
                      ] || ""
                    }
                    onChange={(e) =>
                      change(
                        form.measurementType === "qualitative"
                          ? "criteria"
                          : "metricDefinition",
                        e.target.value,
                      )
                    }
                    placeholder="Describe what you’ll measure or observe."
                  />
                </label>
                {field("freshnessDays", "Evidence freshness (days)", "number")}
                {field(
                  "expectedSprints",
                  "Expected sprints (estimate)",
                  "number",
                )}
              </div>
            </details>
          </div>
        )}
        {error && (
          <div className="planning-error" role="alert">
            {error}
            <button type="button" disabled={busy} onClick={() => void flush()}>
              Retry save
            </button>
            {conflict.current && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Load the saved page? Copy any draft text you want to keep first.",
                    )
                  ) {
                    localStorage.removeItem(draftKey);
                    window.location.reload();
                  }
                }}
              >
                Load saved page
              </button>
            )}
          </div>
        )}
        {ready && (
          <NotebookEditor
            value={String(form[note ? "body" : "notes"] || "")}
            onChange={(value) => change(note ? "body" : "notes", value)}
            maxLength={note ? 20000 : 4000}
            placeholder={
              note
                ? "What’s on your mind? Start anywhere. Use / for ideas."
                : "Why does this matter? What will move you closer?"
            }
          />
        )}
        <details className="notebook-extra">
          <summary>Links & sources</summary>
          <label className="sr-only" htmlFor={`links-${row.id}`}>
            Links and sources
          </label>
          <textarea
            id={`links-${row.id}`}
            rows={2}
            value={form.links || ""}
            onChange={(e) => change("links", e.target.value)}
            placeholder="Paste a project, task, or source link…"
          />
        </details>
        <footer className="notebook-document-footer">
          <span>
            {note
              ? "Notes save automatically"
              : form.status === "draft"
                ? "Start with an idea. Add targets and dates when you’re ready."
                : "Save to update your goal in Pathfinder"}
          </span>
          <div>
            {dirty && !busy && (
              <button
                type="button"
                className="compass-btn-ghost"
                onClick={() => {
                  current.current = record.data;
                  setForm(record.data);
                  savedVersion.current = ++version.current;
                  setDirty(false);
                  setError("");
                  conflict.current = false;
                  setStatus(record.revision ? "All changes saved" : "New page");
                  try {
                    localStorage.removeItem(draftKey);
                  } catch {}
                }}
              >
                Discard changes
              </button>
            )}
            {record.revision > 0 && (
              <button
                type="button"
                className="compass-btn-ghost"
                disabled={busy}
                onClick={() => void archive()}
              >
                Archive
              </button>
            )}
            <button
              className={note ? "compass-btn-secondary" : "compass-btn-primary"}
              disabled={busy || !dirty}
            >
              {busy ? "Saving…" : note ? "Save now" : "Save goal"}
            </button>
            {!note && record.revision > 0 && (
              <button
                type="button"
                className="compass-btn-secondary"
                onClick={() => onPathfinder(row.id)}
              >
                View path <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </footer>
      </form>
      {!!record.history.length && (
        <details className="notebook-history">
          <summary>Earlier versions · {record.history.length}</summary>
          {record.history
            .slice()
            .reverse()
            .map((h) => (
              <details key={h.revision}>
                <summary>
                  {new Date(h.at).toLocaleString("en-AU")} · version{" "}
                  {h.revision}
                </summary>
                <pre>{JSON.stringify(h.data, null, 2)}</pre>
              </details>
            ))}
        </details>
      )}
    </article>
  );
});
