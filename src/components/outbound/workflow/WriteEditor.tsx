"use client";
import { useEffect, useMemo, useState } from "react";
import {
  renderPipelineTemplate,
  type Copy,
  type Draft,
  type PipelineList,
  type PipelinePage,
  type Recipient,
  type SignalDefinition,
  type SignalObservation,
  type TemplatePolicy,
  type TemplateVersion,
} from "@/lib/outbound-pipeline";
import { previewSignalValues } from "./pipeline-ui-state";
import { PipelineJobsPanel } from "./PipelineJobsPanel";
import { EvidenceSource } from "./EvidenceSource";
import { Field, CommandNotice } from "./PipelineForms";
import {
  queryPath,
  useEditorBuffer,
  usePipelineCommand,
  usePipelineRead,
  usePipelineCatalogue,
} from "./pipeline-client";
const parts = ["subject", "opener", "body", "cta", "unsubscribe"] as const;
const names = {
  subject: "Subject",
  opener: "Opener",
  body: "Body",
  cta: "Call to action",
  unsubscribe: "Unsubscribe",
};
const emptyTemplate = (): TemplatePolicy => ({
  mode: "deterministic",
  subject: "",
  opener: "",
  body: "",
  cta: "",
  unsubscribe: "",
  slots: {},
  followups: [],
});
export function WriteEditor({
  version,
  lists,
  list,
  recipient,
  signals,
  writable,
  onSaved,
  onDirty,
  onVersionSaved,
}: {
  version: TemplateVersion | null;
  lists: PipelineList[];
  list: PipelineList | null;
  recipient: Recipient | null;
  signals: SignalDefinition[];
  writable: boolean;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
  onVersionSaved: (id: string) => void;
}) {
  const [name, setName] = useEditorBuffer(
      `compass.pipeline.write.${list?.id || "new"}.${version?.id || "new"}.name`,
      version?.name || "",
    ),
    [policy, setPolicy] = useEditorBuffer<TemplatePolicy>(
      `compass.pipeline.write.${list?.id || "new"}.${version?.id || "new"}.policy`,
      structuredClone(version?.policy || emptyTemplate()),
    ),
    [dirty, setDirty] = useState(false),
    [slotName, setSlotName] = useState("");
  const previousTemplate = usePipelineRead<PipelinePage<TemplateVersion>>(
    version?.parent_id
      ? queryPath("templates", { id: version.parent_id })
      : null,
  );
  const [affected, setAffected] = useState<string[]>(list ? [list.id] : []);
  const [revision, bump] = useState(0);
  const command = usePipelineCommand(
    () => {
      bump((v) => v + 1);
      onSaved();
    },
    `write.${list?.id || "new"}.${version?.id || "new"}`,
  );
  const observations = usePipelineRead<PipelinePage<SignalObservation>>(
    recipient
      ? queryPath("signals", { company_id: recipient.company_id })
      : null,
    revision,
  );
  const drafts = usePipelineCatalogue<Draft>(
    "drafts",
    Boolean(recipient),
    revision,
    { recipient_id: recipient?.id },
  );
  const recipientState = usePipelineRead<
    PipelinePage<Recipient & { current_draft_id: string | null }>
  >(recipient ? queryPath("recipients", { id: recipient.id }) : null, revision);
  const currentDraftId = recipientState.data?.records[0]?.current_draft_id;
  const currentDraftState = usePipelineRead<PipelinePage<Draft>>(
    currentDraftId ? queryPath("drafts", { id: currentDraftId }) : null,
    revision,
  );
  const currentDraft = currentDraftState.data?.records[0] || null;
  const [manual, setManual] = useEditorBuffer<{
    copy: Copy;
    previousId: string;
  } | null>(
    `compass.pipeline.recipient.${recipient?.id || "none"}.draft`,
    null,
  );
  useEffect(() => {
    if (
      name !== (version?.name || "") ||
      JSON.stringify(policy) !==
        JSON.stringify(version?.policy || emptyTemplate())
    )
      setDirty(true);
  }, [name, policy, version]);
  useEffect(() => {
    onDirty(dirty || Boolean(manual));
    return () => onDirty(false);
  }, [dirty, manual, onDirty]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || manual) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, manual]);
  const evidence = useMemo(() => {
    const values = observations.data?.records || [];
    const superseded = new Set(values.map((v) => v.supersedes_id));
    return values.filter((v) => !superseded.has(v.id));
  }, [observations.data]);
  const preview = useMemo(() => {
    if (policy.mode === "ai") return null;
    const { values } = previewSignalValues(evidence, signals);
    return renderPipelineTemplate(policy, values);
  }, [policy, evidence, signals]);
  function update(patch: Partial<TemplatePolicy>) {
    setPolicy((old) => ({ ...old, ...patch }));
    setDirty(true);
  }
  async function saveTemplate() {
    const result = await command.save([
      {
        kind: "template",
        expected_revision: 0,
        record: {
          id: crypto.randomUUID(),
          name,
          parent_id: version?.id || null,
          policy,
        },
      },
    ]);
    if (result) {
      setDirty(false);
      onVersionSaved(result.results[0].id);
    }
  }
  async function saveDraft(
    copy: Copy,
    provenance: "manual" | "restore",
    input_refs: string[],
    restoredTemplateId?: string,
  ) {
    if (!recipient || !version) return;
    const result = await command.save([
      {
        kind: "draft",
        expected_revision: 0,
        record: {
          id: crypto.randomUUID(),
          list_id: recipient.list_id,
          recipient_id: recipient.id,
          template_version_id:
            restoredTemplateId ||
            currentDraft?.template_version_id ||
            version.id,
          copy,
          provenance,
          input_refs,
          previous_id:
            provenance === "manual" && manual
              ? manual.previousId
              : currentDraft?.id || null,
        },
      },
    ]);
    if (result) setManual(null);
  }
  return (
    <div className="op-editor-layout op-write-layout">
      <div className="op-document">
        <div className="op-editor-heading">
          <div>
            <h2>Write</h2>
            <p>
              Draft recipients retain their company, evidence and exact previous
              copy.
            </p>
          </div>
          <button
            className="compass-btn-primary"
            disabled={
              !writable || command.busy || command.uncertain || !name.trim()
            }
            onClick={() => void saveTemplate()}
          >
            Save template version
          </button>
        </div>
        <CommandNotice state={command} />
        <fieldset disabled={!writable || command.busy || command.uncertain}>
          <Field label="Template name">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <Field label="Writing mode">
            <select
              value={policy.mode}
              onChange={(e) =>
                update({ mode: e.target.value as TemplatePolicy["mode"] })
              }
            >
              <option value="deterministic">
                Deterministic signal substitution
              </option>
              <option value="ai">AI writing from recorded evidence</option>
            </select>
          </Field>
          {policy.mode === "ai" && (
            <>
              <p className="op-notice">
                AI output requires a connected executor. The saved result is
                reused for export; preview does not generate new copy.
              </p>
              <Field label="Model">
                <input
                  value={policy.ai?.model || ""}
                  onChange={(e) =>
                    update({
                      ai: {
                        model: e.target.value,
                        prompt: policy.ai?.prompt || "",
                      },
                    })
                  }
                />
              </Field>
              <Field label="Grounded writing instructions">
                <textarea
                  value={policy.ai?.prompt || ""}
                  onChange={(e) =>
                    update({
                      ai: {
                        model: policy.ai?.model || "",
                        prompt: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            </>
          )}
          <div className="op-email-document">
            {parts.map((part) => (
              <Field key={part} label={names[part]}>
                <textarea
                  rows={part === "body" ? 6 : part === "opener" ? 3 : 2}
                  value={policy[part]}
                  onChange={(e) => update({ [part]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <section>
            <div className="op-section-heading">
              <h3>Signal slots</h3>
            </div>
            <p className="op-muted">
              Use [[slot_name]] in copy. Priority follows the selected signal
              order. Required missing slots block preparation.
            </p>
            {Object.entries(policy.slots).map(([key, slot]) => (
              <div className="op-config-row" key={key}>
                <div className="op-section-heading">
                  <strong>[[{key}]]</strong>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...policy.slots };
                      delete next[key];
                      update({ slots: next });
                    }}
                  >
                    Remove
                  </button>
                </div>
                <Field label="Signal priority (first supported value wins)">
                  <select
                    value=""
                    onChange={(e) => {
                      if (
                        e.target.value &&
                        !slot.signal_ids.includes(e.target.value)
                      )
                        update({
                          slots: {
                            ...policy.slots,
                            [key]: {
                              ...slot,
                              signal_ids: [...slot.signal_ids, e.target.value],
                            },
                          },
                        });
                    }}
                  >
                    <option value="">Add a signal</option>
                    {signals
                      .filter((v) => v.writing_eligible)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                  </select>
                </Field>
                <ol className="op-slot-order">
                  {slot.signal_ids.map((id, index) => (
                    <li key={id}>
                      <span>
                        {signals.find((v) => v.id === id)?.label ||
                          "Previously configured signal"}
                      </span>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const ids = [...slot.signal_ids];
                          [ids[index - 1], ids[index]] = [
                            ids[index],
                            ids[index - 1],
                          ];
                          update({
                            slots: {
                              ...policy.slots,
                              [key]: { ...slot, signal_ids: ids },
                            },
                          });
                        }}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update({
                            slots: {
                              ...policy.slots,
                              [key]: {
                                ...slot,
                                signal_ids: slot.signal_ids.filter(
                                  (v) => v !== id,
                                ),
                              },
                            },
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
                <Field label="Fallback text">
                  <textarea
                    value={slot.fallback}
                    onChange={(e) =>
                      update({
                        slots: {
                          ...policy.slots,
                          [key]: { ...slot, fallback: e.target.value },
                        },
                      })
                    }
                  />
                </Field>
                <label>
                  <input
                    type="checkbox"
                    checked={slot.required}
                    onChange={(e) =>
                      update({
                        slots: {
                          ...policy.slots,
                          [key]: { ...slot, required: e.target.checked },
                        },
                      })
                    }
                  />{" "}
                  Required
                </label>
              </div>
            ))}
            <div className="op-inline">
              <Field label="New slot name">
                <input
                  value={slotName}
                  onChange={(e) =>
                    setSlotName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
                  }
                />
              </Field>
              <button
                type="button"
                disabled={!slotName || Boolean(policy.slots[slotName])}
                onClick={() => {
                  update({
                    slots: {
                      ...policy.slots,
                      [slotName]: {
                        signal_ids: [],
                        required: true,
                        fallback: "",
                      },
                    },
                  });
                  setSlotName("");
                }}
              >
                Add slot
              </button>
            </div>
          </section>
          <section>
            <div className="op-section-heading">
              <h3>Follow-ups</h3>
              <button
                type="button"
                onClick={() =>
                  update({
                    followups: [
                      ...policy.followups,
                      { delay_days: 2, subject: "", body: "" },
                    ],
                  })
                }
              >
                Add follow-up
              </button>
            </div>
            {policy.followups.map((step, index) => (
              <div className="op-config-row" key={index}>
                <div className="op-section-heading">
                  <strong>Follow-up {index + 1}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        followups: policy.followups.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                <Field label="Days after previous email">
                  <input
                    type="number"
                    min={2}
                    value={step.delay_days}
                    onChange={(e) =>
                      update({
                        followups: policy.followups.map((v, i) =>
                          i === index
                            ? { ...v, delay_days: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Subject">
                  <input
                    value={step.subject}
                    onChange={(e) =>
                      update({
                        followups: policy.followups.map((v, i) =>
                          i === index ? { ...v, subject: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Body">
                  <textarea
                    value={step.body}
                    onChange={(e) =>
                      update({
                        followups: policy.followups.map((v, i) =>
                          i === index ? { ...v, body: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
              </div>
            ))}
          </section>
        </fieldset>
        <section>
          <h3>Apply to lists</h3>
          <p>
            Template application replaces draft copy including manual edits,
            retaining the previous template and exact draft history.
          </p>
          {lists.map((value) => (
            <label className="op-check" key={value.id}>
              <input
                type="checkbox"
                checked={affected.includes(value.id)}
                onChange={(e) =>
                  setAffected(
                    e.target.checked
                      ? [...affected, value.id]
                      : affected.filter((id) => id !== value.id),
                  )
                }
              />
              {value.name}
            </label>
          ))}
          {policy.mode==="ai"&&<p className="op-notice">AI revisions require the connected Write executor. Bulk deterministic application is unavailable for this template.</p>}
          <PipelineJobsPanel
            key={`apply.${list?.id || "none"}.${version?.id || "new"}`}
            kind="template_apply"
            listId={list?.id || ""}
            listIds={affected}
            templateId={version?.id}
            writable={writable&&policy.mode==="deterministic"}
            dirty={dirty}
            onSaved={() => {
              bump((v) => v + 1);
              onSaved();
            }}
          />
        </section>
        {version?.parent_id && (
          <details>
            <summary>Previous saved template</summary>
            {parts.map((part) => (
              <section key={part}>
                <h4>{names[part]}</h4>
                <p className="op-copy-text">
                  {previousTemplate.data?.records[0]?.policy[part] ||
                    (previousTemplate.loading
                      ? "Loading previous template…"
                      : "Empty")}
                </p>
              </section>
            ))}
          </details>
        )}
      </div>
      <aside className="op-context">
        <h3>Recipient preview</h3>
        {recipient ? (
          <>
            <strong>{recipient.mailbox}</strong>
            {observations.loading && <p role="status">Loading evidence…</p>}
            {observations.error && <p role="alert">{observations.error}</p>}
            {preview ? (
              <>
                {preview.missing.length > 0 && (
                  <p className="op-error" role="status">
                    Missing required slots: {preview.missing.join(", ")}
                  </p>
                )}
                <div className="op-email-preview">
                  {parts.map((part) => (
                    <section key={part}>
                      <h4>{names[part]}</h4>
                      <p className="op-copy-text">
                        {preview.copy[part] || "—"}
                      </p>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <p>
                AI preview appears after a grounded result is saved by the
                executor.
              </p>
            )}
            <h3>Grounding evidence</h3>
            {evidence.length ? (
              evidence.map((value) => (
                <article className="op-evidence" key={value.id}>
                  <strong>
                    {signals.find((v) => v.id === value.signal_id)?.label ||
                      "Saved signal"}
                  </strong>
                  <blockquote>{value.quote}</blockquote>
                  <EvidenceSource id={value.source_id} />
                  <p>
                    Evidence: {value.evidence_strength} · Usefulness:{" "}
                    {value.usefulness}
                  </p>
                  <small>
                    Observed{" "}
                    {new Date(value.observed_at).toLocaleDateString("en-AU")}
                  </small>
                </article>
              ))
            ) : (
              <p>No evidence is available for this recipient’s company.</p>
            )}
            <h3>Saved recipient draft</h3>
            {drafts.error && <p role="alert">{drafts.error}</p>}
            {currentDraft ? (
              <>
                <p>
                  {currentDraft.provenance} · revision {currentDraft.revision}
                  {currentDraft.approved ? " · approved snapshot" : ""}
                </p>
                {parts.map((part) => (
                  <Field key={part} label={names[part]}>
                    <textarea
                      value={(manual?.copy || currentDraft.copy)[part]}
                      disabled={!writable || command.busy || command.uncertain}
                      onChange={(e) =>
                        setManual({
                          copy: {
                            ...(manual?.copy || currentDraft.copy),
                            [part]: e.target.value,
                          },
                          previousId: manual?.previousId || currentDraft.id,
                        })
                      }
                    />
                  </Field>
                ))}
                <button
                  disabled={
                    !manual ||
                    !version ||
                    !writable ||
                    command.busy ||
                    command.uncertain
                  }
                  onClick={() =>
                    manual &&
                    void saveDraft(
                      manual.copy,
                      "manual",
                      currentDraft.input_refs,
                    )
                  }
                >
                  Save recipient revision
                </button>
                <details>
                  <summary>Previous exact drafts</summary>
                  {drafts.data?.next_after && (
                    <button disabled={drafts.loading} onClick={drafts.loadMore}>
                      Load older drafts
                    </button>
                  )}
                  {(drafts.data?.records || [])
                    .filter((v) => v.id !== currentDraft.id)
                    .map((value) => (
                      <article className="op-evidence" key={value.id}>
                        <p>
                          {value.provenance} ·{" "}
                          {new Date(value.created_at).toLocaleString("en-AU")}
                        </p>
                        <p className="op-copy-text">
                          {parts
                            .map((part) => value.copy[part])
                            .filter(Boolean)
                            .join("\n\n")}
                        </p>
                        <button
                          disabled={
                            !writable || command.busy || command.uncertain
                          }
                          onClick={() =>
                            void saveDraft(
                              value.copy,
                              "restore",
                              value.input_refs,
                              value.template_version_id,
                            )
                          }
                        >
                          Restore as new revision
                        </button>
                      </article>
                    ))}
                </details>
              </>
            ) : (
              <p>
                No saved draft. Queue the Write stage after saving a template.
              </p>
            )}
          </>
        ) : (
          <p>
            Open a recipient from the Write table to preview real copy and
            evidence.
          </p>
        )}
      </aside>
    </div>
  );
}
