"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  fit: string;
  status: string;
};
const emptyFilters: Filters = {
  q: "",
  city: "",
  suburb: "",
  country: "",
  fit: "",
  status: "",
};
export function WorkflowWorkspace() {
  const tableScroll = useRef(0);
  const router = useRouter(),
    params = useSearchParams();
  const stage = stages.includes(params.get("stage") as PipelineStage)
    ? (params.get("stage") as PipelineStage)
    : "list";
  const listId = params.get("list_id") || "";
  const [revision, setRevision] = useState(0),
    [filters, setFilters] = useState<Filters>(emptyFilters),
    [search, setSearch] = useState("");
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
  const companyPath = queryPath("companies", {
    list_id: listId,
    ...filters,
    stage: stage === "list" ? undefined : stage,
    after,
  });
  const rows = usePipelineRead<PipelinePage<PipelineCompany | RecipientRow>>(
    readable
      ? stage === "write"
        ? queryPath("recipients", {
            list_id: listId,
            ...filters,
            ...recipientFilters,
            stage: "write",
            after,
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
  const signals = usePipelineRead<PipelinePage<SignalObservation>>(
    readable && company
      ? queryPath("signals", { company_id: company.id })
      : null,
    revision,
  );
  const rowValues = rows.data?.records || [];
  const pageSelected =
    rowValues.length > 0 && rowValues.every((row) => selected.has(row.id));
  const scopeKey = JSON.stringify({ listId, stage, filters, recipientFilters });
  useEffect(() => {
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
  }, [listId, stage]);
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
    setAllMatching(false);
    setSelected((previous) => {
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
    if (!list || !workflow) return;
    await command.command("/runs", {
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
    setRunsOpen(true);
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
          <button onClick={refresh} disabled={rows.loading}>
            Refresh
          </button>
        </div>
      </header>
      {capabilities.loading && (
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
                {label(value)}
              </button>
            ))}
          </nav>
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
          <div hidden={view !== "table"}>
            <form
              className="op-filters"
              onSubmit={(event) => {
                event.preventDefault();
                setFilters({ ...filters, q: search });
              }}
            >
              <Field label="Search companies">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Company name or website"
                />
              </Field>
              <button disabled={false}>Search</button>
              {(["country", "city", "suburb"] as const).map((key) => (
                <Field
                  key={key}
                  label={key === "country" ? "Country code" : label(key)}
                >
                  <input
                    value={filters[key]}
                    maxLength={key === "country" ? 2 : undefined}
                    placeholder={key === "country" ? "AU, NZ, US…" : undefined}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        [key]:
                          key === "country"
                            ? e.target.value.toUpperCase()
                            : e.target.value,
                      })
                    }
                  />
                </Field>
              ))}
              <Field label="ICP match">
                <select
                  value={filters.fit}
                  onChange={(e) =>
                    setFilters({ ...filters, fit: e.target.value })
                  }
                >
                  <option value="">All fit outcomes</option>
                  {[
                    "unknown",
                    "anti_icp",
                    "non_fit",
                    "likely_fit",
                    "sure_fit",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Stage outcome">
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  <option value="">All outcomes</option>
                  {["ready", "held", "completed", "failed", "stale"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </Field>
              {stage === "write" && (
                <>
                  <Field label="Draft status">
                    <select
                      value={recipientFilters.draft_status}
                      onChange={(e) =>
                        setRecipientFilters({
                          ...recipientFilters,
                          draft_status: e.target.value,
                        })
                      }
                    >
                      <option value="">All drafts</option>
                      <option value="drafted">Drafted</option>
                      <option value="undrafted">Not drafted</option>
                    </select>
                  </Field>
                  <Field label="Mailbox verification">
                    <select
                      value={recipientFilters.verification_status}
                      onChange={(e) =>
                        setRecipientFilters({
                          ...recipientFilters,
                          verification_status: e.target.value,
                        })
                      }
                    >
                      <option value="">All verification outcomes</option>
                      {[
                        "valid",
                        "invalid",
                        "catch_all",
                        "unknown",
                        "risky",
                        "unverified",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </form>
            <div className="op-selection">
              <span>
                {allMatching
                  ? `${rows.data?.total_matching ?? "…"} matching ${stage === "write" ? "recipients" : "companies"}`
                  : `${selected.size} selected`}
                {rows.data
                  ? ` · ${rows.data.total_matching.toLocaleString()} matching ${stage === "write" ? "recipients" : "companies"}`
                  : ""}
              </span>
              <div className="op-inline">
                {selected.size > 0 && !allMatching && (
                  <button onClick={() => setAllMatching(true)}>
                    Select all matching
                  </button>
                )}
                {(selected.size > 0 || allMatching) && (
                  <button
                    onClick={() => {
                      setSelected(new Set());
                      setAllMatching(false);
                    }}
                  >
                    Clear selection
                  </button>
                )}
                <button
                  disabled={
                    !writable ||
                    blocked ||
                    !list ||
                    !workflow ||
                    stage === "list" ||
                    (stage === "write" &&
                      (!templateId ||
                        (workflow.policy.verification.reuse_days === 0 &&
                          !verificationRunId))) ||
                    (!selected.size && !allMatching)
                  }
                  onClick={() => void startRun()}
                >
                  Queue {stage === "list" ? "research" : stage}
                </button>
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
                Recipient grain · suitable, held and phone-only outcomes remain
                in their company’s contact history. Select a recipient to
                inspect its exact draft.
              </p>
            )}
            {rows.error && (
              <p className="op-error" role="alert">
                {rows.error}
              </p>
            )}
            <div className="op-table-scroll" aria-busy={rows.loading}>
              <table className="op-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Select this page"
                        checked={pageSelected || allMatching}
                        disabled={!rowValues.length}
                        onChange={() => {
                          setAllMatching(false);
                          setSelected((previous) => {
                            const next = new Set(previous);
                            for (const row of rowValues)
                              pageSelected
                                ? next.delete(row.id)
                                : next.add(row.id);
                            return next;
                          });
                        }}
                      />
                    </th>
                    {stage === "write" ? (
                      <>
                        <th scope="col">Recipient</th>
                        <th scope="col">Company</th>
                        <th scope="col">Suitability</th>
                        <th scope="col">Draft / reason</th>
                      </>
                    ) : (
                      <>
                        <th scope="col">Company</th>
                        <th scope="col">Location</th>
                        <th scope="col">ICP match</th>
                        <th scope="col">Stage</th>
                        <th scope="col">Reason</th>
                        <th scope="col">Membership</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rowValues.map((row) =>
                    stage === "write" ? (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${(row as RecipientRow).mailbox}`}
                            checked={selected.has(row.id) || allMatching}
                            onChange={() => toggle(row.id)}
                          />
                        </td>
                        <td>
                          <button
                            className="op-record-link"
                            onClick={() => {
                              setRecipient(row as RecipientRow);
                              edit("write");
                            }}
                          >
                            {(row as RecipientRow).mailbox}
                          </button>
                        </td>
                        <td>
                          {(row as RecipientRow).company_name ||
                            "Linked company"}
                        </td>
                        <td>
                          <Status
                            value={
                              (row as RecipientRow).suitable
                                ? "suitable"
                                : "held"
                            }
                          />
                        </td>
                        <td>
                          {(row as RecipientRow).draft_status ||
                            row.reason ||
                            "Not drafted"}
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${(row as PipelineCompany).name}`}
                            checked={selected.has(row.id) || allMatching}
                            onChange={() => toggle(row.id)}
                          />
                        </td>
                        <td>
                          <button
                            className="op-record-link"
                            onClick={() => {
                              setCompany(row as PipelineCompany);
                              setDetailOpen(true);
                            }}
                          >
                            {(row as PipelineCompany).name}
                          </button>
                          {(row as PipelineCompany).website && (
                            <small>{(row as PipelineCompany).website}</small>
                          )}
                        </td>
                        <td>
                          {[
                            (row as PipelineCompany).suburb,
                            (row as PipelineCompany).city,
                            (row as PipelineCompany).country,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Not recorded"}
                        </td>
                        <td>
                          <Status value={(row as PipelineCompany).fit} />
                        </td>
                        <td>
                          <Status
                            value={(row as PipelineCompany).stage_status}
                          />
                        </td>
                        <td className="op-reason">
                          {row.reason || "No result recorded"}
                        </td>
                        <td>
                          {(row as PipelineCompany).membership_id
                            ? "In this list"
                            : listId
                              ? "Not a member"
                              : "Database record"}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {!rowValues.length && (
                <p className="op-empty">
                  {rows.loading
                    ? "Loading records…"
                    : "No records match this scope. Change the filters or add existing companies to a list."}
                </p>
              )}
            </div>
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
              <span>Page {history.length + 1} · up to 100 records</span>
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
            {stage !== "write" && (
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
                    blocked ||
                    (!allMatching && !selected.size) ||
                    !targetList
                  }
                  onClick={() => setMembershipMode("add")}
                >
                  Add membership
                </button>
                <button
                  disabled={
                    !writable ||
                    blocked ||
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
            <section className="op-output">
              <PipelineJobsPanel
                key={`export.${listId}`}
                kind="export"
                listId={listId}
                writable={writable}
                filters={{
                  ...runScopeFilters(filters),
                  ...(stage === "write"
                    ? runScopeFilters(recipientFilters)
                    : {}),
                  ...(stage !== "list" ? { stage } : {}),
                }}
                companyIds={
                  stage !== "write" && !allMatching ? [...selected] : undefined
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
                  writable={writable}
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
            <section className="op-runs">
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
        overlayClassName="op-overlay"
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
              {[company.suburb, company.city, company.country]
                .filter(Boolean)
                .join(", ")}
            </p>
            <CompanyContacts key={company.id} companyId={company.id} />
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
