"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { SignalDefinition, SignalVariation, TemplatePolicy } from "@/lib/outbound-pipeline";
import { Field } from "./PipelineForms";
const parts = ["subject", "opener", "body", "cta", "unsubscribe"] as const;
const labels = { subject: "Subject", opener: "Opener", body: "Body", cta: "Call to action", unsubscribe: "Unsubscribe" };
export function SignalVariations({ policy, signals, onChange }: { policy: TemplatePolicy; signals: SignalDefinition[]; onChange: (patch: Partial<TemplatePolicy>) => void }) {
  const [selected, setSelected] = useState("default");
  const variations = policy.variations || [];
  const current = variations.find(value => value.id === selected);
  const available = signals.filter(value => value.writing_eligible);
  const edit = (patch: Partial<SignalVariation>) => { if (current) onChange({ variations: variations.map(value => value.id === current.id ? { ...value, ...patch } : value) }); };
  const add = () => {
    const id = crypto.randomUUID();
    const copy = Object.fromEntries(parts.map(part => [part, policy[part]])) as SignalVariation["copy"];
    onChange({ variations: [...variations, { id, name: `Variation ${variations.length + 1}`, enabled: true, match: "all", when: [{ signal_id: available[0]?.id || "", operator: "present", value: "" }], copy }] });
    setSelected(id);
  };
  return <section className="op-variation-workspace" aria-labelledby="op-variations-heading">
    <div className="op-section-heading"><div><h3 id="op-variations-heading">Message variations</h3><p className="op-muted">The first enabled matching variation wins. No supported match uses the default message. Follow-ups and slots are shared.</p></div><button type="button" disabled={policy.mode !== "deterministic" || !available.length || variations.length >= 20} onClick={add}><Plus size={14} aria-hidden="true" />Add variation</button></div>
    {policy.mode === "ai" && <p className="op-muted">AI writing uses recorded evidence through an executor. Switch to signal-based writing to use these deterministic variations.</p>}
    {!available.length && <p className="op-notice">Create or select a research workflow with writing signals to add signal-based variations.</p>}
    <div className="op-variation-tabs" role="group" aria-label="Edit a message variation">
      <button type="button" aria-pressed={!current} onClick={() => setSelected("default")}><strong>Default message</strong><small>Fallback when no variation matches</small></button>
      {variations.map((variation, index) => <button type="button" key={variation.id} aria-pressed={current?.id === variation.id} onClick={() => setSelected(variation.id)}><strong>{index + 1}. {variation.name || "Untitled variation"}</strong><small>{variation.enabled ? `${variation.when.length} signal condition${variation.when.length === 1 ? "" : "s"}` : "Disabled"}</small></button>)}
    </div>
    {current && <div className="op-variation-rules">
      <div className="op-section-heading"><Field label="Variation name"><input required value={current.name} onChange={event => edit({ name: event.target.value })} /></Field><div className="op-inline">
        <button type="button" className="op-icon-button" aria-label="Move variation earlier" disabled={variations.indexOf(current) === 0} onClick={() => { const next = [...variations]; const index = next.indexOf(current); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange({ variations: next }); }}><ArrowUp size={15} /></button>
        <button type="button" className="op-icon-button" aria-label="Move variation later" disabled={variations.indexOf(current) === variations.length - 1} onClick={() => { const next = [...variations]; const index = next.indexOf(current); [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange({ variations: next }); }}><ArrowDown size={15} /></button>
        <button type="button" onClick={() => { onChange({ variations: variations.filter(value => value.id !== current.id) }); setSelected("default"); }}>Remove variation</button>
      </div></div>
      <div className="op-inline"><label className="op-check"><input type="checkbox" checked={current.enabled} onChange={event => edit({ enabled: event.target.checked })} />Enabled</label><label>Use when <select aria-label="Variation match rule" value={current.match} onChange={event => edit({ match: event.target.value as "all" | "any" })}><option value="all">all conditions match</option><option value="any">any condition matches</option></select></label></div>
      {current.when.map((rule, index) => {
        const update = (patch: Partial<typeof rule>) => edit({ when: current.when.map((value, i) => i === index ? { ...value, ...patch } : value) });
        return <div className="op-condition-row" key={index}>
          <Field label={`Signal ${index + 1}`}><select required value={rule.signal_id} onChange={event => update({ signal_id: event.target.value })}><option value="">Choose a writing signal</option>{rule.signal_id && !available.some(value => value.id === rule.signal_id) && <option value={rule.signal_id}>Unavailable in this workflow — replace signal</option>}{available.map(signal => <option key={signal.id} value={signal.id}>{signal.label}</option>)}</select></Field>
          <Field label="Condition"><select value={rule.operator} onChange={event => update({ operator: event.target.value as typeof rule.operator })}><option value="present">Has supported evidence</option><option value="equals">Value equals</option><option value="contains">Value contains</option></select></Field>
          {rule.operator !== "present" && <Field label="Expected value"><input required value={rule.value} onChange={event => update({ value: event.target.value })} placeholder="For example: true or ducted" /></Field>}
          <button type="button" className="op-icon-button" aria-label={`Remove condition ${index + 1}`} disabled={current.when.length <= 1} onClick={() => edit({ when: current.when.filter((_, i) => i !== index) })}><X size={15} /></button>
        </div>;
      })}
      <div className="op-inline"><button type="button" disabled={current.when.length >= 20} onClick={() => edit({ when: [...current.when, { signal_id: available[0]?.id || "", operator: "present", value: "" }] })}>Add condition</button><small>A false value is still evidence. Use “Value equals true” for a positive boolean signal.</small></div>
      {current.when.some(rule => !available.some(value => value.id === rule.signal_id)) && <p className="op-error">Choose signals available in this workflow before this variation can be used.</p>}
    </div>}
    <div className="op-email-document">
      <div className="op-section-heading"><span className="op-chip">Editing: {current?.name || "Default message"}</span>{current && <button type="button" onClick={() => {
        const signalId = current.when[0]?.signal_id;
        if (!signalId || !available.some(value => value.id === signalId)) return;
        const key = `signal_${signalId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        onChange({ slots: { ...policy.slots, [key]: { signal_ids: [signalId], required: true, fallback: "" } }, variations: variations.map(value => value.id === current.id ? { ...value, copy: { ...value.copy, opener: `${value.copy.opener}${value.copy.opener ? " " : ""}[[${key}]]` } } : value) });
      }}>Insert first signal into opener</button>}</div>
      {parts.map(part => <Field key={part} label={labels[part]}><textarea rows={part === "body" ? 7 : part === "opener" ? 3 : 2} required={part === "unsubscribe"} value={current ? current.copy[part] : policy[part]} onChange={event => current ? edit({ copy: { ...current.copy, [part]: event.target.value } }) : onChange({ [part]: event.target.value })} /></Field>)}
    </div>
  </section>;
}
