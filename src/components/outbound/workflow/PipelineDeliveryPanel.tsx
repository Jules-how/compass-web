"use client";
import Link from "next/link";
import { DeliveryReadbackPanel } from "./DeliveryReadbackPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CompassCampaign } from "@/lib/campaigns";
import { CAMPAIGNS_QUERY_KEY } from "@/lib/campaigns-client";
import { useCachedJson } from "@/lib/use-cached-json";
import { PIPELINE_VERSION } from "@/lib/outbound-pipeline";
import type {
  DeliveryItem,
  DeliveryManifest,
} from "@/lib/outbound-pipeline-delivery";
import { compileStepBody } from "@/lib/outbound-copy";
import { CommandNotice, Field, Status, label } from "./PipelineForms";
import {
  useEditorBuffer,
  usePipelineCommand,
  usePipelineRead,
} from "./pipeline-client";
type Manifest = DeliveryManifest & {
  approved: boolean;
  approved_at: string | null;
};
type Response = { request_id: string; manifest: Manifest; result?: unknown };
export function PipelineDeliveryPanel({
  listId,
  workflowId,
  templateId,
  verificationRunId,
  recipientIds,
  filters,
  writable,
  onSaved,
}: {
  listId: string;
  workflowId: string;
  templateId: string;
  verificationRunId?: string;
  recipientIds?: string[];
  filters: Record<string, string>;
  writable: boolean;
  onSaved: () => void;
}) {
  const [copyMode, setCopyMode] = useState<
    "recipient_variables" | "existing_sequence"
  >("recipient_variables");
  const [campaignId, setCampaignId] = useState(""),
    [revision, setRevision] = useState(0),
    [building, setBuilding] = useState(false),
    [showItems, setShowItems] = useState(false),
    [after, setAfter] = useState(""),
    [notice, setNotice] = useState("");
  const [manifestId, setManifestId] = useEditorBuffer(
    `compass.pipeline.delivery.${listId}`,
    "",
  );
  const [previewEvidence, setPreviewEvidence] = useEditorBuffer(`compass.pipeline.provider-preview.${manifestId}`, "");
  const campaigns = useCachedJson<{ campaigns: CompassCampaign[] }>(
    CAMPAIGNS_QUERY_KEY,
    "/api/campaigns",
    { staleMs: 30000 },
  );
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
  const command = usePipelineCommand(refresh, `delivery.${listId}`);
  const state = usePipelineRead<{ manifest: Manifest }>(
    manifestId
      ? `/delivery?manifest_id=${encodeURIComponent(manifestId)}`
      : null,
    revision,
  );
  const items = usePipelineRead<{
    records: DeliveryItem[];
    next_after: string | null;
  }>(
    manifestId && showItems
      ? `/delivery?manifest_id=${encodeURIComponent(manifestId)}&items=1${after ? `&after=${encodeURIComponent(after)}` : ""}`
      : null,
    revision,
  );
  const manifest = state.data?.manifest;
  const blocked = command.busy || command.uncertain || building;
  async function send(
    action:
      | "create"
      | "build_chunk"
      | "approve"
      | "reserve"
      | "configure_sequence"
      | "approve_preview",
    id: string,
    expected_revision: number,
    data: object,
  ) {
    return (await command.command("/delivery", {
      schema_version: PIPELINE_VERSION,
      request_id: crypto.randomUUID(),
      source: "compass.outbound.ui",
      action,
      manifest_id: id,
      expected_revision,
      data,
    })) as unknown as Response | null;
  }
  async function create() {
    const id = crypto.randomUUID();
    setManifestId(id);
    setAfter("");
    setShowItems(false);
    await send("create", id, 0, {
      list_id: listId,
      copy_mode: copyMode,
      campaign_id: campaignId,
      workflow_version_id: workflowId,
      template_version_id: templateId,
      verification_run_id: verificationRunId || undefined,
      recipient_ids: recipientIds?.length ? recipientIds : undefined,
      filters,
    });
  }
  async function build() {
    if (!manifest) return;
    setBuilding(true);
    let current = manifest;
    try {
      while (live.current && current.status === "building") {
        const result = await send(
          "build_chunk",
          current.id,
          current.revision,
          {},
        );
        if (!result) break;
        current = result.manifest;
        if (!current) break;
      }
    } finally {
      if (live.current) setBuilding(false);
    }
  }
  async function handoff() {
    if (!manifest) return;
    const text = `Load the approved Compass outbound delivery manifest ${manifest.id} for campaign ${manifest.campaign_id}. Capture and approve the current provider baseline through /api/operator/outbound/pipeline/delivery/readback before upload. Fetch its exact approved missing-recipient CSV artifact from /api/operator/outbound/pipeline/delivery/artifact?manifest_id=${manifest.id}. Use the connected Chrome CSV upload path, keep the target campaign paused, then reconcile actual provider recipients, merge values, copy and settings against this same frozen manifest. Resume partial imports by reconciling first. Do not activate or send.`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(
        "Paused-load handoff copied. Paste it into the connected agent task.",
      );
    } catch {
      setNotice(
        `Clipboard unavailable. Ask the connected agent to load approved manifest ${manifest.id} through Chrome and reconcile it while keeping the campaign paused.`,
      );
    }
  }
  return (
    <section className="op-delivery">
      <h3>Prepare a paused campaign</h3>
      <p>
        Freeze send-ready recipients and exact copy separately from general CSV
        exports. Upload uses the connected agent’s Chrome session; this page
        does not start an agent or send email.
      </p>
      <Field label="Existing campaign">
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          disabled={blocked}
        >
          <option value="">Choose a reviewed campaign</option>
          {campaigns.data?.campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name} · {campaign.status}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Provider copy format">
        <select
          value={copyMode}
          onChange={(e) => setCopyMode(e.target.value as typeof copyMode)}
          disabled={blocked}
        >
          <option value="recipient_variables">
            Exact recipient drafts (empty paused campaign)
          </option>
          <option value="existing_sequence">
            Keep existing compatible campaign sequence
          </option>
        </select>
      </Field>
      {campaignId && (
        <Link href={`/sales/outbound/editor/${encodeURIComponent(campaignId)}`}>
          Review campaign copy and settings
        </Link>
      )}
      {campaigns.error && <p role="alert">Could not refresh campaigns.</p>}
      {(!listId || !workflowId || !templateId) && (
        <p className="op-notice">
          Choose a list, saved workflow and template before preparing delivery.
        </p>
      )}
      <button
        disabled={
          !writable ||
          blocked ||
          !listId ||
          !workflowId ||
          !templateId ||
          !campaignId
        }
        onClick={() => void create()}
      >
        Freeze delivery scope
      </button>
      <CommandNotice state={command} />
      {notice && (
        <p role="status" className="op-notice">
          {notice}
        </p>
      )}
      {state.error && (
        <p role="alert">
          {state.error}
          <button disabled={blocked} onClick={() => setRevision((v) => v + 1)}>
            Refresh manifest
          </button>
        </p>
      )}
      {manifest && (
        <div className="op-job-result">
          <div className="op-section-heading">
            <strong>
              {campaigns.data?.campaigns.find(
                (c) => c.id === manifest.campaign_id,
              )?.name || "Saved campaign"}{" "}
              · frozen delivery
            </strong>
            <Status value={manifest.status} />
          </div>
          <p>
            {manifest.total_count.toLocaleString()} intended recipients ·{" "}
            {manifest.pass_count.toLocaleString()} ready ·{" "}
            {manifest.hold_count.toLocaleString()} held
          </p>
          {manifest.status === "building" && (
            <button
              disabled={!writable || blocked}
              onClick={() => void build()}
            >
              {building
                ? "Checking recipients…"
                : "Check frozen recipients and copy"}
            </button>
          )}
          <details>
            <summary>Frozen sending settings and sequence</summary>
            <p>
              {manifest.context.settings.timezone} ·{" "}
              {manifest.context.settings.from}–{manifest.context.settings.to} ·
              daily limit {manifest.context.settings.daily_limit}
            </p>
            <p>
              Sending accounts:{" "}
              {manifest.context.settings.email_list.join(", ")}
            </p>
            {manifest.context.sequence.steps.map((step, index) => (
              <article className="op-evidence" key={step.id || index}>
                <strong>
                  {index === 0
                    ? "First email"
                    : `Follow-up ${index} · ${step.delay_days} days`}
                </strong>
                <h4>{step.subject}</h4>
                <p className="op-copy-text">
                  {compileStepBody(step, { includeCompliance: true })}
                </p>
              </article>
            ))}
          </details>
          <button
            aria-expanded={showItems}
            onClick={() => setShowItems(!showItems)}
          >
            {showItems ? "Hide recipients" : "Review recipients and holds"}
          </button>
          {showItems && (
            <div>
              {items.error && <p role="alert">{items.error}</p>}
              {items.data?.records.map((item) => (
                <article className="op-evidence" key={item.id}>
                  <strong>
                    {String(item.snapshot.recipient.mailbox || "Recipient")}
                  </strong>{" "}
                  <Status value={item.status} />
                  <p>{String(item.snapshot.company.name || "Company")}</p>
                  {(item.record?.reasons || item.snapshot.reasons).map(
                    (reason) => (
                      <p key={reason}>{label(reason)}</p>
                    ),
                  )}
                  {item.record?.rendered && (
                    <details>
                      <summary>Exact recipient copy</summary>
                      {item.record.rendered.steps.map((step, index) => (
                        <section key={index}>
                          <h4>{step.subject}</h4>
                          <p className="op-copy-text">{step.body}</p>
                        </section>
                      ))}
                    </details>
                  )}
                </article>
              ))}
              {items.data?.next_after && (
                <button onClick={() => setAfter(items.data!.next_after!)}>
                  Next recipients
                </button>
              )}
            </div>
          )}
          {manifest.status === "review" && !manifest.approved && (
            <button
              className="compass-btn-primary"
              disabled={!writable || blocked || !manifest.pass_count}
              onClick={() =>
                void send("approve", manifest.id, manifest.revision, {})
              }
            >
              Approve these {manifest.pass_count} ready recipients
            </button>
          )}
          {manifest.approved && (
            <>
              <p className="op-notice">
                This exact manifest is approved. Held records remain excluded.
              </p>
              {manifest.context.pipeline?.copy_mode ===
                "recipient_variables" && (
                <section>
                  <h4>Exact recipient copy in Instantly</h4>
                  <p>
                    Configure the approved subject and body variables on an
                    empty paused campaign before reserving the load. After
                    upload, preview an actual selected lead in Instantly and
                    record what you checked.
                  </p>
                  <button
                    disabled={
                      !writable || blocked || manifest.status !== "review"
                    }
                    onClick={() =>
                      void send(
                        "configure_sequence",
                        manifest.id,
                        manifest.revision,
                        {},
                      )
                    }
                  >
                    Configure approved sequence on empty paused campaign
                  </button>
                  <Field label="Actual provider preview evidence">
                    <textarea
                      value={previewEvidence}
                      onChange={(e) => setPreviewEvidence(e.target.value)}
                      placeholder="Selected recipient, preview checked, and source or date"
                    />
                  </Field>
                  <button
                    disabled={
                      !writable ||
                      blocked ||
                      previewEvidence.trim().length < 10 ||
                      manifest.status === "review"
                    }
                    onClick={() =>
                      void send(
                        "approve_preview",
                        manifest.id,
                        manifest.revision,
                        { evidence: previewEvidence.trim() },
                      )
                    }
                  >
                    Confirm actual selected-lead preview
                  </button>
                </section>
              )}
              {manifest.status === "review" && (
                <button
                  disabled={!writable || blocked}
                  onClick={() =>
                    void send("reserve", manifest.id, manifest.revision, {})
                  }
                >
                  Reserve paused browser load
                </button>
              )}
              <DeliveryReadbackPanel
                key={manifest.id}
                manifestId={manifest.id}
                intendedCount={manifest.pass_count}
                writable={writable && !blocked && manifest.status !== "review"}
                onSaved={refresh}
                onHandoff={() => void handoff()}
              />
            </>
          )}
          {manifest.status === "reserved" && (
            <p role="status">
              Awaiting connected agent upload. Reserved is not loaded or sent.
            </p>
          )}
          {manifest.status === "attention" && (
            <p className="op-error">
              Delivery needs attention. Review held records and provider
              differences before continuing.
            </p>
          )}
          <p className="op-muted">
            Provider reconciliation will report confirmed, missing, duplicate
            and unexpected recipients plus copy/settings differences. Until a
            verified receipt is present, delivery remains unconfirmed.
          </p>
        </div>
      )}
    </section>
  );
}
