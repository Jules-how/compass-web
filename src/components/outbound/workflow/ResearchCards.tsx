"use client";
import type { WorkflowPolicy, SignalDefinition } from "@/lib/outbound-pipeline";
import { Plus, X, SlidersHorizontal } from "lucide-react";
import { Field } from "./PipelineForms";
export function ResearchCards({ policy, onChange }: { policy: WorkflowPolicy; onChange: (policy: WorkflowPolicy) => void }) {
  return <>
    <section aria-labelledby="op-criteria-heading">
      <div className="op-section-heading"><div><h3 id="op-criteria-heading">Who is a good fit?</h3><p className="op-muted">These rules define your saved ICP. A missing fact stays unknown, not a failed match.</p></div>
        <button type="button" onClick={() => onChange({ ...policy, criteria: [...policy.criteria, { id: crypto.randomUUID(), label: "", instructions: "", required: true, exclusion: false }] })}><Plus size={14} aria-hidden="true" />Add criterion</button></div>
      {!policy.criteria.length && <p className="op-card-empty">Choose an offer above to see suggested criteria, or add your own. Removing criteria can be undone.</p>}
      <div className="op-research-cards">{policy.criteria.map((criterion, index) => {
        const update = (patch: Partial<typeof criterion>) => onChange({ ...policy, criteria: policy.criteria.map(value => value.id === criterion.id ? { ...value, ...patch } : value) });
        return <article key={criterion.id} className="op-research-card">
          <div className="op-card-top"><span className={`op-chip ${criterion.exclusion ? "op-chip-exclusion" : ""}`}>{criterion.exclusion ? "Exclude when supported" : criterion.required ? "Required for fit" : "Supporting evidence"}</span><button type="button" className="op-icon-button" aria-label={`Remove criterion ${index + 1}`} onClick={() => onChange({ ...policy, criteria: policy.criteria.filter(value => value.id !== criterion.id) })}><X size={14} /></button></div>
          <Field label="Criterion"><textarea rows={2} required placeholder="For example: installs ducted air conditioning" value={criterion.label} onChange={event => update({ label: event.target.value })} /></Field>
          <details className="op-card-settings"><summary><SlidersHorizontal size={13} aria-hidden="true" />Evidence and rules</summary>
            <Field label="What should the researcher check?" hint="Use a specific source or example. Do not infer capacity or revenue from appearances."><textarea rows={3} value={criterion.instructions} onChange={event => update({ instructions: event.target.value })} /></Field>
            <label className="op-check"><input type="checkbox" checked={criterion.required} onChange={event => update({ required: event.target.checked })} />Required for a confirmed fit</label>
            <label className="op-check"><input type="checkbox" checked={criterion.exclusion} onChange={event => update({ exclusion: event.target.checked })} />Exclude when evidence supports this criterion</label>
          </details>
        </article>;
      })}</div>
    </section>
    <section aria-labelledby="op-signals-heading">
      <div className="op-section-heading"><div><h3 id="op-signals-heading">What should we collect for the email?</h3><p className="op-muted">Signals select your writing variations and fill their slots. Evidence must support every personalised claim.</p></div><button type="button" onClick={() => onChange({ ...policy, signals: [...policy.signals, { id: crypto.randomUUID(), label: "", collection_instructions: "", acceptable_evidence: "", usefulness_guidance: "", writing_eligible: true, required: false, value_type: "text" }] })}><Plus size={14} aria-hidden="true" />Add signal</button></div>
      {!policy.signals.length && <p className="op-card-empty">Add an offer suggestion above or a custom signal. An empty signal bank cannot personalise a message.</p>}
      <div className="op-research-cards">{policy.signals.map((signal, index) => {
        const update = (patch: Partial<SignalDefinition>) => onChange({ ...policy, signals: policy.signals.map(value => value.id === signal.id ? { ...value, ...patch } : value) });
        return <article key={signal.id} className="op-research-card">
          <div className="op-card-top"><span className="op-chip">{signal.writing_eligible ? "Available in writing" : "Research only"}</span><button type="button" className="op-icon-button" aria-label={`Remove signal ${index + 1}`} onClick={() => onChange({ ...policy, signals: policy.signals.filter(value => value.id !== signal.id) })}><X size={14} /></button></div>
          <Field label="Signal"><input required placeholder="For example: ducted installation service" value={signal.label} onChange={event => update({ label: event.target.value })} /></Field>
          <Field label="Signal category" hint="For example: service, location, founder or recent event. Used in copy results."><input value={signal.category || ""} onChange={event => update({ category: event.target.value || undefined })} placeholder="service" /></Field>
          <Field label="What to collect"><textarea rows={2} value={signal.collection_instructions} onChange={event => update({ collection_instructions: event.target.value })} /></Field>
          <details className="op-card-settings"><summary><SlidersHorizontal size={13} aria-hidden="true" />Evidence and writing settings</summary>
            <Field label="Acceptable evidence"><textarea rows={2} value={signal.acceptable_evidence} onChange={event => update({ acceptable_evidence: event.target.value })} /></Field>
            <Field label="How this helps the email"><textarea rows={2} value={signal.usefulness_guidance} onChange={event => update({ usefulness_guidance: event.target.value })} /></Field>
            <Field label="Stored value"><select value={signal.value_type} onChange={event => update({ value_type: event.target.value as SignalDefinition["value_type"] })}>{["text", "number", "boolean", "date", "list"].map(value => <option key={value}>{value}</option>)}</select></Field>
            <label className="op-check"><input type="checkbox" checked={signal.required} onChange={event => update({ required: event.target.checked })} />Required collection</label>
            <label className="op-check"><input type="checkbox" checked={signal.writing_eligible} onChange={event => update({ writing_eligible: event.target.checked })} />Available for writing</label>
          </details>
        </article>;
      })}</div>
    </section>
  </>;
}
