"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { runScopeFilters } from "./pipeline-ui-state";
import { ModalFrame } from "@/components/ui/ModalFrame";
import {
  PIPELINE_VERSION,
  type PipelineCapabilities,
  type PipelineCompany,
  type PipelineList,
  type PipelinePage,
  type PipelineRun,
  type PipelineStage,
  type Recipient,
  type SignalObservation,
  type TemplateVersion,
  type WorkflowVersion,
} from "@/lib/outbound-pipeline";
import { RunDetails } from "./RunDetails";
import { MembershipJobPanel } from "./MembershipJobPanel";
import { PipelineDeliveryPanel } from "./PipelineDeliveryPanel";
import { PipelineJobsPanel } from "./PipelineJobsPanel";
import { CompanyContacts } from "./CompanyContacts";
import { EvidenceSource } from "./EvidenceSource";
import { CommandNotice, Field, Status, label } from "./PipelineForms";
import {
  pipelineRead,
  queryPath,
  usePipelineCommand,
  usePipelineRead,
  usePipelineCatalogue,
} from "./pipeline-client";
import { ResearchEditor } from "./ResearchEditor";
import { WriteEditor } from "./WriteEditor";
import "./pipeline.css";
import "./pipeline-repair.css";
import { useActivePane } from "@/components/ActivePane";
import { PipelineTable } from "./PipelineTable";
import { PipelineFilters } from "./PipelineFilters";
import { PIPELINE_STAGE_INFO, formatCompanyLocation, pipelineRunBlocker } from "./pipeline-view-model";
const stages: PipelineStage[] = [
  "list",
  "research",
  "contacts",
  "verify",
  "write",
];
type RecipientRow = Recipient & {
  company_name?: string;
  stage_status?: string;
  draft_status?: string;
};
type Filters = {
  q: string;
  city: string;
  suburb: string;
  country: string;
  administrative_region: string;
  fit: string;
  status: string;
};
const emptyFilters: Filters = {
  q: "",
  city: "",
  suburb: "",
  country: "",
  administrative_region: "",
  fit: "",
  status: "",
};
export function WorkflowWorkspace() {
  const tableScroll = useRef(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = useActivePane();
  const lastActiveQuery = useRef(searchParams.toString());
  if (active) lastActiveQuery.current = searchParams.toString();
  const visibleQuery = active ? searchParams.toString() : lastActiveQuery.current;
  const params = useMemo(() => new URLSearchParams(visibleQuery), [visibleQuery]);
  const stage = stages.includes(params.get("stage") as PipelineStage)
    ? (params.get("stage") as PipelineStage)
    : "list";
  const listId = params.get("list_id") || "";
  const [revision, setRevision] = useState(0),
    [filters, setFilters] = useState<Filters>(emptyFilters);
  const [pageScope, setPageScope] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [detailPane, setDetailPane] = useState<"research" | "contacts" | "verify">("research");
  const [after, setAfter] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [allMatching, setAllMatching] = useState(false);
  const [view, setView] = useState<"table" | "research" | "write">("table"),
    [dirty, setDirty] = useState(false);
  const [company, setCompany] = useState<PipelineCompany | null>(null),
    [recipient, setRecipient] = useState<RecipientRow | null>(null),
    [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false),
    [listName, setListName] = useState(""),
    [listNotes, setListNotes] = useState(""),
    [targetList, setTargetList] = useState("");
  const [recipientFilters, setRecipientFilters] = useState({
    draft_status: "",
    verification_status: "",
  });
  const [verificationRunId, setVerificationRunId] = useState("");
  const [templateId, setTemplateId] = useState(""),
    [notice, setNotice] = useState(""),
    [membershipMode, setMembershipMode] = useState<"add" | "remove" | null>(
      null,
    ),
    [runsOpen, setRunsOpen] = useState(false);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const command = usePipelineCommand(refresh);
  const capabilities = usePipelineRead<PipelineCapabilities>(
    "/capabilities",
    revision,
  );
  const readable =
    capabilities.data?.enabled && capabilities.data?.schema_ready;
  const writable = Boolean(readable && capabilities.data?.writable);
  const lists = usePipelineCatalogue<PipelineList>("lists", readable, revision);
  const workflows = usePipelineCatalogue<WorkflowVersion>(
    "workflows",
    readable,
    revision,
  );
  const templates = usePipelineCatalogue<TemplateVersion>(
    "templates",
    readable,
    revision,
  );
  const selectedList = usePipelineRead<PipelinePage<PipelineList>>(
    readable && listId ? queryPath("lists", { id: listId }) : null,
    revision,
  );
  const list =
    selectedList.data?.records[0] ||
    lists.data?.records.find((value) => value.id === listId) ||
    null;
  const selectedWorkflow = usePipelineRead<PipelinePage<WorkflowVersion>>(
    readable && list?.workflow_version_id
      ? queryPath("workflows", { id: list.workflow_version_id })
      : null,
    revision,
  );
  const workflow =
    selectedWorkflow.data?.records[0] ||
    workflows.data?.records.find(
      (value) => value.id === list?.workflow_version_id,
    ) ||
    null;
  const selectedTemplate = usePipelineRead<PipelinePage<TemplateVersion>>(
    readable && templateId ? queryPath("templates", { id: templateId }) : null,
    revision,
  );
  const template =
    selectedTemplate.data?.records[0] ||
    templates.data?.records.find((value) => value.id === templateId) ||
    null;
  const listOptions = [
    ...new Map(
      [...(lists.data?.records || []), ...(list ? [list] : [])].map((value) => [
        value.id,
        value,
      ]),
    ).values(),
  ];
  const workflowOptions = [
    ...new Map(
      [...(workflows.data?.records || []), ...(workflow ? [workflow] : [])].map(
        (value) => [value.id, value],
      ),
    ).values(),
  ];
  const templateOptions = [
    ...new Map(
      [...(templates.data?.records || []), ...(template ? [template] : [])].map(
        (value) => [value.id, value],
      ),
    ).values(),
  ];
  const scopeKey = JSON.stringify({ listId, stage, filters, recipientFilters });
  const queryAfter = pageScope === scopeKey ? after : "";
  const companyPath = queryPath("companies", {
    list_id: listId,
    ...filters,
    stage: stage === "list" ? undefined : stage,
    after: queryAfter,
  });
  const rows = usePipelineRead<PipelinePage<PipelineCompany | RecipientRow>>(
    readable
      ? stage === "write"
        ? queryPath("recipients", {
            list_id: listId,
            ...filters,
            ...recipientFilters,
            stage: "write",
            after: queryAfter,
          })
        : companyPath
      : null,
    revision,
  );
  const runs = usePipelineRead<PipelinePage<PipelineRun>>(
    readable && runsOpen ? queryPath("runs", { list_id: listId }) : null,
    revision,
  );
  const verificationRuns = usePipelineCatalogue<PipelineRun>(
    "runs",
    Boolean(readable && listId && stage === "write"),
    revision,
    { list_id: listId, status: "completed" },
  );
  const signals = usePipelineCatalogue<SignalObservation>(
    "signals", Boolean(readable && company && detailOpen), revision,
    { company_id: company?.id },
  );
  const rowValues = rows.data?.records || [];
  const pageSelected =
    rowValues.length > 0 && rowValues.every((row) => selected.has(row.id));
  useEffect(() => {
    setPageScope(scopeKey);
    setAfter("");
    setHistory([]);
    setSelected(new Set());
    setAllMatching(false);
  }, [scopeKey]);
  const linkedSelection = params.get("company_id");
  useEffect(() => {
    if (linkedSelection) setSelected(new Set([linkedSelection]));
  }, [linkedSelection, listId, stage]);
  useEffect(() => {
    setView("table");
    setRecipient(null);
    setVerificationRunId("");
    setExportOpen(false);
    setDetailOpen(false);
  }, [listId, stage]);
  useEffect(() => { setCompany(null); }, [listId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const leadId = params.get("lead_id");
    if (!leadId || !readable) return;
    const controller = new AbortController();
    void fetch(`/api/operator/crm/leads/${encodeURIComponent(leadId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not resolve this contact’s company link.");
        return response.json();
      })
      .then(async (body) => {
        const links = (body.links || []).filter(
          (link: { match_state?: string }) => link.match_state === "confirmed",
        );
        if (links.length !== 1) {
          setNotice(
            "This contact needs one confirmed company link in CRM before research can be queued.",
          );
          return;
        }
        const companyId = links[0].company_id;
        const result = await pipelineRead<PipelinePage<PipelineCompany>>(
          queryPath("companies", { id: companyId }),
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setCompany(result.records[0] || null);
          setDetailOpen(true);
          setNotice(
            "Contact linked to this company. Select a list and saved workflow to queue shared research.",
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(error.message);
      });
    return () => controller.abort();
  }, [params, readable]);
  function navigate(next: Record<string, string>) {
    if (
      dirty &&
      !window.confirm(
        "Leave the editor? Unsaved changes remain in this browser tab.",
      )
    )
      return;
    setDirty(false);
    const query = new URLSearchParams(params.toString());
    query.set("desk", "workflow");
    query.delete("lead_id");
    query.delete("company_id");
    for (const [key, value] of Object.entries(next))
      value ? query.set(key, value) : query.delete(key);
    router.push(`/sales/outbound?${query}`, { scroll: false });
  }
  function edit(next: "research" | "write") {
    if (
      dirty &&
      view !== next &&
      !window.confirm(
        "Leave the editor? Unsaved changes remain in this browser tab.",
      )
    )
      return;
    const main = document.getElementById("compass-main");
    if (view === "table") tableScroll.current = main?.scrollTop || 0;
    setView(next);
    requestAnimationFrame(() => {
      if (main) main.scrollTop = 0;
    });
  }
  function returnToTable() {
    if (
      dirty &&
      !window.confirm(
        "Leave the editor? Unsaved changes remain in this browser tab.",
      )
    )
      return;
    setDirty(false);
    setView("table");
    requestAnimationFrame(() => {
      const main = document.getElementById("compass-main");
      if (main) main.scrollTop = tableScroll.current;
    });
  }
  function toggle(id: string) {
    if (rows.loading || rows.error) return;
    if (allMatching) {
      setAllMatching(false);
      setSelected(new Set(rowValues.filter(row => row.id !== id).map(row => row.id)));
      setNotice("Selection now contains only the checked records on this page.");
      return;
    }
    setSelected(previous => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  async function createList() {
    const result = await command.save([
      {
        kind: "list",
        expected_revision: 0,
        record: {
          id: crypto.randomUUID(),
          name: listName.trim(),
          notes: listNotes || null,
          workflow_version_id: null,
          offer_version_id: null,
          icp_version_id: null,
        },
      },
    ]);
    if (result) {
      setCreateOpen(false);
      setListName("");
      setListNotes("");
      navigate({ list_id: result.results[0].id, stage: "list" });
    }
  }
  async function attachWorkflow(id: string) {
    if (!list) return;
    const chosen = workflows.data?.records.find((value) => value.id === id);
    if (!chosen) return;
    await command.save([
      {
        kind: "list",
        expected_revision: list.revision,
        record: {
          id: list.id,
          name: list.name,
          notes: list.notes,
          workflow_version_id: chosen.id,
          offer_version_id: chosen.policy.offer_version_id,
          icp_version_id: chosen.policy.icp_version_id,
        },
      },
    ]);
  }
  async function startRun() {
    if (!list || !workflow || runBlocker) return;
    const result = await command.command("/runs", {
      schema_version: PIPELINE_VERSION,
      request_id: crypto.randomUUID(),
      source: "compass.outbound.ui",
      action: "start",
      run_id: crypto.randomUUID(),
      expected_revision: 0,
      data: {
        list_id: list.id,
        workflow_version_id: workflow.id,
        stage,
        company_ids:
          allMatching || stage === "write" ? undefined : [...selected],
        recipient_ids:
          !allMatching && stage === "write" ? [...selected] : undefined,
        filters: allMatching
          ? {
              ...runScopeFilters(filters),
              stage,
              ...(stage === "write" ? runScopeFilters(recipientFilters) : {}),
            }
          : undefined,
        template_version_id: stage === "write" ? templateId : undefined,
        verification_run_id:
          stage === "write" && verificationRunId
            ? verificationRunId
            : undefined,
      },
    });
    if (result) {
      setRunsOpen(true);
      setNotice("Work queued in Compass. Copy the agent handoff in Runs to start execution.");
    }
  }
  async function copyRunHandoff(run: PipelineRun) {
    const text = `Continue Compass outbound run ${run.id}. Read its frozen scope and saved workflow/template. Claim a work item, register a connected executor session with actually probed adapters through MCP, and attach the session to the lease. Follow saved tools, fallback order, spending limits and checkpoints. Persist source evidence, attempt outcomes and stage receipts. The UI has queued work; it has not started an agent.`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(
        "Agent handoff copied. Paste it into the connected agent task.",
      );
    } catch {
      setNotice(
        `Clipboard unavailable. Ask the connected agent to continue run ${run.id} using its saved workflow and registered adapters.`,
      );
    }
  }
  async function runAction(
    run: PipelineRun,
    action: "resume" | "cancel" | "approve",
  ) {
    await command.command("/runs", {
      schema_version: PIPELINE_VERSION,
      request_id: crypto.randomUUID(),
      source: "compass.outbound.ui",
      action,
      run_id: run.id,
      expected_revision: run.revision,
      data: {},
    });
  }
  const blocked = command.busy || command.uncertain;
  const stageInfo = PIPELINE_STAGE_INFO[stage];
  const runBlocker = pipelineRunBlocker({
    writable, busy: command.busy, uncertain: command.uncertain,
    loading: rows.loading || pageScope !== scopeKey, error: rows.error,
    stage, listId: list?.id || "", workflowId: workflow?.id || "", templateId,
    selectedCount: selected.size, allMatching, total: rows.data?.total_matching || 0,
    requiresVerificationRun: workflow?.policy.verification.reuse_days === 0, verificationRunId,
  });
  return (
    <section className="op-pipeline" aria-label="Outbound lead pipeline">
      <header className="op-toolbar">
        <div className="op-inline">
          <Field label="Working list">
            <select
              value={listId}
              onChange={(e) => navigate({ list_id: e.target.value })}
            >
              <option value="">All companies</option>
              {listOptions.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </Field>
          <button onClick={() => setCreateOpen(true)} disabled={!writable}>
            New list
          </button>
        </div>
        <div className="op-inline">
          <button
            onClick={() => {
              setRunsOpen(!runsOpen);
              refresh();
            }}
            aria-expanded={runsOpen}
          >
            Runs
          </button>
          <button onClick={refresh} disabled={rows.loading}>Refresh</button>
          <button id="outbound-export-toggle" aria-expanded={exportOpen} aria-controls="outbound-export-panel" disabled={!readable || view !== "table"} onClick={() => {
            setExportOpen(value => !value);
            requestAnimationFrame(() => document.getElementById("outbound-export-panel")?.scrollIntoView({ block: "nearest" }));
          }}>Export / prepare</button>
        </div>
      </header>
      {capabilities.loading && !capabilities.data && (
        <p role="status" className="op-empty">
          Checking the shared database…
        </p>
      )}
      {(capabilities.error || (!capabilities.loading && !readable)) && (
        <div className="op-empty" role="alert">
          <h2>Outbound database unavailable</h2>
          <p>
            {capabilities.error ||
              capabilities.data?.reason ||
              "The pipeline schema or feature flag is not ready. Ask the connected agent to complete the database preflight."}
          </p>
          <button onClick={refresh}>Check again</button>
        </div>
      )}
      {readable && (
        <>
          <nav className="op-stages" aria-label="Pipeline stage">
            {stages.map((value) => (
              <button
                key={value}
                aria-current={stage === value ? "page" : undefined}
                onClick={() => navigate({ stage: value })}
              >
                {PIPELINE_STAGE_INFO[value].label}
              </button>
            ))}
          </nav>
          <div className="op-stage-intro">
            <div><h2>{view === "table" ? stageInfo.title : view === "research" ? "Research settings" : "Writing workspace"}</h2><p>{view === "table" ? stageInfo.description : "Changes save to the same Compass records used by your agent."}</p></div>
            <div className="op-inline">
              {view !== "table" ? <button onClick={returnToTable}>Back to leads</button> : stage === "research" ? <button onClick={() => edit("research")}>Research settings</button> : stage === "write" ? <button onClick={() => edit("write")}>Open writing editor</button> : null}
            </div>
          </div>
          {!writable && (
            <p className="op-notice">
              The shared database is read-only. Existing records remain
              inspectable.
            </p>
          )}
          <div className="op-inline op-catalogue-pages">
            {lists.data?.next_after && (
              <button disabled={lists.loading} onClick={lists.loadMore}>
                Load more lists
              </button>
            )}
            {workflows.data?.next_after && (
              <button disabled={workflows.loading} onClick={workflows.loadMore}>
                Load more workflows
              </button>
            )}
            {templates.data?.next_after && (
              <button disabled={templates.loading} onClick={templates.loadMore}>
                Load more templates
              </button>
            )}
          </div>
          <CommandNotice state={command} />
          {notice && (
            <p className="op-notice" role="status">
              {notice}
            </p>
          )}
          {[lists.error, workflows.error, templates.error]
            .filter(Boolean)
            .map((error) => (
              <p className="op-error" role="alert" key={error}>
                {error}
              </p>
            ))}
          <details className="op-setup">
            <summary><span>List setup</span><span className="op-setup-summary">{workflow?.name || (list ? "Choose a workflow" : "Choose a list to configure its workflow")}</span></summary>
          <div className="op-toolbar op-context-toolbar">
            <div className="op-inline">
              <Field label="Saved workflow">
                <select
                  value={list?.workflow_version_id || ""}
                  disabled={!list || !writable || blocked}
                  onChange={(e) => void attachWorkflow(e.target.value)}
                >
                  <option value="">Choose a workflow</option>
                  {workflowOptions.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button onClick={() => edit("research")}>Edit research</button>
              <Field label="Writing template">
                <select
                  value={templateId}
                  onChange={(e) => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Switch template? Unsaved changes remain in this browser tab.",
                      )
                    ) {
                      setDirty(false);
                      setTemplateId(e.target.value);
                    }
                  }}
                >
                  <option value="">New template</option>
                  {templateOptions.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button onClick={() => edit("write")}>Edit writing</button>
            </div>
            {view !== "table" && (
              <button onClick={returnToTable}>Back to table</button>
            )}
          </div>
          </details>
          <div hidden={view !== "table"}>
            <PipelineFilters stage={stage} value={filters} recipientValue={recipientFilters} onApply={(next, recipients) => {
              setFilters(next);
              setRecipientFilters(recipients);
            }} />
            <div className="op-selection">
              <div className="op-selection-text">
                <strong>{rows.data ? `${rows.data.total_matching.toLocaleString()} ${stage === "write" ? "recipients" : "companies"}` : rows.error ? "View unavailable" : "Loading records…"}</strong>
                {(selected.size > 0 || allMatching) && <small>{allMatching ? "All matching selected" : `${selected.size} selected`}</small>}
              </div>
              <div className="op-inline">
                {selected.size > 0 && !allMatching && <button disabled={rows.loading || Boolean(rows.error)} onClick={() => setAllMatching(true)}>Select all matching</button>}
                {(selected.size > 0 || allMatching) && <button onClick={() => { setSelected(new Set()); setAllMatching(false); }}>Clear selection</button>}
                {stage !== "list" ? <div className="op-next-action"><button className="compass-btn-primary" disabled={Boolean(runBlocker)} aria-describedby="outbound-run-help" onClick={() => void startRun()}>{stageInfo.action}</button><small id="outbound-run-help">{runBlocker || "Queues work for your connected agent; it does not send emails."}</small></div> : <button disabled={!list} onClick={() => navigate({ stage: "research" })}>Open research <span aria-hidden="true">→</span></button>}
              </div>
            </div>
            {stage === "write" && (
              <div className="op-inline">
                <Field label="Completed verification run">
                  <select
                    value={verificationRunId}
                    onChange={(e) => setVerificationRunId(e.target.value)}
                  >
                    <option value="">Choose verification scope</option>
                    {verificationRuns.data?.records
                      .filter((run) => run.stage === "verify")
                      .map((run) => (
                        <option key={run.id} value={run.id}>
                          {new Date(run.created_at).toLocaleString("en-AU")} ·{" "}
                          {run.scope_count} records
                        </option>
                      ))}
                  </select>
                </Field>
                {verificationRuns.data?.next_after && (
                  <button onClick={verificationRuns.loadMore}>
                    Load more verification runs
                  </button>
                )}
                <small>
                  {workflow?.policy.verification.reuse_days === 0
                    ? "A completed verification run is required before Write."
                    : "Saved verification reuse policy applies."}
                </small>
              </div>
            )}
            {stage === "write" && (
              <p className="op-muted">
                One row per email recipient. Open a row to inspect its saved copy.
                Phone-only and excluded contacts remain in the company’s contact history.
              </p>
            )}
            {rows.error && (
              <p className="op-error" role="alert">
                {rows.error}
              </p>
            )}
            <PipelineTable stage={stage} rows={rowValues} selected={selected} allMatching={allMatching} loading={rows.loading || pageScope !== scopeKey} error={rows.error} listId={listId}
              onToggle={toggle}
              onTogglePage={() => {
                setAllMatching(false);
                setSelected(previous => {
                  if (allMatching) return new Set();
                  const next = new Set(previous);
                  for (const row of rowValues) pageSelected ? next.delete(row.id) : next.add(row.id);
                  return next;
                });
              }}
              onCompany={row => { setCompany(row); setDetailPane(stage === "verify" ? "verify" : stage === "contacts" ? "contacts" : "research"); setDetailOpen(true); }}
              onRecipient={row => {
                if (dirty && !window.confirm("Switch recipient? Unsaved changes remain in this browser tab.")) return;
                setDirty(false);
                setRecipient(row);
                edit("write");
              }}
            />
            <div className="op-pagination">
              <button
                disabled={!history.length || rows.loading}
                onClick={() => {
                  setAfter(history.at(-1) || "");
                  setHistory(history.slice(0, -1));
                  if (stage === "write") setSelected(new Set());
                }}
              >
                Previous page
              </button>
              <span>Page {pageScope === scopeKey ? history.length + 1 : 1} · up to 100 records</span>
              <button
                disabled={!rows.data?.next_after || rows.loading}
                onClick={() => {
                  setHistory([...history, after]);
                  if (stage === "write") setSelected(new Set());
                  setAfter(rows.data?.next_after || "");
                }}
              >
                Next page
              </button>
            </div>
            {stage !== "write" && (selected.size > 0 || allMatching || membershipMode) && (
              <div className="op-membership">
                <Field label="Add selected companies to">
                  <select
                    value={targetList}
                    onChange={(e) => setTargetList(e.target.value)}
                  >
                    <option value="">Choose a list</option>
                    {listOptions.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  disabled={
                    !writable ||
                    blocked || rows.loading || Boolean(rows.error) || pageScope !== scopeKey ||
                    (!allMatching && !selected.size) ||
                    !targetList
                  }
                  onClick={() => setMembershipMode("add")}
                >
                  Add to list
                </button>
                <button
                  disabled={
                    !writable ||
                    blocked || rows.loading || Boolean(rows.error) || pageScope !== scopeKey ||
                    (!allMatching && !selected.size) ||
                    !listId
                  }
                  onClick={() => setMembershipMode("remove")}
                >
                  Remove from this list
                </button>
                {membershipMode && (
                  <MembershipJobPanel
                    key={`${membershipMode}.${membershipMode === "add" ? targetList : listId}`}
                    listId={membershipMode === "add" ? targetList : listId}
                    listName={
                      listOptions.find(
                        (value) =>
                          value.id ===
                          (membershipMode === "add" ? targetList : listId),
                      )?.name || "selected list"
                    }
                    operation={membershipMode}
                    filters={{
                      ...runScopeFilters(filters),
                      ...(listId ? { list_id: listId } : {}),
                      ...(stage !== "list" ? { stage } : {}),
                    }}
                    companyIds={allMatching ? undefined : [...selected]}
                    writable={writable && (allMatching || selected.size > 0)}
                    onSaved={refresh}
                  />
                )}
              </div>
            )}
            <section id="outbound-export-panel" className="op-output" hidden={!exportOpen}>
              <div className="op-section-heading"><h2>Export / prepare</h2><button onClick={() => { setExportOpen(false); document.getElementById("outbound-export-toggle")?.focus(); }}>Close export</button></div>
              <PipelineJobsPanel
                key={`export.${listId}`}
                kind="export"
                listId={listId}
                writable={writable && !blocked && !rows.loading && !rows.error && pageScope === scopeKey}
                filters={{
                  ...runScopeFilters(filters),
                  ...(stage === "write"
                    ? runScopeFilters(recipientFilters)
                    : {}),
                  ...(stage !== "list" ? { stage } : {}),
                }}
                companyIds={
                  stage !== "write" && !allMatching && selected.size ? [...selected] : undefined
                }
                recipientIds={
                  stage === "write" && !allMatching && selected.size
                    ? [...selected]
                    : undefined
                }
                onSaved={refresh}
              />
              {stage === "write" ? (
                <PipelineDeliveryPanel
                  key={`delivery.${listId}`}
                  listId={listId}
                  workflowId={workflow?.id || ""}
                  templateId={templateId}
                  verificationRunId={verificationRunId}
                  recipientIds={
                    !allMatching && selected.size ? [...selected] : undefined
                  }
                  filters={{
                    ...runScopeFilters(filters),
                    stage,
                    ...runScopeFilters(recipientFilters),
                  }}
                  writable={writable && !blocked && !rows.loading && !rows.error && pageScope === scopeKey}
                  onSaved={refresh}
                />
              ) : (
                <button onClick={() => navigate({ stage: "write" })}>
                  Open Write to prepare a paused campaign
                </button>
              )}
            </section>
          </div>
          {view === "research" && list?.workflow_version_id && !workflow && (
            <p role="status">
              {selectedWorkflow.error || "Loading saved workflow…"}
            </p>
          )}
          {view === "research" && (!list?.workflow_version_id || workflow) && (
            <ResearchEditor
              key={`${listId}:${workflow?.id || "new"}`}
              version={workflow}
              workflows={workflowOptions}
              list={list}
              company={company}
              writable={writable}
              onSaved={refresh}
              onDirty={setDirty}
            />
          )}
          {view === "write" && templateId && !template && (
            <p role="status">
              {selectedTemplate.error || "Loading saved template…"}
            </p>
          )}
          {view === "write" && (!templateId || template) && (
            <WriteEditor
              key={`${listId}:${templateId}:${recipient?.id || "none"}`}
              version={template}
              onVersionSaved={setTemplateId}
              lists={listOptions}
              list={list}
              recipient={recipient}
              signals={workflow?.policy.signals || []}
              writable={writable}
              onSaved={refresh}
              onDirty={setDirty}
            />
          )}
          {runsOpen && (
            <section className="op-runs" aria-label="Workflow runs">
              <div className="op-section-heading">
                <h2>Agent runs</h2>
                <button onClick={refresh}>Refresh run status</button>
              </div>
              <p>
                Queued work waits for a connected agent. Copy its handoff into
                an agent task to claim work with registered, probed tools. This
                interface does not start an agent automatically.
              </p>
              {runs.error && <p role="alert">{runs.error}</p>}
              {runs.loading && <p role="status">Loading runs…</p>}
              {runs.data?.records.map((run) => (
                <article className="op-run" key={run.id}>
                  <strong>
                    {label(run.stage)} · {run.scope_count} records
                  </strong>
                  <Status value={run.status} />
                  <button onClick={() => void copyRunHandoff(run)}>
                    Copy agent handoff
                  </button>
                  <RunDetails run={run} revision={revision} />
                  <span>
                    {run.status === "queued"
                      ? "Awaiting connected agent"
                      : run.checkpoint_reason || "No exception recorded"}
                  </span>
                  <div className="op-inline">
                    {["blocked", "failed"].includes(run.status) && (
                      <button
                        disabled={!writable || blocked}
                        onClick={() => void runAction(run, "resume")}
                      >
                        Resume
                      </button>
                    )}
                    {run.status === "checkpoint" && (
                      <button
                        disabled={!writable || blocked}
                        onClick={() => void runAction(run, "approve")}
                      >
                        Continue checkpoint
                      </button>
                    )}
                    {!["completed", "cancelled"].includes(run.status) && (
                      <button
                        disabled={!writable || blocked}
                        onClick={() => void runAction(run, "cancel")}
                      >
                        Cancel remaining work
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {runs.data && !runs.data.records.length && (
                <p>No runs recorded for this scope.</p>
              )}
            </section>
          )}
        </>
      )}
      <ModalFrame
        open={createOpen}
        onClose={() => {
          if (!command.busy && !command.uncertain) setCreateOpen(false);
        }}
        label="Create outbound list"
        overlayClassName="op-overlay"
        contentClassName="op-modal"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createList();
          }}
        >
          <h2>New list</h2>
          <Field label="List name">
            <input
              data-autofocus
              required
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={listNotes}
              onChange={(e) => setListNotes(e.target.value)}
            />
          </Field>
          <p>Creating a list does not copy, research or contact companies.</p>
          <CommandNotice state={command} />
          <div className="op-inline">
            <button
              type="button"
              disabled={blocked}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              className="compass-btn-primary"
              disabled={!writable || blocked || !listName.trim()}
            >
              Create list
            </button>
          </div>
        </form>
      </ModalFrame>
      <ModalFrame
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        label={company?.name || "Company detail"}
        overlayClassName="op-overlay op-detail-overlay"
        contentClassName="op-modal op-detail"
      >
        <div className="op-section-heading">
          <h2>{company?.name}</h2>
          <button onClick={() => setDetailOpen(false)}>Close</button>
        </div>
        {company && (
          <>
            <Status value={company.fit} />
            <p>{company.reason || "No fit assessment recorded."}</p>
            <p>
              {formatCompanyLocation(company)}
            </p>
            <nav className="op-detail-tabs" aria-label="Company details">
              <button aria-pressed={detailPane === "research"} onClick={() => setDetailPane("research")}>Research</button>
              <button aria-pressed={detailPane === "contacts"} onClick={() => setDetailPane("contacts")}>Contacts</button>
              <button aria-pressed={detailPane === "verify"} onClick={() => setDetailPane("verify")}>Email checks</button>
            </nav>
            <div hidden={detailPane === "research"}><CompanyContacts key={company.id} companyId={company.id} mode={detailPane === "verify" ? "verify" : "all"} /></div>
            <div hidden={detailPane !== "research"}>
            <h3>Research evidence</h3>
            {signals.error && <p role="alert">{signals.error}</p>}
            {signals.data?.records.map((signal) => (
              <article className="op-evidence" key={signal.id}>
                <strong>
                  {workflow?.policy.signals.find(
                    (value) => value.id === signal.signal_id,
                  )?.label || "Saved signal"}
                </strong>
                <blockquote>{signal.quote}</blockquote>
                <EvidenceSource id={signal.source_id} />
                <p>
                  Evidence {signal.evidence_strength} · Usefulness{" "}
                  {signal.usefulness}
                </p>
                <small>
                  {new Date(signal.observed_at).toLocaleDateString("en-AU")}
                </small>
              </article>
            ))}
            {signals.data && !signals.data.records.length && (
              <p>
                No signal observations recorded. Choose this company and queue
                research in the shared workflow.
              </p>
            )}
            {signals.data?.next_after && <button disabled={signals.loading} onClick={signals.loadMore}>Load more evidence</button>}
            </div>
            <div className="op-inline">
              <button
                onClick={() => {
                  setSelected(new Set([company.id]));
                  setAllMatching(false);
                  setDetailOpen(false);
                  navigate({ stage: "research", company_id: company.id });
                }}
              >
                Select for research
              </button>
              <button
                onClick={() => {
                  setDetailOpen(false);
                  edit("research");
                }}
              >
                View research configuration
              </button>
            </div>
          </>
        )}
      </ModalFrame>
    </section>
  );
}
