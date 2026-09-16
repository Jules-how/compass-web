"use client";
import { useState } from "react";
import { sourcingCatalog } from "@/lib/outbound-sourcing";
import { WorkflowSelect } from "./WorkflowSelect";
export function SourcingMethods() {
  const [id,setId] = useState("ledger");
  const [copied,setCopied] = useState("");
  const method = sourcingCatalog.methods.find(m => m.id === id)!;
  const prompt = `Read Compass MCP outbound.sourcing (or authenticated GET /api/agent/outbound/sourcing). Review the recommended method and available tools. Prepare a sourcing plan using ${method.name}. Ask for missing company criteria, geography, result limit and total spend cap. ${method.agent} Do not start a paid run until its scope and budget are authorised. Qualify companies before enrichment, preserve source evidence and reconcile records through the Compass agent API. Report found, qualified and imported separately.`;
  return <div className="wf-sourcing">
    <p>{sourcingCatalog.recommendation}</p>
    <label className="wf-field">Sourcing method<WorkflowSelect label="Sourcing method" value={id} onChange={v => {setId(v);setCopied("");}} options={sourcingCatalog.methods.map(m => ({value:m.id,label:m.name}))} /></label>
    <span className="wf-pill">{method.status}</span>
    <dl className="wf-facts">{[["When to use",method.when],["Why",method.why],["Cost",method.cost],["Performance / limits",method.performance],["Features",method.features.join(" · ")]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <a href={method.url} target="_blank" rel="noreferrer">{method.id === "vortex" || method.id === "outscraper" ? "Provider and current pricing ↗" : "Open Compass workspace ↗"}</a>
    <details className="wf-handoff"><summary>Agent handoff</summary><p>Available to any agent connected to Compass: <code>outbound.sourcing</code></p><textarea aria-label="Sourcing agent prompt" readOnly value={prompt} rows={7} /><button type="button" className="compass-btn-secondary" onClick={async () => {try {await navigator.clipboard.writeText(prompt);setCopied("Prompt copied");}catch {setCopied("Select and copy the prompt above.");}}}>Copy agent prompt</button><span role="status">{copied}</span></details>
    <p className="wf-help">This handoff prepares a plan. It does not start a scraper or spend credits. Provider rates checked via linked documentation on {sourcingCatalog.checkedAt}; account access is checked by the executing agent.</p>
  </div>;
}
