"use client";
import { useEffect, useState } from "react";
import type {
  PipelineCompany,
  PipelineList,
  PipelineStage,
  WorkflowPolicy,
  WorkflowVersion,
} from "@/lib/outbound-pipeline";
import type { ExecutorCatalogue } from "@/lib/outbound-executor";
import { ResearchCards } from "./ResearchCards";
import { NumberField, useDraftHistory } from "./useDraftHistory";
import { OfferProfile } from "./OfferProfile";
import { Field, CommandNotice } from "./PipelineForms";
import { useEditorBuffer, usePipelineCommand, usePipelineRead } from "./pipeline-client";
const stages: PipelineStage[] = ["research", "contacts", "verify", "write"];
function emptyPolicy(): WorkflowPolicy {
  return {
    offer_version_id: "",
    icp_version_id: "",
    criteria: [],
    signals: [],
    tools: [],
    checkpoints: ["research", "write"],
    target_roles: [],
    verification: { accepted: ["valid"], reuse_days: 0 },
    budget: { amount: 0, currency: "AUD" },
    concurrency: 1,
  };
}
export function ResearchEditor({
  version,
  list,
  company,
  writable,
  onSaved,
  onDirty,
  workflows,
  onVersionSaved,
}: {
  onVersionSaved: (id: string) => void;
  workflows: WorkflowVersion[];
  version: WorkflowVersion | null;
  list: PipelineList | null;
  company: PipelineCompany | null;
  writable: boolean;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const executor=usePipelineRead<ExecutorCatalogue>("/executor");
  const [name, setName] = useEditorBuffer(
    `compass.pipeline.research.${list?.id || "new"}.${version?.id || "new"}.name`,
    version?.name || "",
  );
  const [policy, persistPolicy] = useEditorBuffer<WorkflowPolicy>(
    `compass.pipeline.research.${list?.id || "new"}.${version?.id || "new"}.policy`,
    structuredClone(version?.policy || emptyPolicy()),
  );
  const history = useDraftHistory(policy, persistPolicy);
  const setPolicy = history.change;
  const [dirty, setDirty] = useState(false);
  const command = usePipelineCommand(
    onSaved,
    `research.${list?.id || "new"}.${version?.id || "new"}`,
  );
  useEffect(() => {
    setDirty(name !== (version?.name || "") || JSON.stringify(policy) !== JSON.stringify(version?.policy || emptyPolicy()));
  }, [name, policy, version]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function update<K extends keyof WorkflowPolicy>(
    key: K,
    value: WorkflowPolicy[K],
  ) {
    setPolicy((old) => ({ ...old, [key]: value }));
    setDirty(true);
  }
  async function save() {
    const id = crypto.randomUUID();
    const savedPolicy = {
      ...policy,
      icp_version_id: crypto.randomUUID(),
      icp_name: policy.icp_name?.trim() || name.trim(),
      target_roles: policy.target_roles.filter(Boolean),
      tools: policy.tools.map((tool) => ({
        ...tool,
        missing_fields: tool.missing_fields.filter(Boolean),
      })),
    };
    const result = await command.save([
      {
        kind: "workflow",
        expected_revision: 0,
        record: {
          id,
          name,
          parent_id: version?.id || null,
          policy: savedPolicy,
        },
      },
      ...(list
        ? [
            {
              kind: "list" as const,
              expected_revision: list.revision,
              record: {
                id: list.id,
                name: list.name,
                notes: list.notes,
                workflow_version_id: id,
                offer_version_id: policy.offer_version_id,
                icp_version_id: savedPolicy.icp_version_id,
              },
            },
          ]
        : []),
    ]);
    if (result) { setDirty(false); onVersionSaved(id); }
  }
  return (
    <div className="op-editor-layout">
      <form
        className="op-document"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="op-editor-heading">
          <div>
            <h2>Build your research workflow</h2>
            <p>
              Save a new version for {list?.name || "future lists"}. Existing
              evidence and active runs retain their original version.
            </p>
          </div>
          <button
            className="compass-btn-primary"
            disabled={
              !writable ||
              command.busy ||
              command.uncertain ||
              !name.trim() ||
              !policy.offer_version_id ||
              !policy.icp_version_id ||
              !policy.criteria.length
            }
          >
            {command.busy ? "Saving…" : "Save workflow"}
          </button>
        </div>
        <div className="op-editor-history"><span>{dirty ? "Draft kept in this browser tab" : "Saved workflow"}</span><div className="op-inline"><button type="button" disabled={!history.canUndo || command.busy || command.uncertain} onClick={history.undo}>Undo</button><button type="button" disabled={!history.canRedo || command.busy || command.uncertain} onClick={history.redo}>Redo</button><button type="button" disabled={!dirty || command.busy || command.uncertain} onClick={() => { if (window.confirm("Revert to the saved workflow? Undo can recover this draft.")) { setPolicy(structuredClone(version?.policy || emptyPolicy())); setName(version?.name || ""); } }}>Revert to saved</button></div></div>
        <CommandNotice state={command} />
        <fieldset disabled={!writable || command.busy || command.uncertain}>
          <Field label="Workflow name">
            <input
              value={name}
              required
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <OfferProfile
            policy={policy}
            workflows={workflows}
            onChange={(value) => {
              setPolicy(value);
              setDirty(true);
            }}
          />
          <ResearchCards policy={policy} onChange={setPolicy} />
          <section>
            <div className="op-section-heading">
              <h3>How should the agent research?</h3>
              <button
                type="button"
                onClick={() =>
                  update("tools", [
                    ...policy.tools,
                    {
                      id: "",
                      stage: "research",
                      fallback_on: [],
                      missing_fields: [],
                      max_attempts: 1,
                      cache_max_age_days: 0,
                    },
                  ])
                }
              >
                Add tool step
              </button>
            </div>
            {executor.error&&<p role="alert">{executor.error}</p>}
            <p className="op-muted">
              The connected agent must verify adapter access. Saving a tool does
              not make it executable or authorize spend. No silent substitution.
            </p>
            {policy.tools.map((tool, index) => {
              const adapter=executor.data?.tools.find(value=>value.id===tool.id);
              const change = (patch: Partial<typeof tool>) =>
                update(
                  "tools",
                  policy.tools.map((v, i) =>
                    i === index ? { ...v, ...patch } : v,
                  ),
                );
              return (
                <div className="op-config-row" key={index}>
                  <div className="op-section-heading">
                    <strong>Step {index + 1}</strong>
                    <div className="op-inline">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...policy.tools];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          update("tools", next);
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "tools",
                            policy.tools.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="op-grid-two">
                    <Field label="Tool">
                      <select required value={tool.id} onChange={e=>change({id:e.target.value})}>
                        <option value="">Choose a tool</option>
                        {tool.id&&!executor.data?.tools.some(value=>value.id===tool.id&&value.stages.includes(tool.stage))&&<option value={tool.id}>Previously saved adapter ({tool.id})</option>}
                        {executor.data?.tools.filter(value=>value.stages.includes(tool.stage)).map(value=><option key={value.id} value={value.id}>{value.label}{value.available_stages.includes(tool.stage)?' · connected':' · needs connection'}</option>)}
                      </select>
                    </Field>
                    <Field label="Stage">
                      <select
                        value={tool.stage}
                        onChange={(e) =>
                          change({ stage: e.target.value as PipelineStage })
                        }
                      >
                        {stages.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {tool.id&&<p className="op-muted">{adapter?.available_stages.includes(tool.stage)?'Connected adapter ready for this stage.':'This stage needs a connected, probed adapter.'} {adapter?.reason||'Adapter availability has not been checked.'} {adapter?.checked_at?`Checked ${new Date(adapter.checked_at).toLocaleString('en-AU')}`:''}</p>}
                  <Field label="Fields to collect (comma separated)">
                    <input
                      value={tool.missing_fields.join(", ")}
                      onChange={(e) =>
                        change({
                          missing_fields: e.target.value
                            .split(",")
                            .map((v) => v.trim()),
                        })
                      }
                    />
                  </Field>
                  <div
                    className="op-inline"
                    role="group"
                    aria-label={`Step ${index + 1} fallback conditions`}
                  >
                    {(["empty", "insufficient", "retryable"] as const).map(
                      (v) => (
                        <label key={v}>
                          <input
                            type="checkbox"
                            checked={tool.fallback_on.includes(v)}
                            onChange={(e) =>
                              change({
                                fallback_on: e.target.checked
                                  ? [...tool.fallback_on, v]
                                  : tool.fallback_on.filter((x) => x !== v),
                              })
                            }
                          />
                          {v}
                        </label>
                      ),
                    )}
                  </div>
                  <div className="op-grid-two">
                    <Field label="Maximum attempts">
                      <NumberField min={1}
                        max={10}
                        value={tool.max_attempts}
                        onValue={(value) =>
                          change({ max_attempts: value })
                        } />
                    </Field>
                    <Field label="Reuse cached evidence (days)">
                      <NumberField min={0}
                        value={tool.cache_max_age_days}
                        onValue={(value) =>
                          change({ cache_max_age_days: value })
                        } />
                    </Field>
                  </div>
                </div>
              );
            })}
          </section>
          <section>
            <h3>Contacts and verification</h3>
            <Field
              label="Suitable contact roles (comma separated)"
              hint="Prepare all suitable contacts, retaining generic inboxes and phone-only outcomes."
            >
              <input
                value={policy.target_roles.join(", ")}
                onChange={(e) =>
                  update(
                    "target_roles",
                    e.target.value.split(",").map((v) => v.trim()),
                  )
                }
              />
            </Field>
            <Field
              label="Reuse valid verification (days)"
              hint="Zero requires verification in the current preparation run. Only explicitly valid results advance."
            >
              <NumberField min={0}
                value={policy.verification.reuse_days}
                onValue={(value) =>
                  update("verification", {
                    accepted: ["valid"],
                    reuse_days: value,
                  })
                } />
            </Field>
          </section>
          <section>
            <h3>Budget and review points</h3><p className="op-muted">A spending ceiling is not an instruction to spend. Work only starts when you queue a run and a connected agent claims it. Pause points let you review results before the next stage.</p>
            <div className="op-grid-two">
              <Field label="Spending limit">
                <NumberField min={0}
                  step={0.01}
                  value={policy.budget.amount}
                  onValue={(value) =>
                    update("budget", {
                      ...policy.budget,
                      amount: value,
                    })
                  } />
              </Field>
              <Field label="Currency">
                <input
                  maxLength={3}
                  value={policy.budget.currency}
                  onChange={(e) =>
                    update("budget", {
                      ...policy.budget,
                      currency: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Concurrent work items">
              <NumberField min={1}
                max={10}
                value={policy.concurrency}
                onValue={(value) => update("concurrency", value)} />
            </Field>
            <div
              className="op-inline"
              role="group"
              aria-label="Pause after stages"
            >
              {stages.map((stage) => (
                <label key={stage}>
                  <input
                    type="checkbox"
                    checked={policy.checkpoints.includes(stage)}
                    onChange={(e) =>
                      update(
                        "checkpoints",
                        e.target.checked
                          ? [...policy.checkpoints, stage]
                          : policy.checkpoints.filter((v) => v !== stage),
                      )
                    }
                  />
                  Pause after {stage}
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      </form>
      <aside className="op-context">
        <h3>Selected company</h3>
        {company ? (
          <>
            <strong>{company.name}</strong>
            <p>{[company.city, company.country].filter(Boolean).join(", ")}</p>
            <p>{company.reason || "No assessment recorded for this scope."}</p>
          </>
        ) : (
          <p>
            Select a real company in the table to compare its results while
            editing.
          </p>
        )}
        <h3>Version history</h3>
        <p>
          {version
            ? `${version.name} · revision ${version.revision}`
            : "New workflow"}
        </p>
        <p>
          Saving configuration does not start research. Return to the table to
          choose a scope and queue an agent run.
        </p>
        {dirty && <p role="status">Unsaved changes</p>}
      </aside>
    </div>
  );
}
