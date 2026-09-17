"use client";
import { useCallback, useState } from "react";
import { PIPELINE_VERSION } from "@/lib/outbound-pipeline";
import type {
  PipelineReadback,
  PipelineReadbackResult,
} from "@/lib/outbound-pipeline-readback";
import { CommandNotice, Status } from "./PipelineForms";
import {
  useEditorBuffer,
  usePipelineCommand,
  usePipelineRead,
} from "./pipeline-client";
type Action =
  | "start_baseline"
  | "start_reconcile"
  | "page"
  | "compare_chunk"
  | "finish"
  | "approve_baseline";
export function DeliveryReadbackPanel({
  manifestId,
  intendedCount,
  writable,
  onSaved,
  onHandoff,
}: {
  manifestId: string;
  intendedCount: number;
  writable: boolean;
  onSaved: () => void;
  onHandoff: () => void;
}) {
  const [readbackId, setReadbackId] = useEditorBuffer(
    `compass.pipeline.readback.${manifestId}`,
    "",
  );
  const [revision, setRevision] = useState(0),
    [inspect, setInspect] = useState(false),
    [after, setAfter] = useState("");
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
    onSaved();
  }, [onSaved]);
  const command = usePipelineCommand(refresh, `readback.${manifestId}`);
  const state = usePipelineRead<{ readback: PipelineReadback }>(
    readbackId
      ? `/delivery/readback?readback_id=${encodeURIComponent(readbackId)}`
      : null,
    revision,
  );
  const items = usePipelineRead<{
    records: PipelineReadbackResult[];
    next_after: string | null;
  }>(
    inspect && readbackId
      ? `/delivery/readback?readback_id=${encodeURIComponent(readbackId)}&items=1${after ? `&after=${encodeURIComponent(after)}` : ""}`
      : null,
    revision,
  );
  const readback = state.data?.readback;
  async function send(action: Action) {
    const start = action.startsWith("start_");
    const id = start ? crypto.randomUUID() : readbackId;
    if (start) {
      setReadbackId(id);
      setAfter("");
      setInspect(false);
    }
    await command.command("/delivery/readback", {
      schema_version: PIPELINE_VERSION,
      request_id: crypto.randomUUID(),
      source: "compass.outbound.ui",
      manifest_id: manifestId,
      readback_id: id,
      expected_revision: start ? 0 : readback?.revision,
      action,
      data: {},
    });
  }
  const blocked = !writable || command.busy || command.uncertain;
  return (
    <section className="op-job-panel">
      <h4>Provider baseline and reconciliation</h4>
      <p>
        Capture the paused campaign before upload. Review any existing
        recipients, then upload only the missing delta. After upload, reconcile
        actual recipients and exact copy against this same manifest.
      </p>
      <div className="op-actions">
        <button
          disabled={
            blocked ||
            Boolean(
              readback && (readback.approved || readback.phase === "reconcile"),
            )
          }
          onClick={() => void send("start_baseline")}
        >
          Capture pre-upload baseline
        </button>
        <button
          disabled={
            blocked ||
            !readback ||
            (readback.phase === "baseline" &&
              (!readback.approved || readback.status !== "complete"))
          }
          onClick={() => void send("start_reconcile")}
        >
          Start post-upload reconciliation
        </button>
      </div>
      <CommandNotice state={command} />
      {state.error && <p role="alert">{state.error}</p>}
      {readback && (
        <div>
          <strong>
            {readback.phase === "baseline"
              ? "Pre-upload baseline"
              : "Post-upload reconciliation"}
          </strong>{" "}
          <Status value={readback.status} />
          <p>
            {readback.scanned_count} provider rows read across{" "}
            {readback.page_count} pages.
          </p>
          {readback.status === "scanning" && (
            <button disabled={blocked} onClick={() => void send("page")}>
              Read next provider page (up to 100)
            </button>
          )}
          {readback.status === "comparing" && (
            <div className="op-actions">
              <button
                disabled={
                  blocked ||
                  Number(readback.summary.compared || 0) >= intendedCount
                }
                onClick={() => void send("compare_chunk")}
              >
                Compare next 100 intended recipients
              </button>
              <button
                disabled={
                  blocked ||
                  Number(readback.summary.compared || 0) < intendedCount
                }
                onClick={() => void send("finish")}
              >
                Complete readback checks
              </button>
            </div>
          )}
          <dl className="op-detail-facts">
            {(
              [
                ["intended", "Intended"],
                ["compared", "Compared"],
                ["observed", "Observed"],
                ["confirmed", "Confirmed"],
                ["missing", "Missing"],
                ["copy_conflicts", "Copy differences"],
                ["unexpected", "Unexpected"],
                ["duplicates", "Duplicates"],
                ["baseline_missing", "Missing baseline recipients"],
                ["baseline_changed", "Changed baseline recipients"],
              ] as const
            ).map(([key, title]) =>
              readback.summary[key] !== undefined ? (
                <div key={key}>
                  <dt>{title}</dt>
                  <dd>{readback.summary[key]}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {readback.summary.error && (
            <p role="alert">{readback.summary.error.replaceAll("_", " ")}</p>
          )}
          {readback.phase === "baseline" &&
            readback.status === "complete" &&
            !readback.approved && (
              <button
                disabled={blocked}
                onClick={() => void send("approve_baseline")}
              >
                Approve existing campaign baseline
              </button>
            )}
          {readback.phase === "baseline" &&
            readback.status === "complete" &&
            readback.approved && (
              <p>
                Baseline approved. The upload artifact contains only the
                required missing recipients.
              </p>
            )}
          {readback.phase === "reconcile" && readback.status === "complete" && (
            <p role="status">
              Provider reconciliation completed. The campaign remains paused.
            </p>
          )}
          {((readback.phase === "baseline" &&
            readback.status === "complete" &&
            readback.approved) ||
            (readback.phase === "reconcile" &&
              ["complete", "attention"].includes(readback.status))) && (
            <div className="op-actions">
              <a
                className="compass-btn-secondary"
                href={`/api/operator/outbound/pipeline/delivery/artifact?manifest_id=${encodeURIComponent(manifestId)}`}
                download
              >
                Download missing-recipient CSV
              </a>
              <button onClick={onHandoff}>Copy paused-load handoff</button>
            </div>
          )}
          <button aria-expanded={inspect} onClick={() => setInspect(!inspect)}>
            Inspect recipient readback
          </button>
          {inspect && (
            <div>
              {items.error && <p role="alert">{items.error}</p>}
              {items.data?.records.map((item) => (
                <p key={item.item_id}>
                  <strong>{item.email}</strong> <Status value={item.status} />
                </p>
              ))}
              {items.data?.next_after && (
                <button onClick={() => setAfter(items.data!.next_after!)}>
                  Next readback results
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
