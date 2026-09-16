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
}: {
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
  const [policy, setPolicy] = useEditorBuffer<WorkflowPolicy>(
    `compass.pipeline.research.${list?.id || "new"}.${version?.id || "new"}.policy`,
    structuredClone(version?.policy || emptyPolicy()),
  );
  const [dirty, setDirty] = useState(false);
  const command = usePipelineCommand(
    onSaved,
    `research.${list?.id || "new"}.${version?.id || "new"}`,
  );
  useEffect(() => {
    if (
      name !== (version?.name || "") ||
      JSON.stringify(policy) !==
        JSON.stringify(version?.policy || emptyPolicy())
    )
      setDirty(true);
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
      icp_name: name,
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
    if (result) setDirty(false);
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
            <h2>Research configuration</h2>
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
              !policy.icp_version_id
            }
          >
            {command.busy ? "Saving…" : "Save version"}
          </button>
        </div>
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
          <section>
            <div className="op-section-heading">
              <h3>Fit and exclusion criteria</h3>
              <button
                type="button"
                onClick={() =>
                  update("criteria", [
                    ...policy.criteria,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      instructions: "",
                      required: true,
                      exclusion: false,
                    },
                  ])
                }
              >
                Add criterion
              </button>
            </div>
            <p className="op-muted">
              Missing evidence stays unknown. Exclusions take precedence; failed
              required criteria produce non-fit.
            </p>
            {policy.criteria.map((criterion, index) => (
              <div className="op-config-row" key={criterion.id}>
                <div className="op-section-heading">
                  <strong>Criterion {index + 1}</strong>
                  <button
                    type="button"
                    aria-label={`Remove criterion ${index + 1}`}
                    onClick={() =>
                      update(
                        "criteria",
                        policy.criteria.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                <Field label="Criterion">
                  <input
                    value={criterion.label}
                    required
                    onChange={(e) =>
                      update(
                        "criteria",
                        policy.criteria.map((v, i) =>
                          i === index ? { ...v, label: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Assessment instructions">
                  <textarea
                    value={criterion.instructions}
                    onChange={(e) =>
                      update(
                        "criteria",
                        policy.criteria.map((v, i) =>
                          i === index
                            ? { ...v, instructions: e.target.value }
                            : v,
                        ),
                      )
                    }
                  />
                </Field>
                <div className="op-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={criterion.required}
                      onChange={(e) =>
                        update(
                          "criteria",
                          policy.criteria.map((v, i) =>
                            i === index
                              ? { ...v, required: e.target.checked }
                              : v,
                          ),
                        )
                      }
                    />{" "}
                    Required
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={criterion.exclusion}
                      onChange={(e) =>
                        update(
                          "criteria",
                          policy.criteria.map((v, i) =>
                            i === index
                              ? { ...v, exclusion: e.target.checked }
                              : v,
                          ),
                        )
                      }
                    />{" "}
                    Exclusion
                  </label>
                </div>
              </div>
            ))}
          </section>
          <section>
            <div className="op-section-heading">
              <h3>Signals to collect</h3>
              <button
                type="button"
                onClick={() =>
                  update("signals", [
                    ...policy.signals,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      value_type: "text",
                      required: false,
                      collection_instructions: "",
                      acceptable_evidence: "",
                      usefulness_guidance: "",
                      writing_eligible: true,
                    },
                  ])
                }
              >
                Add signal
              </button>
            </div>
            {policy.signals.map((signal, index) => {
              const change = (patch: Partial<typeof signal>) =>
                update(
                  "signals",
                  policy.signals.map((v, i) =>
                    i === index ? { ...v, ...patch } : v,
                  ),
                );
              return (
                <div className="op-config-row" key={signal.id}>
                  <div className="op-section-heading">
                    <strong>Signal {index + 1}</strong>
                    <button
                      type="button"
                      aria-label={`Remove signal ${index + 1}`}
                      onClick={() =>
                        update(
                          "signals",
                          policy.signals.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="op-grid-two">
                    <Field label="Signal label">
                      <input
                        required
                        value={signal.label}
                        onChange={(e) => change({ label: e.target.value })}
                      />
                    </Field>
                    <Field label="Value type">
                      <select
                        value={signal.value_type}
                        onChange={(e) =>
                          change({
                            value_type: e.target
                              .value as typeof signal.value_type,
                          })
                        }
                      >
                        {["text", "number", "boolean", "date", "list"].map(
                          (v) => (
                            <option key={v}>{v}</option>
                          ),
                        )}
                      </select>
                    </Field>
                  </div>
                  <Field label="Collection instructions">
                    <textarea
                      value={signal.collection_instructions}
                      onChange={(e) =>
                        change({ collection_instructions: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Acceptable evidence">
                    <textarea
                      value={signal.acceptable_evidence}
                      onChange={(e) =>
                        change({ acceptable_evidence: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Usefulness for personalisation">
                    <textarea
                      value={signal.usefulness_guidance}
                      onChange={(e) =>
                        change({ usefulness_guidance: e.target.value })
                      }
                    />
                  </Field>
                  <div className="op-inline">
                    <label>
                      <input
                        type="checkbox"
                        checked={signal.required}
                        onChange={(e) => change({ required: e.target.checked })}
                      />{" "}
                      Required collection
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={signal.writing_eligible}
                        onChange={(e) =>
                          change({ writing_eligible: e.target.checked })
                        }
                      />{" "}
                      Eligible for writing
                    </label>
                  </div>
                </div>
              );
            })}
          </section>
          <section>
            <div className="op-section-heading">
              <h3>Tools and fallback order</h3>
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
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={tool.max_attempts}
                        onChange={(e) =>
                          change({ max_attempts: Number(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Reuse cached evidence (days)">
                      <input
                        type="number"
                        min="0"
                        value={tool.cache_max_age_days}
                        onChange={(e) =>
                          change({ cache_max_age_days: Number(e.target.value) })
                        }
                      />
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
              <input
                type="number"
                min="0"
                value={policy.verification.reuse_days}
                onChange={(e) =>
                  update("verification", {
                    accepted: ["valid"],
                    reuse_days: Number(e.target.value),
                  })
                }
              />
            </Field>
          </section>
          <section>
            <h3>Execution limits and checkpoints</h3>
            <div className="op-grid-two">
              <Field label="Spending limit">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={policy.budget.amount}
                  onChange={(e) =>
                    update("budget", {
                      ...policy.budget,
                      amount: Number(e.target.value),
                    })
                  }
                />
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
              <input
                type="number"
                min="1"
                max="10"
                value={policy.concurrency}
                onChange={(e) => update("concurrency", Number(e.target.value))}
              />
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
