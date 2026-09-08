"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GOAL_PERIODS, goalProgress } from "@/lib/planning-core.mjs";
import type { PlanningRow } from "@/lib/planning-server";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(
    new Date(),
  );
const displayNumber = (value: unknown) =>
  value == null || value === "" ? "Unknown" : Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-AU").format(Number(value)) : String(value);
const displayDate = (value: string) => {
  if (!value) return "No due date";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(date);
};
const empty = (kind: string): Record<string, any> =>
  kind === "goal"
    ? {
        title: "",
        period: "monthly",
        start: today(),
        due: "",
        regular: "",
        stretch: "",
        actual: "",
        baseline: "",
        forecast: "",
        unit: "AUD / month",
        source: "",
        parentId: "",
        status: "draft",
        notes: "",
        links: "",
      }
    : kind === "time"
      ? {
          title: "",
          date: today(),
          plannedMinutes: "",
          actualMinutes: "",
          workType: "Campaign preparation",
          result: "partial",
          output: "",
          links: "",
          goalId: "",
        }
      : { title: "", body: "", links: "", goalId: "", status: "idea" };
export function PlanningBoard() {
  const [kind, setKind] = useState("goal"),
    [rows, setRows] = useState<PlanningRow[]>([]),
    [goals, setGoals] = useState<PlanningRow[]>([]),
    [edit, setEdit] = useState<PlanningRow | null>(null),
    [form, setForm] = useState(empty("goal")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0);
  const loadVersion = useRef(0),
    createId = useRef("");
  const load = useCallback(async (k = kind, p = page) => {
    const version = ++loadVersion.current;
    const r = await fetch(`/api/planning?kind=${k}&page=${p}`, {
      cache: "no-store",
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    if (version === loadVersion.current) {
      setRows(b.records);
      setTotal(b.total);
    }
  }, [kind,page]);
  useEffect(() => {
    let live = true;
    setError("");
    void load(kind, page).catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
      // Invalidate in-flight requests before a different view loads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadVersion.current++;
    };
  }, [kind, page, load]);
  useEffect(() => {
    void (async () => {
      let all: PlanningRow[] = [];
      let p = 0;
      for (;;) {
        const r = await fetch(`/api/planning?kind=goal&page=${p++}`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        all = all.concat(b.records);
        if (all.length >= b.total) break;
      }
      setGoals(all);
    })().catch((e) => setError(e.message));
  }, [message]);
  function change(k: string, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
    setMessage("");
  }
  function reset(k = kind) {
    createId.current = "";
    setRows([]);
    setEdit(null);
    setForm(empty(k));
    setMessage("");
  }
  async function save(archived = false) {
    setBusy(true);
    setError("");
    try {
      const id =
        edit?.id ||
        (createId.current ||= `planning.${kind}.${crypto.randomUUID()}`);
      const r = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          revision: edit?.revision,
          data: { ...form, archived },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setEdit(b.record);
      setForm(b.record.data);
      await load();
      setMessage(`Saved revision ${b.record.revision}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const fields =
    kind === "goal"
      ? [
          ["title", "Goal", "text"],
          ["start", "Start", "date"],
          ["due", "Deadline", "date"],
          ["unit", "Unit", "text"],
          ["baseline", "Baseline (unknown can stay blank)", "number"],
          ["regular", "Regular target", "number"],
          ["stretch", "Stretch target", "number"],
          ["forecast", "Forecast (separate from target)", "number"],
          ["actual", "Actual (blank means unknown)", "number"],
          ["source", "Evidence for actual result", "text"],
        ]
      : kind === "time"
        ? [
            ["title", "Work completed or attempted", "text"],
            ["date", "Date", "date"],
            ["plannedMinutes", "Planned minutes", "number"],
            [
              "actualMinutes",
              "Actual human minutes (blank if unknown)",
              "number",
            ],
            ["workType", "Type of work", "text"],
          ]
        : [["title", "Note title", "text"]];
  const shown = rows.filter(
    (r) =>
      !r.data.archived &&
      JSON.stringify(r.data).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="compass-page-title">Goals & notes</h1>
          <p className="compass-page-subtitle">
            Connect priorities to work. Keep targets, evidence and actual effort
            distinct.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="compass-btn-secondary" href="/sales/offer-plan">
            Offer & economics
          </Link>
          <Link className="compass-btn-secondary" href="/sales/experiments">
            Email tests
          </Link>
        </div>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Planning views"
      >
        {[
          ["goal", "Goals"],
          ["note", "Notes"],
          ["time", "Time & output"],
          ["run", "Agent runs"],
          ["preparation", "Preparation queue"],
        ].map(([k, label]) => (
          <button
            key={k}
            aria-pressed={kind === k}
            className={
              kind === k ? "compass-btn-primary" : "compass-btn-secondary"
            }
            onClick={() => {
              setKind(k);
              setPage(0);
              reset(k);
              setQuery("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-green-800">
          {message}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <section className="compass-panel space-y-4 p-5">
          <div className="flex items-center gap-3">
            <label className="flex-1">
              <span className="sr-only">Search loaded records</span>
              <input
                className="compass-input w-full"
                placeholder="Search this page…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {kind !== "run" && kind !== "preparation" && (
              <button
                className="compass-btn-secondary"
                onClick={() => {
                  reset();
                  void load();
                }}
              >
                New
              </button>
            )}
          </div>
          {kind === "time" && (
            <p className="text-sm text-neutral-500">
              Planned time is not actual time. Record human effort and accepted
              output; unattended sends and agent runtime are separate.
            </p>
          )}
          {shown.length === 0 && (
            <p className="py-8 text-sm text-neutral-500">
              No matching records on this page.
            </p>
          )}
          {shown.map((r) => (
            <button
              key={r.id}
              aria-label={`Open ${r.data.title}`}
              className={`block w-full rounded-xl border p-4 text-left ${edit?.id === r.id ? "border-orange-300 bg-orange-50/30" : "border-stone-200 bg-white"}`}
              onClick={() => {
                setEdit(r);
                setForm(r.data);
                setMessage("");
              }}
            >
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{r.data.title}</span>
                <span className="text-xs text-neutral-500">
                  {r.data.status || r.data.result || ""}
                </span>
              </div>
              {kind === "goal" ? (
                <>
                  <p className="mt-2 text-sm text-neutral-600">
                    {r.data.period} · {r.data.due ? `due ${displayDate(r.data.due)}` : "No due date"} ·{" "}
                    {displayNumber(r.data.actual)} / {displayNumber(r.data.regular)}{" "}
                    {r.data.unit}
                    {r.data.stretch != null
                      ? ` · stretch ${displayNumber(r.data.stretch)}`
                      : ""}
                  </p>
                  {r.data.parentId && (
                    <p className="mt-2 text-xs text-neutral-500">
                      Supports:{" "}
                      {goals.find((g) => g.id === r.data.parentId)?.data
                        .title || "Parent goal"}
                    </p>
                  )}
                  {goalProgress(r.data) != null && (
                    <div className="mt-3 h-1.5 rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${goalProgress(r.data)}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-neutral-500">
                  {kind === "time"
                    ? `${r.data.date} · ${r.data.actualMinutes ?? "Unknown"} actual minutes · ${r.data.output || "Output not recorded"}`
                    : r.data.body}
                </p>
              )}
            </button>
          ))}
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="compass-btn-ghost"
            >
              Previous
            </button>
            <span>
              {total} {total === 1 ? 'record' : 'records'} · page {page + 1}
            </span>
            <button
              disabled={(page + 1) * 100 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="compass-btn-ghost"
            >
              Next
            </button>
          </div>
        </section>
        <section className="compass-panel p-5">
          <h2 className="mb-5 text-lg font-semibold">
            {edit ? "Edit record" : "New record"}
          </h2>
          {kind === "run" || kind === "preparation" ? (
            <>
              <p className="text-sm text-neutral-500">
                Agents record execution evidence here. A queued request is not
                completed work.
              </p>
              {edit && (
                <>
                  <h3 className="mt-5 font-semibold">{edit.data.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                    {edit.data.body}
                  </p>
                  <p className="mt-4 text-xs text-neutral-500">
                    {edit.updatedAt} · {edit.data.source}
                  </p>
                </>
              )}
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map(([k, label, type]) => (
                  <label
                    key={k}
                    className={`text-sm ${k === "title" || k === "source" ? "sm:col-span-2" : ""}`}
                  >
                    {label}
                    <input
                      className="compass-input mt-1 w-full"
                      type={type}
                      step={type === "number" ? "any" : undefined}
                      min={type === "number" ? 0 : undefined}
                      required={
                        k === "title" ||
                        k === "due" ||
                        k === "date" ||
                        k === "regular"
                      }
                      value={form[k] ?? ""}
                      onChange={(e) => change(k, e.target.value)}
                    />
                  </label>
                ))}
                {kind === "goal" && (
                  <>
                    <label className="text-sm">
                      Period
                      <select
                        className="compass-input mt-1 w-full"
                        value={form.period}
                        onChange={(e) => change("period", e.target.value)}
                      >
                        {GOAL_PERIODS.map((p: string) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Decision status
                      <select
                        className="compass-input mt-1 w-full"
                        value={form.status}
                        onChange={(e) => change("status", e.target.value)}
                      >
                        <option value="draft">Proposed target</option>
                        <option value="committed">Committed target</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="text-sm sm:col-span-2">
                  {kind === "goal" ? "Parent goal" : "Supports goal"}
                  <select
                    className="compass-input mt-1 w-full"
                    value={form[kind === "goal" ? "parentId" : "goalId"] || ""}
                    onChange={(e) =>
                      change(
                        kind === "goal" ? "parentId" : "goalId",
                        e.target.value,
                      )
                    }
                  >
                    <option value="">None</option>
                    {goals
                      .filter(
                        (g) =>
                          !g.data.archived &&
                          g.id !== edit?.id &&
                          (kind !== "goal" ||
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
              </div>
              {kind === "note" && (
                <label className="block text-sm">
                  Type
                  <select
                    className="compass-input ml-3"
                    value={form.status}
                    onChange={(e) => change("status", e.target.value)}
                  >
                    <option value="idea">Idea / working note</option>
                    <option value="decision">Decision</option>
                  </select>
                </label>
              )}
              {kind === "time" && (
                <label className="block text-sm">
                  Outcome
                  <select
                    className="compass-input ml-3"
                    value={form.result}
                    onChange={(e) => change("result", e.target.value)}
                  >
                    {["completed", "partial", "blocked"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm">
                {kind === "note"
                  ? "Note"
                  : kind === "goal"
                    ? "Rationale / changes"
                    : "Accepted output, rework or blocker"}
                <textarea
                  className="compass-input mt-1 min-h-32 w-full"
                  value={
                    form[
                      kind === "note"
                        ? "body"
                        : kind === "goal"
                          ? "notes"
                          : "output"
                    ] || ""
                  }
                  onChange={(e) =>
                    change(
                      kind === "note"
                        ? "body"
                        : kind === "goal"
                          ? "notes"
                          : "output",
                      e.target.value,
                    )
                  }
                />
              </label>
              <label className="block text-sm">
                Related task, project, campaign or source links
                <textarea
                  className="compass-input mt-1 w-full"
                  value={form.links || ""}
                  onChange={(e) => change("links", e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} className="compass-btn-primary">
                  {busy ? "Saving…" : "Save"}
                </button>
                {edit && (
                  <button
                    disabled={busy}
                    type="button"
                    className="compass-btn-ghost"
                    onClick={() => void save(true)}
                  >
                    Archive
                  </button>
                )}
              </div>
            </form>
          )}
          {edit && (
            <details className="mt-6 border-t pt-4">
              <summary className="cursor-pointer text-sm font-medium">
                Revision history ({edit.history.length})
              </summary>
              {edit.history
                .slice()
                .reverse()
                .map((h) => (
                  <div
                    key={h.revision}
                    className="mt-3 rounded-xl bg-stone-50 p-3 text-xs"
                  >
                    <p>
                      Revision {h.revision} · {h.at}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans">
                      {JSON.stringify(h.data, null, 2)}
                    </pre>
                  </div>
                ))}
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
