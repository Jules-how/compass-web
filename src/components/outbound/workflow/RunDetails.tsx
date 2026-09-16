"use client";
import { useState } from "react";
import type {
  Attempt,
  PipelinePage,
  PipelineRun,
  WorkItem,
} from "@/lib/outbound-pipeline";
import { EvidenceSource } from "./EvidenceSource";
import { Status } from "./PipelineForms";
import { queryPath, usePipelineRead } from "./pipeline-client";
function RunHistory({ run, revision }: { run: PipelineRun; revision: number }) {
  const [after, setAfter] = useState(""),
    [itemId, setItemId] = useState("");
  const items = usePipelineRead<PipelinePage<WorkItem>>(
    queryPath("items", { run_id: run.id, after }),
    revision,
  );
  const attempts = usePipelineRead<PipelinePage<Attempt>>(
    itemId ? queryPath("attempts", { item_id: itemId }) : null,
    revision,
  );
  return (
    <div className="op-run-details">
      {items.error && <p role="alert">{items.error}</p>}
      {items.loading && <p role="status">Loading work items…</p>}
      <p className="op-muted">
        {items.data?.total_matching ?? "…"} work items. Costs and timings below
        cover recorded attempts only.
      </p>
      {items.data?.records.map((item, index) => (
        <div className="op-evidence" key={item.id}>
          <div className="op-inline">
            <strong>Work item {index + 1}</strong>
            <Status value={item.status} />
            <button
              aria-expanded={itemId === item.id}
              onClick={() => setItemId(itemId === item.id ? "" : item.id)}
            >
              Tool attempts
            </button>
          </div>
          {typeof item.result.reason === "string" && (
            <p>{item.result.reason}</p>
          )}
          {item.lease_until && (
            <small>
              Lease until {new Date(item.lease_until).toLocaleString("en-AU")}
            </small>
          )}
          {itemId === item.id && (
            <div>
              {attempts.error && <p role="alert">{attempts.error}</p>}
              {attempts.data?.records.map((attempt) => (
                <article className="op-evidence" key={attempt.id}>
                  <strong>{attempt.tool_id}</strong>{" "}
                  <Status value={attempt.status} />
                  <p>
                    {attempt.outcome || "Outcome not confirmed"} ·{" "}
                    {attempt.actual_cost === null
                      ? "Actual cost not confirmed"
                      : `${attempt.currency} ${attempt.actual_cost.toFixed(4)}`}{" "}
                    ·{" "}
                    {attempt.duration_ms === null
                      ? "Duration not recorded"
                      : `${(attempt.duration_ms / 1000).toFixed(1)}s`}
                  </p>
                  {attempt.source_ids.map((id) => (
                    <EvidenceSource key={id} id={id} />
                  ))}
                </article>
              ))}
              {attempts.data && !attempts.data.records.length && (
                <p>No provider attempts recorded.</p>
              )}
              {attempts.data?.next_after && (
                <p className="op-muted">
                  More attempts exist than this page. Inspect the agent run
                  history before assessing aggregate cost.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
      {items.data?.next_after && (
        <button
          onClick={() => {
            setAfter(items.data!.next_after!);
            setItemId("");
          }}
        >
          Next work items
        </button>
      )}
    </div>
  );
}

export function RunDetails({
  run,
  revision,
}: {
  run: PipelineRun;
  revision: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="op-run-details"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Work items and tool history</summary>
      {open && <RunHistory run={run} revision={revision} />}
    </details>
  );
}
