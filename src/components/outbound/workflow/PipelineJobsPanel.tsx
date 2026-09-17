"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PIPELINE_VERSION } from "@/lib/outbound-pipeline";
import {
  COMPANY_EXPORT_COLUMNS,
  RECIPIENT_EXPORT_COLUMNS,
  type PipelineJob,
  type PipelineJobItem,
} from "@/lib/outbound-pipeline-jobs";
import { CommandNotice, Field, Status, label } from "./PipelineForms";
import {
  useEditorBuffer,
  usePipelineCommand,
  usePipelineRead,
} from "./pipeline-client";
type Props = {
  kind: "template_apply" | "export";
  listId: string;
  listIds?: string[];
  templateId?: string;
  writable: boolean;
  dirty?: boolean;
  filters?: Record<string, string>;
  companyIds?: string[];
  recipientIds?: string[];
  onSaved: () => void;
};
type JobResponse = { request_id: string; job: PipelineJob; processed?: number };
export function PipelineJobsPanel({
  kind,
  listId,
  listIds,
  templateId,
  writable,
  dirty,
  filters,
  companyIds,
  recipientIds,
  onSaved,
}: Props) {
  const key = `${kind}.${listId}.${templateId || "dataset"}`;
  const [jobId, setJobId] = useEditorBuffer(`compass.pipeline.job.${key}`, "");
  const [revision, setRevision] = useState(0),
    [grain, setGrain] = useState<"companies" | "recipients">("companies"),
    [columns, setColumns] = useState<string[]>([
      "name",
      "website",
      "country",
      "city",
      "fit",
    ]);
  const [processing, setProcessing] = useState(false),
    [showItems, setShowItems] = useState(false),
    [after, setAfter] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const refresh = useCallback(() => {
    setRevision((v) => v + 1);
    onSaved();
  }, [onSaved]);
  const command = usePipelineCommand(refresh, `job.${key}`);
  const state = usePipelineRead<{ job: PipelineJob }>(
    jobId ? `/jobs?job_id=${encodeURIComponent(jobId)}` : null,
    revision,
  );
  const items = usePipelineRead<{
    records: PipelineJobItem[];
    next_after: string | null;
  }>(
    jobId && showItems
      ? `/jobs?job_id=${encodeURIComponent(jobId)}&items=1${after ? `&after=${encodeURIComponent(after)}` : ""}`
      : null,
    revision,
  );
  const job = state.data?.job;
  const aiApply =
    kind === "template_apply" &&
    Boolean(
      job?.config.policy &&
        typeof job.config.policy === "object" &&
        (job.config.policy as { mode?: string }).mode === "ai",
    );
  const availableColumns =
    grain === "companies" ? COMPANY_EXPORT_COLUMNS : RECIPIENT_EXPORT_COLUMNS;
  async function send(
    action: "preview_apply" | "apply_chunk" | "create_export" | "export_chunk",
    id: string,
    expected_revision: number,
    data: object,
  ) {
    return (await command.command("/jobs", {
      schema_version: PIPELINE_VERSION,
      request_id: crypto.randomUUID(),
      source: "compass.outbound.ui",
      action,
      job_id: id,
      expected_revision,
      data,
    })) as unknown as JobResponse | null;
  }
  async function prepare() {
    if (!listId) return;
    const id = crypto.randomUUID();
    setJobId(id);
    setAfter("");
    setShowItems(false);
    await send(
      kind === "template_apply" ? "preview_apply" : "create_export",
      id,
      0,
      kind === "template_apply"
        ? {
            current_list_id: listId,
            list_ids: listIds?.length ? listIds : [listId],
            template_version_id: templateId,
          }
        : {
            list_id: listId,
            grain,
            columns,
            filters:
              grain === "companies"
                ? Object.fromEntries(
                    Object.entries(filters || {}).filter(
                      ([key]) =>
                        !["draft_status", "verification_status"].includes(key),
                    ),
                  )
                : filters,
            recipient_ids:
              grain === "recipients" && recipientIds?.length
                ? recipientIds
                : undefined,
            company_ids:
              grain === "companies" && companyIds?.length
                ? companyIds
                : undefined,
          },
    );
  }
  async function process() {
    if (!job || aiApply) return;
    setProcessing(true);
    let current = job;
    try {
      while (
        live.current &&
        !["completed", "attention"].includes(current.status) &&
        !(
          kind === "template_apply" &&
          current.config.policy &&
          typeof current.config.policy === "object" &&
          (current.config.policy as { mode?: string }).mode === "ai"
        )
      ) {
        const result = await send(
          kind === "template_apply" ? "apply_chunk" : "export_chunk",
          current.id,
          current.revision,
          {},
        );
        if (!result) break;
        current = result.job;
        if (!current) break;
      }
    } finally {
      if (live.current) setProcessing(false);
    }
  }
  const blocked = command.busy || command.uncertain || processing;
  return (
    <section
      className="op-job-panel"
      aria-label={
        kind === "template_apply" ? "Template application" : "CSV export"
      }
    >
      {kind === "export" && (
        <>
          <h3>CSV export</h3>
          <p>
            Freeze a general dataset export. This does not approve recipients
            for sending or upload them.
          </p>
          <Field label="Record grain">
            <select
              value={grain}
              disabled={blocked}
              onChange={(e) => {
                const next = e.target.value as typeof grain;
                setGrain(next);
                setColumns(
                  next === "companies"
                    ? ["name", "website", "country", "city", "fit"]
                    : [
                        "company_name",
                        "name",
                        "mailbox",
                        "subject",
                        "opener",
                        "body",
                        "cta",
                        "unsubscribe",
                      ],
                );
              }}
            >
              <option value="companies">Companies</option>
              <option value="recipients">Recipients</option>
            </select>
          </Field>
          <fieldset disabled={blocked} className="op-export-columns">
            <legend>Columns</legend>
            {availableColumns.map((column) => (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  onChange={(e) =>
                    setColumns(
                      e.target.checked
                        ? [...columns, column]
                        : columns.filter((v) => v !== column),
                    )
                  }
                />
                {label(column)}
              </label>
            ))}
          </fieldset>
          <p className="op-muted">
            {grain === "companies" && companyIds?.length
              ? `${companyIds.length} selected companies`
              : grain === "recipients" && recipientIds?.length
                ? `${recipientIds.length} selected recipients`
                : "All matching records in the current list"}{" "}
            · {columns.length} columns
          </p>
        </>
      )}
      {!listId && <p className="op-notice">Choose a list first.</p>}
      {dirty && kind === "template_apply" && (
        <p className="op-notice">
          Save the template version before previewing its impact.
        </p>
      )}
      <button
        disabled={
          !writable ||
          blocked ||
          !listId ||
          (kind === "template_apply"
            ? !templateId || dirty || !listIds?.length
            : !columns.length)
        }
        onClick={() => void prepare()}
      >
        {kind === "template_apply"
          ? "Preview affected recipients"
          : "Prepare export"}
      </button>
      <CommandNotice state={command} />
      {job && (
        <div className="op-job-result">
          <div className="op-section-heading">
            <strong>
              {kind === "template_apply"
                ? "Frozen template application"
                : "Frozen export"}
            </strong>
            <Status value={job.status} />
          </div>
          <p>
            Frozen {new Date(job.created_at).toLocaleString("en-AU")}. Changing
            controls above does not change this job; prepare a new preview to
            use a different scope.
          </p>
          <p>
            {job.total_count.toLocaleString()} records ·{" "}
            {job.applied_count.toLocaleString()} processed ·{" "}
            {job.conflicted_count.toLocaleString()} conflicts ·{" "}
            {job.failed_count.toLocaleString()} failed
          </p>
          {kind === "template_apply" && (
            <p>
              {Number(job.config.manual_count || 0).toLocaleString()} manually
              edited drafts are included. Previous copy and template versions
              remain in history.
            </p>
          )}
          {["preview", "running"].includes(job.status) && !aiApply && (
            <button
              className="compass-btn-primary"
              disabled={!writable || blocked}
              onClick={() => void process()}
            >
              {processing
                ? "Processing…"
                : kind === "template_apply"
                  ? "Apply frozen template changes"
                  : "Build CSV artifact"}
            </button>
          )}
          {aiApply && ["preview", "running"].includes(job.status) && (
            <p className="op-notice">
              Frozen AI application waits for the connected Write executor to
              submit grounded copies. This operator control does not apply AI
              copy.
            </p>
          )}
          {job.status === "completed" && kind === "export" && (
            <a
              className="compass-btn-secondary"
              href={`/api/operator/outbound/pipeline/jobs/artifact?job_id=${encodeURIComponent(job.id)}`}
              download
            >
              Download CSV
            </a>
          )}
          {job.status === "attention" && (
            <p className="op-error">
              Some records need attention. Inspect the frozen results before
              preparing another job.
            </p>
          )}
          <button
            onClick={() => setShowItems(!showItems)}
            aria-expanded={showItems}
          >
            {showItems ? "Hide records" : "Inspect records and exceptions"}
          </button>
          {showItems && (
            <div>
              {items.error && <p role="alert">{items.error}</p>}
              {items.data?.records.map((item) => (
                <div className="op-evidence" key={item.id}>
                  <Status value={item.status} />
                  <p>
                    {String(
                      item.result.reason ||
                        item.result.error ||
                        item.payload.row?.name ||
                        item.payload.row?.mailbox ||
                        "Frozen recipient record",
                    )}
                  </p>
                  {item.payload.manual && <small>Manual draft included</small>}
                </div>
              ))}
              {items.data?.next_after && (
                <button onClick={() => setAfter(items.data!.next_after!)}>
                  Next records
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {state.error && (
        <p className="op-error" role="alert">
          {state.error}
          <button disabled={blocked} onClick={() => setRevision((v) => v + 1)}>
            Refresh job
          </button>
        </p>
      )}
    </section>
  );
}
