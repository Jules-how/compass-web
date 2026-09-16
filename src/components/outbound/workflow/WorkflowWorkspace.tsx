"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  History,
  Layers3,
  Mail,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import {
  createBatch,
  defaults,
  hasIssue,
  prepare,
  revise,
  approve,
  checks,
  event,
  steps,
  type Batch,
  type Company,
  type Config,
} from "./model";
import "./workflow.css";
const storage = "compass.outbound.workflow.design.v1";
type View = "companies" | "copy" | "execution" | "history";
type Detail = "research" | "email" | "contact" | "history";
function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span className={`wf-pill wf-${tone}`}>
      <i />
      {children}
    </span>
  );
}
function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={primary ? "compass-btn-primary" : "compass-btn-secondary"}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  );
}
function Contact({ r }: { r: Company }) {
  return (
    <Pill
      tone={r.contactPublished && r.verification === "ok" ? "good" : "warn"}
    >
      {!r.contactPublished
        ? "Source unresolved"
        : r.verification === "ok"
          ? "Recorded valid"
          : r.verification === "catch_all"
            ? "Catch-all"
            : "Unknown"}
    </Pill>
  );
}
function CopyState({ r }: { r: Company }) {
  return (
    <Pill
      tone={r.approved === r.version ? "good" : r.body ? "warn" : "neutral"}
    >
      {r.approved === r.version
        ? `Approved · v${r.version}`
        : r.body
          ? "Needs review"
          : "Not drafted"}
    </Pill>
  );
}
export function WorkflowWorkspace() {
  const [db, setDb] = useState<{ active: string; batches: Batch[] } | null>(
      null,
    ),
    [view, setView] = useState<View>("companies"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [size, setSize] = useState(10),
    [sort, setSort] = useState<"source" | "name">("source"),
    [selected, setSelected] = useState<number[]>([]),
    [detail, setDetail] = useState<number | null>(null),
    [detailTab, setDetailTab] = useState<Detail>("research"),
    [config, setConfig] = useState<Config | null>(null),
    [editingConfig, setEditingConfig] = useState(false),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [opener, setOpener] = useState(""),
    [message, setMessage] = useState(""),
    [dialog, setDialog] = useState<"bulk" | "load" | "reset" | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storage) || "null");
      if (
        saved?.batches?.length &&
        saved.batches.some((b: Batch) => b.id === saved.active)
      ) {
        setDb(saved);
        return;
      }
    } catch {}
    const b = createBatch(defaults, true);
    setDb({ active: b.id, batches: [b] });
  }, []);
  useEffect(() => {
    if (!db) return;
    try {
      localStorage.setItem(storage, JSON.stringify(db));
    } catch {
      setMessage(
        "Browser storage is unavailable. Keep this page open to retain your changes.",
      );
    }
  }, [db]);
  const b = db?.batches.find((x) => x.id === db.active),
    r = b?.rows.find((x) => x.id === detail);
  useEffect(() => {
    setSubject(r?.subject || "");
    setBody(r?.body || "");
    setOpener(r?.opener || "");
  }, [r?.id, r?.version, r?.subject, r?.body, r?.opener, db?.active]);
  const rows = useMemo(() => {
    let list = (b?.rows || []).filter(
      (r) =>
        (r.name + " " + r.domain + " " + r.email)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "attention" && hasIssue(r)) ||
          (filter === "review" && r.body && r.approved !== r.version) ||
          (filter === "approved" && r.approved === r.version)),
    );
    if (sort === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [b, search, filter, sort]);
  if (!b || !db)
    return (
      <div className="wf-loading" role="status">
        Loading workflow…
      </div>
    );
  const batch = b,
    store = db,
    offset = Math.min(page, Math.max(0, Math.ceil(rows.length / size) - 1)),
    visible = rows.slice(offset * size, (offset + 1) * size),
    approvedCount = batch.rows.filter((x) => x.approved === x.version).length,
    issueCount = batch.rows.filter(hasIssue).length,
    drafts = batch.rows.filter((x) => x.body).length;
  const update = (fn: (batch: Batch) => void) =>
    setDb((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      fn(next.batches.find((x) => x.id === next.active)!);
      return next;
    });
  const mutateRow = (fn: (batch: Batch, row: Company) => void) =>
    update((b) => {
      const x = b.rows.find((x) => x.id === detail);
      if (x) fn(b, x);
    });
  const dirty = Boolean(
    r && (r.subject !== subject || r.body !== body || r.opener !== opener),
  );
  const closeDetail = () => {
    if (!dirty || window.confirm("Discard unsaved changes to this company?"))
      setDetail(null);
  };
  const openCompany = (
    id: number,
    tab: Detail = view === "copy" ? "email" : "research",
  ) => {
    setDetail(id);
    setDetailTab(tab);
  };
  const select = (id: number) =>
    setSelected((x) =>
      x.includes(id) ? x.filter((i) => i !== id) : [...x, id],
    );
  const selectedRows = batch.rows.filter((x) => selected.includes(x.id)),
    approvable = selectedRows.filter(
      (x) => x.body && x.approved !== x.version && !checks(x).length,
    );
  const currentStep =
    batch.phase === "define" ? 0 : batch.phase === "research" ? 4 : 9;
  const saveConfig = () => {
    if (!config?.name.trim()) return;
    if (editingConfig) {
      update((b) => {
        b.config = config;
        b.phase = "define";
        for (const x of b.rows) {
          if (x.body) revise(b, x, x.subject, "");
          x.approved = null;
        }
        event(
          b,
          "Batch configuration changed",
          "Preparation reset. Historical example inputs remain unchanged.",
        );
      });
    } else {
      const next = createBatch(config);
      setDb({ ...store, active: next.id, batches: [...store.batches, next] });
      setSelected([]);
      setPage(0);
      setFilter("all");
      setSearch("");
    }
    setConfig(null);
  };
  return (
    <section className="wf" aria-label="Outbound workflow">
      <div className="wf-top">
        <div className="wf-batch-title">
          <span className="wf-batch-icon">
            <Layers3 size={17} />
          </span>
          <div>
            <label className="wf-eyebrow" htmlFor="wf-batches">
              Batch
            </label>
            <select
              id="wf-batches"
              value={batch.id}
              onChange={(e) => {
                setDb({ ...store, active: e.target.value });
                setSelected([]);
                setPage(0);
                setFilter("all");
                setSearch("");
              }}
            >
              {store.batches.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.config.name}
                </option>
              ))}
            </select>
          </div>
          <Pill>
            {batch.phase === "define"
              ? "Ready to prepare"
              : batch.phase === "research"
                ? "Research review"
                : "Copy review"}
          </Pill>
        </div>
        <div className="wf-actions">
          <Button
            onClick={() => {
              setEditingConfig(true);
              setConfig({ ...batch.config });
            }}
          >
            <Settings2 size={14} /> Configure
          </Button>
          <Button
            onClick={() => {
              setEditingConfig(false);
              setConfig({ ...defaults, name: "New batch" });
            }}
          >
            <Plus size={14} /> New batch
          </Button>
        </div>
      </div>
      <div className="wf-context">
        <span>{batch.config.geography}</span>
        <span>{batch.rows.length} companies</span>
        <span>{batch.config.offer}</span>
        <span className="wf-context-end">
          Design workspace · saved example data · browser-local changes
        </span>
      </div>
      <div className="wf-stagebar" aria-label="Workflow progress">
        {[
          ["Define", 0],
          ["Research", 4],
          ["Contacts", 6],
          ["Write", 8],
          ["Review", 9],
          ["Load", 10],
          ["Observe", 11],
        ].map(([name, n]) => (
          <button
            key={name}
            aria-current={currentStep === n ? "step" : undefined}
            onClick={() => {
              if (n === 0) {
                setEditingConfig(true);
                setConfig({ ...batch.config });
              } else if (n === 10 || n === 11) setDialog("load");
              else {
                setView(
                  n === 8 || n === 9
                    ? "copy"
                    : n === 4 || n === 6
                      ? "companies"
                      : "execution",
                );
                setFilter(n === 6 ? "attention" : "all");
              }
            }}
            className={Number(n) < currentStep ? "wf-stage-done" : ""}
          >
            <span>
              {Number(n) < currentStep ? (
                <Check size={12} />
              ) : Number(n) === currentStep ? (
                <span className="wf-dot" />
              ) : null}
            </span>
            {name}
            <ChevronRight size={13} />
          </button>
        ))}
      </div>
      <div className="wf-checkpoint">
        <ShieldCheck size={18} />
        <div>
          <strong>
            {batch.phase === "define"
              ? "Ready to prepare this batch"
              : batch.phase === "research"
                ? "Research is ready for your review"
                : `${drafts} drafts ready · ${approvedCount} approved`}
          </strong>
          <p>
            {batch.phase === "define"
              ? "Preparation stops at your configured review checkpoints."
              : batch.phase === "research"
                ? "Review company evidence and unknowns before moving to contacts and copy."
                : `${issueCount} companies have research or contact issues. Copy approval and sending eligibility are separate.`}
          </p>
        </div>
        <Button
          primary
          onClick={() => {
            if (batch.phase === "define") update((b) => prepare(b));
            else if (batch.phase === "research") {
              update((b) => prepare(b, true));
              setView("copy");
            } else if (view !== "copy") setView("copy");
            else setDialog("load");
          }}
        >
          {batch.phase === "define" ? (
            <Play size={13} />
          ) : (
            <ArrowRight size={14} />
          )}{" "}
          {batch.phase === "define"
            ? "Prepare batch"
            : batch.phase === "research"
              ? "Continue to drafts"
              : view === "copy"
                ? "Review loading"
                : "Review drafts"}
        </Button>
      </div>
      <div className="wf-tabs" role="group" aria-label="Workflow views">
        {(
          [
            ["companies", "Companies", Building2],
            ["copy", "Copy review", Mail],
            ["execution", "Execution", GitBranch],
            ["history", "Activity", History],
          ] as const
        ).map(([key, title, Icon]) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            <Icon size={14} />
            {title}
            {key === "companies" && <span>{batch.rows.length}</span>}
          </button>
        ))}
      </div>
      {(view === "companies" || view === "copy") && (
        <>
          <div className="wf-toolbar">
            <div className="wf-filters">
              {[
                ["all", "All companies", batch.rows.length],
                ["attention", "Needs attention", issueCount],
                [
                  "review",
                  "To review",
                  batch.rows.filter((x) => x.body && x.approved !== x.version)
                    .length,
                ],
                ["approved", "Approved", approvedCount],
              ].map(([value, label, count]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(String(value));
                    setPage(0);
                  }}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <div className="wf-search">
              <Search size={14} />
              <input
                aria-label="Search companies"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search companies…"
              />
            </div>
            <label className="wf-sort">
              <ArrowDown size={13} />
              <select
                aria-label="Sort companies"
                value={sort}
                onChange={(e) => setSort(e.target.value as "source" | "name")}
              >
                <option value="source">Source order</option>
                <option value="name">Company A–Z</option>
              </select>
            </label>
          </div>
          {selected.length > 0 && (
            <div className="wf-selection">
              <strong>{selected.length} selected</strong>
              <Button
                onClick={() => setDialog("bulk")}
                disabled={!approvable.length}
              >
                <CheckCheck size={14} /> Review approvals
              </Button>
              <Button
                onClick={() => {
                  update((b) => {
                    for (const x of b.rows.filter((x) =>
                      selected.includes(x.id),
                    ))
                      x.held = !x.held;
                    event(
                      b,
                      "Review holds updated",
                      `${selected.length} selected records updated. Original research and contact evidence retained.`,
                    );
                  });
                  setSelected([]);
                }}
              >
                Toggle hold
              </Button>
              <button
                onClick={() => setSelected([])}
                aria-label="Clear selection"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div
            className="wf-table-scroll"
            tabIndex={0}
            aria-label="Companies; scroll horizontally for more columns"
          >
            <table
              className={
                view === "copy" ? "wf-table wf-copy-table" : "wf-table"
              }
            >
              <thead>
                <tr>
                  <th className="wf-select">
                    <input
                      type="checkbox"
                      aria-label="Select visible companies"
                      checked={
                        visible.length > 0 &&
                        visible.every((x) => selected.includes(x.id))
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            visible.some((x) => selected.includes(x.id)) &&
                            !visible.every((x) => selected.includes(x.id));
                      }}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [
                                ...new Set([
                                  ...selected,
                                  ...visible.map((x) => x.id),
                                ]),
                              ]
                            : selected.filter(
                                (id) => !visible.some((x) => x.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  <th>Company</th>
                  {view === "copy" ? (
                    <>
                      <th>Subject</th>
                      <th>Opener</th>
                      <th>Approval</th>
                      <th>Contact</th>
                    </>
                  ) : (
                    <>
                      <th>Company fit</th>
                      <th>Contact & email</th>
                      <th>Draft</th>
                      <th>Sending</th>
                      <th>Next action</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((x) => (
                  <tr key={x.id} data-selected={selected.includes(x.id)}>
                    <td className="wf-select">
                      <input
                        type="checkbox"
                        aria-label={`Select ${x.name}`}
                        checked={selected.includes(x.id)}
                        onChange={() => select(x.id)}
                      />
                    </td>
                    <td>
                      <button
                        className="wf-company"
                        onClick={() => openCompany(x.id)}
                      >
                        <span className="wf-avatar">{x.name.slice(0, 1)}</span>
                        <span>
                          <strong>{x.name}</strong>
                          <small>{x.domain}</small>
                        </span>
                      </button>
                    </td>
                    {view === "copy" ? (
                      <>
                        <td className="wf-subject">
                          <button onClick={() => openCompany(x.id, "email")}>
                            {x.body ? (
                              x.subject
                            ) : (
                              <span className="wf-muted">Not drafted</span>
                            )}
                          </button>
                        </td>
                        <td className="wf-opener">
                          <button onClick={() => openCompany(x.id, "email")}>
                            {x.body ? (
                              x.opener
                            ) : (
                              <span className="wf-muted">
                                Research required before drafting
                              </span>
                            )}
                          </button>
                        </td>
                        <td>
                          <CopyState r={x} />
                        </td>
                        <td>
                          <Contact r={x} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <Pill
                            tone={x.held || x.researchIssue ? "warn" : "good"}
                          >
                            {x.held
                              ? "On hold"
                              : x.researchIssue
                                ? "Needs research"
                                : "Service / area fit"}
                          </Pill>
                          <small className="wf-subtext">
                            {x.signal || "Identity unresolved"}
                          </small>
                        </td>
                        <td>
                          <Contact r={x} />
                          <small className="wf-subtext">{x.email}</small>
                        </td>
                        <td>
                          <CopyState r={x} />
                        </td>
                        <td>
                          <span className="wf-muted">Not connected</span>
                        </td>
                        <td>
                          <button
                            className="wf-next"
                            onClick={() =>
                              openCompany(
                                x.id,
                                x.researchIssue
                                  ? "research"
                                  : hasIssue(x)
                                    ? "contact"
                                    : "email",
                              )
                            }
                          >
                            {x.held
                              ? "Review hold"
                              : x.researchIssue
                                ? "Review evidence"
                                : hasIssue(x)
                                  ? "Resolve contact"
                                  : x.approved === x.version
                                    ? "Review loading"
                                    : "Review draft"}
                            <ArrowUpRight size={13} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="wf-empty">
                <Search size={24} />
                <strong>No matching companies</strong>
                <p>Try another search or filter.</p>
                <Button
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
          <div className="wf-pagination">
            <span>
              {rows.length ? offset * size + 1 : 0}–
              {Math.min((offset + 1) * size, rows.length)} of {rows.length}{" "}
              companies
            </span>
            <div>
              <label>
                Rows{" "}
                <select
                  value={size}
                  onChange={(e) => {
                    setSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {[5, 10, 25, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <Button
                label="Previous page"
                onClick={() => setPage(offset - 1)}
                disabled={offset === 0}
              >
                <ArrowLeft size={14} />
              </Button>
              <span>
                {offset + 1} / {Math.max(1, Math.ceil(rows.length / size))}
              </span>
              <Button
                label="Next page"
                onClick={() => setPage(offset + 1)}
                disabled={(offset + 1) * size >= rows.length}
              >
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}
      {view === "execution" && (
        <div className="wf-execution">
          <div className="wf-section-heading">
            <div>
              <h2>Execution plan</h2>
              <p>
                Inputs, tools and outputs at every step. Human checkpoints stay
                explicit.
              </p>
            </div>
            <span className="wf-cost">
              Planned cap <strong>A${batch.config.budget}</strong> · actual
              spend <strong>A$0</strong>
            </span>
          </div>
          <div className="wf-execution-table">
            {steps.map(([title, description], i) => (
              <div className="wf-execution-row" key={title}>
                <span className="wf-step-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
                <span className="wf-muted">
                  {i < 2
                    ? batch.config.source
                    : i < 5
                      ? batch.config.research
                      : i < 7
                        ? "Saved contact + verification"
                        : i < 9
                          ? batch.config.model
                          : i === 9
                            ? "You + local checks"
                            : "Instantly · not connected"}
                </span>
                <Pill
                  tone={
                    (i === 4 && batch.config.checkpoint) || i === 9
                      ? "warn"
                      : "neutral"
                  }
                >
                  {(i === 4 && batch.config.checkpoint) || i === 9
                    ? "Human review"
                    : i >= 10
                      ? "Unavailable"
                      : i === 8
                        ? "Local assembly"
                        : "Saved input"}
                </Pill>
              </div>
            ))}
          </div>
          <div className="wf-footnote">
            <Sparkles size={14} />
            <span>
              Provider and model selections describe the intended workflow. No
              research, verification or AI service runs from this design
              workspace.
            </span>
          </div>
        </div>
      )}
      {view === "history" && (
        <div className="wf-activity">
          <div className="wf-section-heading">
            <div>
              <h2>Batch activity</h2>
              <p>
                Attempts, decisions and corrections stay attached to this batch.
              </p>
            </div>
            <Button onClick={() => setDialog("reset")}>Reset examples</Button>
          </div>
          {batch.history.map((h) => (
            <div className="wf-event" key={h.id}>
              <span className="wf-event-icon">
                <Clock3 size={14} />
              </span>
              <div>
                <strong>{h.title}</strong>
                <p>{h.detail}</p>
              </div>
              <time>
                {new Date(h.time).toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
          {!batch.history.length && (
            <div className="wf-empty">
              <History size={24} />
              <strong>No activity yet</strong>
              <p>Prepare the batch to begin.</p>
            </div>
          )}
        </div>
      )}
      <div className="wf-footnote">
        <History size={13} />
        <span>
          Website snapshots · 16 Sep 2026. Verification records · 10 Sep 2026.
          Historical inputs do not establish current sending eligibility.
        </span>
      </div>
      {message && (
        <div className="wf-message" role="status">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <ModalFrame
        open={detail !== null}
        onClose={closeDetail}
        label={r?.name || "Company details"}
        overlayClassName="wf-overlay"
        contentClassName="wf-panel"
      >
        {r && (
          <>
            <div className="wf-panel-top">
              <div className="wf-panel-navigation">
                <span>
                  Company {batch.rows.findIndex((x) => x.id === r.id) + 1} of{" "}
                  {batch.rows.length}
                </span>
                <button
                  onClick={closeDetail}
                  aria-label="Close company details"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="wf-panel-company">
                <span className="wf-avatar">{r.name.slice(0, 1)}</span>
                <div>
                  <h2>{r.name}</h2>
                  <a href={r.website} target="_blank" rel="noreferrer">
                    {r.domain}
                    <ArrowUpRight size={12} />
                  </a>
                </div>
              </div>
              <div className="wf-panel-pills">
                <Pill tone={r.researchIssue ? "warn" : "good"}>
                  {r.researchIssue ? "Research needed" : "Partial company fit"}
                </Pill>
                <Contact r={r} />
                <CopyState r={r} />
              </div>
            </div>
            <div className="wf-tabs wf-detail-tabs">
              {(
                [
                  ["research", "Evidence"],
                  ["email", "Email"],
                  ["contact", "Contact"],
                  ["history", "History"],
                ] as const
              ).map(([key, title]) => (
                <button
                  key={key}
                  aria-pressed={detailTab === key}
                  onClick={() => setDetailTab(key)}
                >
                  {title}
                </button>
              ))}
            </div>
            <div className="wf-panel-body">
              {detailTab === "research" && (
                <>
                  <div className="wf-section-heading">
                    <h3>Company assessment</h3>
                    <span className="wf-muted">Saved evidence</span>
                  </div>
                  <dl className="wf-facts">
                    <div>
                      <dt>Installation services</dt>
                      <dd>{r.signal || "Unconfirmed"}</dd>
                    </div>
                    <div>
                      <dt>Service area</dt>
                      <dd>
                        {r.researchIssue.includes("area")
                          ? "Unconfirmed"
                          : "Sydney · saved assessment"}
                      </dd>
                    </div>
                    <div>
                      <dt>Company maturity</dt>
                      <dd>Unknown</dd>
                    </div>
                    <div>
                      <dt>Quoting process</dt>
                      <dd>Unknown</dd>
                    </div>
                    <div>
                      <dt>Decision-maker authority</dt>
                      <dd>Unknown</dd>
                    </div>
                  </dl>
                  {r.researchIssue && (
                    <div className="wf-warning">
                      <strong>{r.researchIssue}</strong>
                      <p>
                        {r.fetchError
                          ? "Saved website request failed. Identity requires review."
                          : "More source evidence is required before establishing fit."}
                      </p>
                    </div>
                  )}
                  <h3 className="wf-subheading">
                    Sources & evidence <span>{r.evidence.length}</span>
                  </h3>
                  {r.evidence.map((e, i) => (
                    <article className="wf-evidence" key={i}>
                      <div>
                        <FileText size={14} />
                        <strong>{e.label}</strong>
                        <span>{e.checkedAt}</span>
                      </div>
                      <blockquote>{e.quote}</blockquote>
                      <a href={e.url} target="_blank" rel="noreferrer">
                        View source
                        <ArrowUpRight size={12} />
                      </a>
                    </article>
                  ))}
                  <label className="wf-label" htmlFor="wf-opener">
                    Selected writing fact
                  </label>
                  <textarea
                    id="wf-opener"
                    value={opener}
                    onChange={(e) => setOpener(e.target.value)}
                    rows={4}
                  />
                  <p className="wf-help">
                    A changed fact invalidates the dependent draft and its
                    approval. Review every correction against the saved source.
                  </p>
                </>
              )}
              {detailTab === "email" && (
                <>
                  <div className="wf-section-heading">
                    <h3>Email · version {r.version}</h3>
                    <CopyState r={r} />
                  </div>
                  {!r.body && (
                    <div className="wf-warning">
                      <strong>No current draft</strong>
                      <p>
                        Resolve the saved research holds, then prepare the
                        batch. Contact holds alone do not prevent research
                        drafting.
                      </p>
                    </div>
                  )}
                  <label className="wf-label" htmlFor="wf-subject">
                    Subject
                  </label>
                  <input
                    id="wf-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={150}
                  />
                  <label className="wf-label" htmlFor="wf-body">
                    Email
                  </label>
                  <textarea
                    id="wf-body"
                    className="wf-email-editor"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <details className="wf-inline-evidence">
                    <summary>
                      <FileText size={13} /> Selected writing evidence
                    </summary>
                    <p>{r.opener || "No writing evidence selected"}</p>
                  </details>
                  {checks(r).length > 0 && (
                    <div className="wf-warning">
                      {checks(r).map((x) => (
                        <p key={x}>{x}</p>
                      ))}
                    </div>
                  )}
                  <p className="wf-help">
                    Approval covers this exact subject and body. It does not
                    verify a contact or authorise sending.
                  </p>
                </>
              )}
              {detailTab === "contact" && (
                <>
                  <h3>Contact record</h3>
                  <dl className="wf-facts">
                    <div>
                      <dt>Email</dt>
                      <dd>{r.email}</dd>
                    </div>
                    <div>
                      <dt>Contact published</dt>
                      <dd>
                        {r.contactPublished
                          ? "Found in saved website text"
                          : "Not found in saved website text"}
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded verification</dt>
                      <dd>{r.verification.replace("_", " ")} · 10 Sep 2026</dd>
                    </div>
                    <div>
                      <dt>Provider</dt>
                      <dd>{r.verificationProvider}</dd>
                    </div>
                    <div>
                      <dt>Prior outreach</dt>
                      <dd>{r.priorOutreach.join(", ")} · historical</dd>
                    </div>
                  </dl>
                  <a
                    className="wf-source-link"
                    href={r.contactSource}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Contact source
                    <ArrowUpRight size={13} />
                  </a>
                  <div className="wf-warning">
                    <strong>Current eligibility is unknown</strong>
                    <p>
                      Fresh verification, suppression and sending state are not
                      connected. This record cannot be loaded or activated from
                      this workspace.
                    </p>
                  </div>
                  <label className="wf-label" htmlFor="wf-note">
                    Review note
                  </label>
                  <textarea
                    id="wf-note"
                    value={r.note}
                    onChange={(e) => {
                      const note = e.target.value;
                      mutateRow((_b, x) => {
                        x.note = note;
                      });
                    }}
                    rows={4}
                  />
                  <p className="wf-help">
                    Notes save automatically in this browser.
                  </p>
                </>
              )}
              {detailTab === "history" && (
                <>
                  <h3>Previous copy versions</h3>
                  {r.revisions.map((v, i) => (
                    <details className="wf-revision" key={i}>
                      <summary>
                        Version {v.version}{" "}
                        <Pill tone={v.approved ? "good" : "neutral"}>
                          {v.approved ? "Previously approved" : "Unapproved"}
                        </Pill>
                      </summary>
                      <strong>{v.subject}</strong>
                      <p>{v.body || "No email in this version"}</p>
                    </details>
                  ))}
                  {!r.revisions.length && (
                    <p className="wf-help">
                      No earlier versions. Saving a correction preserves the
                      current version here.
                    </p>
                  )}
                  <h3 className="wf-subheading">Record activity</h3>
                  {batch.history
                    .filter((h) => h.detail.includes(r.name))
                    .map((h) => (
                      <div className="wf-event" key={h.id}>
                        <div>
                          <strong>{h.title}</strong>
                          <p>{h.detail}</p>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </div>
            {(detailTab === "email" || detailTab === "research") && (
              <div className="wf-panel-footer">
                <span>
                  {dirty
                    ? "Unsaved changes"
                    : r.approved === r.version
                      ? `Version ${r.version} approved`
                      : "Changes saved locally"}
                </span>
                <Button
                  disabled={!dirty || !subject.trim()}
                  onClick={() => {
                    mutateRow((b, x) => revise(b, x, subject, body, opener));
                    setMessage(
                      "Saved a new version. Previous approval invalidated.",
                    );
                  }}
                >
                  Save changes
                </Button>
                {detailTab === "email" && (
                  <Button
                    primary
                    disabled={
                      dirty || checks(r).length > 0 || r.approved === r.version
                    }
                    onClick={() => mutateRow((b, x) => approve(b, x))}
                  >
                    <Check size={14} /> Approve v{r.version}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </ModalFrame>
      <ModalFrame
        open={config !== null}
        onClose={() => setConfig(null)}
        label={editingConfig ? "Configure batch" : "New batch"}
        overlayClassName="wf-overlay"
        contentClassName="wf-dialog"
      >
        {config && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveConfig();
            }}
          >
            <div className="wf-dialog-title">
              <div>
                <h2>{editingConfig ? "Configure batch" : "New batch"}</h2>
                <p>Define the criteria and execution checkpoints.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig(null)}
                aria-label="Close configuration"
              >
                <X size={18} />
              </button>
            </div>
            {(["name", "offer", "icp", "geography"] as const).map((key, i) => (
              <label className="wf-field" key={key}>
                {
                  [
                    "Batch name",
                    "Offer",
                    "Company criteria / ICP",
                    "Geography",
                  ][i]
                }
                {key === "icp" ? (
                  <textarea
                    value={config[key]}
                    onChange={(e) =>
                      setConfig({ ...config, [key]: e.target.value })
                    }
                    required
                    rows={3}
                  />
                ) : (
                  <input
                    value={config[key]}
                    onChange={(e) =>
                      setConfig({ ...config, [key]: e.target.value })
                    }
                    required
                    maxLength={300}
                  />
                )}
              </label>
            ))}
            <div className="wf-form-grid">
              <label className="wf-field">
                Batch size
                <input
                  type="number"
                  min={1}
                  max={10}
                  readOnly={editingConfig}
                  required
                  value={config.size}
                  onChange={(e) =>
                    setConfig({ ...config, size: Number(e.target.value) })
                  }
                />
              </label>
              <label className="wf-field">
                Tool budget · AUD
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  required
                  value={config.budget}
                  onChange={(e) =>
                    setConfig({ ...config, budget: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            {(
              [
                [
                  "source",
                  "Company source",
                  [
                    "Saved company register",
                    "Google Maps / Outscraper",
                    "Imported list",
                  ],
                ],
                [
                  "research",
                  "Research provider",
                  [
                    "Saved website evidence",
                    "Direct website research",
                    "Parallel research",
                  ],
                ],
                [
                  "model",
                  "Writing profile",
                  [
                    "Saved copy + local checks",
                    "Economical AI model",
                    "Reasoning AI model",
                  ],
                ],
              ] as const
            ).map(([key, label, options]) => (
              <label className="wf-field" key={key}>
                {label}
                <select
                  value={config[key]}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: e.target.value })
                  }
                >
                  {options.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="wf-checkbox">
              <input
                type="checkbox"
                checked={config.checkpoint}
                onChange={(e) =>
                  setConfig({ ...config, checkpoint: e.target.checked })
                }
              />
              <span>
                <strong>Review research before drafting</strong>
                <small>
                  Copy review and activation always remain explicit.
                </small>
              </span>
            </label>
            <p className="wf-help">
              This design uses the ten saved Sydney companies. Changed criteria,
              sources and models are configuration only; they do not call
              services or refresh the example assessment.
            </p>
            <div className="wf-dialog-footer">
              <Button onClick={() => setConfig(null)}>Cancel</Button>
              <button className="compass-btn-primary" type="submit">
                {editingConfig ? "Save configuration" : "Create batch"}
              </button>
            </div>
          </form>
        )}
      </ModalFrame>
      <ModalFrame
        open={dialog !== null}
        onClose={() => setDialog(null)}
        label={
          dialog === "bulk"
            ? "Review selected emails"
            : dialog === "reset"
              ? "Reset examples"
              : "Load & reconcile"
        }
        overlayClassName="wf-overlay"
        contentClassName="wf-dialog"
      >
        <div className="wf-dialog-title">
          <h2>
            {dialog === "bulk"
              ? "Review selected emails"
              : dialog === "reset"
                ? "Reset saved examples"
                : "Load & reconcile"}
          </h2>
          <button onClick={() => setDialog(null)} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {dialog === "bulk" ? (
          <>
            <p className="wf-help">
              Approve only after reviewing each exact subject and full email.
              Contact holds stay separate.
            </p>
            {approvable.map((x) => (
              <article className="wf-bulk-email" key={x.id}>
                <strong>
                  {x.name} · v{x.version}
                </strong>
                <h3>{x.subject}</h3>
                <p>{x.body}</p>
              </article>
            ))}
            <Button
              primary
              disabled={!approvable.length}
              onClick={() => {
                update((b) => {
                  for (const x of b.rows.filter((x) => selected.includes(x.id)))
                    approve(b, x);
                });
                setDialog(null);
                setSelected([]);
              }}
            >
              Approve {approvable.length} exact versions
            </Button>
          </>
        ) : dialog === "reset" ? (
          <>
            <p>
              Remove browser-local batches and edits, then restore the original
              ten-company example?
            </p>
            <div className="wf-dialog-footer">
              <Button onClick={() => setDialog(null)}>Keep changes</Button>
              <Button
                onClick={() => {
                  const b = createBatch(defaults, true);
                  setDb({ active: b.id, batches: [b] });
                  setSelected([]);
                  setFilter("all");
                  setSearch("");
                  setPage(0);
                  setDialog(null);
                }}
              >
                Reset examples
              </Button>
            </div>
          </>
        ) : (
          <>
            <Pill tone="warn">Provider not connected</Pill>
            <div className="wf-load-summary">
              <div>
                <strong>{approvedCount}</strong>
                <span>Copy approved</span>
              </div>
              <div>
                <strong>{issueCount}</strong>
                <span>Research / contact issues</span>
              </div>
              <div>
                <strong>0</strong>
                <span>Loaded recipients</span>
              </div>
            </div>
            <div className="wf-checklist">
              {[
                "Current contact verification",
                "Suppression and duplicate checks",
                "Paused campaign creation",
                "Recipient and exact-copy readback",
                "Separate activation approval",
              ].map((x) => (
                <div key={x}>
                  <span className="wf-empty-check" />
                  {x}
                  <span>Required</span>
                </div>
              ))}
            </div>
            <p className="wf-help">
              This interface is ready for refinement. Loading, reconciliation
              and activation are unavailable until connected to current Compass
              and Instantly state. No receipt or successful send is simulated.
            </p>
            <div className="wf-dialog-footer">
              <Button onClick={() => setDialog(null)}>Back to review</Button>
              <Button primary disabled onClick={() => {}}>
                Load paused campaign
              </Button>
            </div>
          </>
        )}
      </ModalFrame>
    </section>
  );
}
