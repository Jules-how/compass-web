"use client";
import { useState } from "react";
import cohort from "./example-cohort.json";
import { WorkflowSelect } from "./WorkflowSelect";
export function BatchInventory({ ids, onChange }: { ids: number[]; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [evidence, setEvidence] = useState("all");
  const [contact, setContact] = useState("all");
  const rows = cohort.filter(r => `${r.name} ${r.domain}`.toLowerCase().includes(query.toLowerCase()) &&
    (city === "all" || city === r.city) &&
    (evidence === "all" || (evidence === "supported" ? !r.researchIssue : !!r.researchIssue)) &&
    (contact === "all" || (contact === "published" ? r.contactPublished : !r.contactPublished)));
  return <fieldset className="wf-inventory">
    <legend>Choose companies</legend>
    <p className="wf-help">Saved inventory · {cohort.length} companies. These historical records are available in this design workspace; current CRM inventory is separate.</p>
    <input aria-label="Search available companies" placeholder="Search company or domain…" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="wf-inventory-filters">
      <WorkflowSelect label="Inventory city" value={city} onChange={setCity} options={[{ value: "all", label: "All cities" }, ...Array.from(new Set(cohort.map(r => r.city))).map(value => ({ value, label: value }))]} />
      <WorkflowSelect label="Inventory evidence" value={evidence} onChange={setEvidence} options={[{value:"all",label:"Any evidence"},{value:"supported",label:"Service / area supported"},{value:"gaps",label:"Needs research"}]} />
      <WorkflowSelect label="Inventory contact" value={contact} onChange={setContact} options={[{value:"all",label:"Any contact"},{value:"published",label:"Published contact"},{value:"unresolved",label:"Source unresolved"}]} />
    </div>
    <div className="wf-inventory-summary"><span aria-live="polite">{rows.length} matching · {ids.length} selected</span><button type="button" disabled={!rows.length} onClick={() => onChange(rows.map(r => r.id))}>Use matching</button><button type="button" disabled={!ids.length} onClick={() => onChange([])}>Clear</button></div>
    <div className="wf-inventory-list">{rows.map(r => <label key={r.id}><input type="checkbox" checked={ids.includes(r.id)} onChange={e => onChange(e.target.checked ? [...ids,r.id] : ids.filter(id => id !== r.id))} /><span><strong>{r.name}</strong><small>{r.domain} · {r.city}</small></span><small>{r.researchIssue ? "Needs research" : "Service / area fit"}</small></label>)}
      {!rows.length && <p>No companies match. Adjust the filters.</p>}
    </div>
    {!ids.length && <p className="wf-help" role="status">Select at least one company to save this batch.</p>}
  </fieldset>;
}
