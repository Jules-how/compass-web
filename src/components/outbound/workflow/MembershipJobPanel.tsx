"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PIPELINE_VERSION } from "@/lib/outbound-pipeline";
import type {
  PipelineJob,
  PipelineJobItem,
} from "@/lib/outbound-pipeline-jobs";
import { CommandNotice, Status, label } from "./PipelineForms";
import {
  useEditorBuffer,
  usePipelineCommand,
  usePipelineRead,
} from "./pipeline-client";
export function MembershipJobPanel({
  listId,
  listName,
  operation,
  filters,
  companyIds,
  writable,
  onSaved,
}: {
  listId: string;
  listName: string;
  operation: "add" | "remove";
  filters: Record<string, string>;
  companyIds?: string[];
  writable: boolean;
  onSaved: () => void;
}) {
  const key = `membership.${listId}.${operation}`;
  const [jobId, setJobId] = useEditorBuffer(`compass.pipeline.job.${key}`, "");
  const [revision, setRevision] = useState(0),
    [processing, setProcessing] = useState(false),
    [inspect, setInspect] = useState(false),
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
  const command = usePipelineCommand(refresh, key);
  const state = usePipelineRead<{ job: PipelineJob }>(
    jobId ? `/jobs?job_id=${encodeURIComponent(jobId)}` : null,
    revision,
  );
  const items = usePipelineRead<{
    records: PipelineJobItem[];
    next_after: string | null;
  }>(
    jobId && inspect
      ? `/jobs?job_id=${encodeURIComponent(jobId)}&items=1${after ? `&after=${encodeURIComponent(after)}` : ""}`
      : null,
    revision,
  );
  const job = state.data?.job;
  async function send(
    action: "preview_membership" | "membership_chunk",
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
    })) as unknown as { job: PipelineJob } | null;
  }
  async function preview() {
    const id = crypto.randomUUID();
    setJobId(id);
    setAfter("");
    await send("preview_membership", id, 0, {
      list_id: listId,
      operation,
      filters,
      company_ids: companyIds?.length ? companyIds : undefined,
    });
  }
  async function apply() {
    if (!job) return;
    let current = job;
    setProcessing(true);
    try {
      while (live.current && ["preview", "running"].includes(current.status)) {
        const result = await send(
          "membership_chunk",
          current.id,
          current.revision,
          {},
        );
        if (!result) break;
        current = result.job;
      }
    } finally {
      if (live.current) setProcessing(false);
    }
  }
  const blocked = processing || command.busy || command.uncertain;
  return (
    <section className="op-job-panel">
      <h3>
        {operation === "add" ? "Add to" : "Remove from"} {listName}
      </h3>
      <p>
        {companyIds?.length
          ? `${companyIds.length} explicitly selected companies`
          : "All companies matching the current filters"}{" "}
        will be frozen before membership changes. Company records are retained.
      </p>
      <button disabled={!writable || blocked} onClick={() => void preview()}>
        Preview membership changes
      </button>
      <CommandNotice state={command} />
      {state.error && <p role="alert">{state.error}</p>}
      {job && (
        <div className="op-job-result">
          <Status value={job.status} />
          <p>
            Frozen {new Date(job.created_at).toLocaleString("en-AU")}. Later
            selection or filter changes do not change these additions or
            removals. Preview again to use the new scope.
          </p>
          <p>
            {job.total_count} frozen companies · {job.applied_count} applied ·{" "}
            {job.conflicted_count} conflicts · {job.failed_count} failed
          </p>
          {["preview", "running"].includes(job.status) && (
            <button
              className="compass-btn-primary"
              disabled={!writable || blocked}
              onClick={() => void apply()}
            >
              {processing
                ? "Applying…"
                : `Apply frozen ${operation === "add" ? "additions" : "removals"}`}
            </button>
          )}
          <button aria-expanded={inspect} onClick={() => setInspect(!inspect)}>
            Inspect frozen changes
          </button>
          {inspect && (
            <div>
              {items.error && <p role="alert">{items.error}</p>}
              {items.data?.records.map((item) => (
                <p key={item.id}>
                  <Status value={item.status} />{" "}
                  {String(
                    item.payload.row?.name ||
                      item.result.reason ||
                      "Company membership",
                  )}{" "}
                  {item.result.error ? label(String(item.result.error)) : ""}
                </p>
              ))}
              {items.data?.next_after && (
                <button onClick={() => setAfter(items.data!.next_after!)}>
                  Next changes
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
