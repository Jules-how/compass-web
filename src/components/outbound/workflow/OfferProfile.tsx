"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check } from "lucide-react";
import type { OfferRevision } from "@/lib/offer-revisions";
import { parseOfferLock } from "@/lib/offer-sku";
import type { WorkflowPolicy, WorkflowVersion } from "@/lib/outbound-pipeline";
import { addResearchSuggestion, offerResearchSuggestions, suggestionAlreadyAdded, workflowResearchSuggestions } from "@/lib/outbound-research-suggestions";
import { Field } from "./PipelineForms";
import { PipelinePicker } from "./PipelinePicker";
type Offer = { id: string; name: string; active_revision_id: string | null };
export function OfferProfile({ policy, onChange, workflows }: { policy: WorkflowPolicy; onChange: (policy: WorkflowPolicy) => void; workflows: WorkflowVersion[] }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOfferId] = useState("");
  const [revisions, setRevisions] = useState<OfferRevision[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bank, setBank] = useState<"offer" | "library">("offer");
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const current = useRef({ policy, onChange });
  current.current = { policy, onChange };
  const autoSelect = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/outbound/offers", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load offers. Your draft is unchanged.");
      return response.json();
    }).then(body => {
      if (controller.signal.aborted) return;
      const values: Offer[] = body.items || [];
      setOffers(values);
      const found = values.find(offer => offer.active_revision_id === current.current.policy.offer_version_id);
      if (found) setOfferId(found.id);
      setError("");
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!offerId) return;
    const controller = new AbortController();
    setRevisions([]); setLoading(true);
    fetch(`/api/offers/${encodeURIComponent(offerId)}/revisions`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load the offer document. Retry without losing your draft.");
      return response.json();
    }).then(body => {
      if (controller.signal.aborted) return;
      const values: OfferRevision[] = body.revisions || [];
      setRevisions(values); setError("");
      if (autoSelect.current) {
        autoSelect.current = false;
        const revision = values.find(value => value.id === offers.find(offer => offer.id === offerId)?.active_revision_id) || values[0];
        if (revision) chooseRevision(revision);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [offerId, offers, retry]);
  function chooseRevision(revision: OfferRevision) {
    let next = { ...current.current.policy, offer_version_id: revision.id, icp_version_id: current.current.policy.icp_version_id || crypto.randomUUID() };
    // Seed a new profile only. Changing offers never silently destroys an edited profile.
    if (!next.criteria.length && !next.signals.length) {
      for (const suggestion of offerResearchSuggestions(parseOfferLock(revision.snapshot.lock), "Offer document")) next = addResearchSuggestion(next, suggestion, crypto.randomUUID());
    }
    current.current.onChange(next);
  }
  const selectedRevision = revisions.find(value => value.id === policy.offer_version_id);
  const offerName = offers.find(value => value.id === offerId)?.name || "Offer document";
  const suggestions = useMemo(() => bank === "offer"
    ? selectedRevision ? offerResearchSuggestions(parseOfferLock(selectedRevision.snapshot.lock), `${offerName} · v${selectedRevision.version_no}`) : []
    : workflowResearchSuggestions(workflows), [bank, selectedRevision, offerName, workflows]);
  const matching = suggestions.filter(value => `${value.criterion?.label || value.signal?.label} ${value.source}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="op-offer-profile">
    <h3>Offer → saved ICP → research questions</h3>
    <p className="op-muted">The offer is a saved snapshot. Edit the cards below to define this workflow’s ICP and evidence requirements; saving creates a reusable workflow.</p>
    {error && <div className="op-error" role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    <div className="op-grid-two">
      <PipelinePicker label="Offer" value={offerId} options={offers.map(offer => ({ value: offer.id, label: offer.name }))} placeholder={policy.offer_version_id ? "Saved offer snapshot — choose to inspect" : "Choose an offer"} onChange={id => { autoSelect.current = true; setOfferId(id); }} />
      <PipelinePicker label="Offer snapshot" value={policy.offer_version_id} disabled={loading || !offerId} options={revisions.map(version => ({ value: version.id, label: `v${version.version_no}${version.version_label ? ` · ${version.version_label}` : ""}`, description: `${new Date(version.created_at).toLocaleDateString("en-AU")} · ${version.change_reason || "Saved offer document"}` }))} placeholder={loading ? "Loading snapshots…" : policy.offer_version_id ? "Previously saved snapshot" : "Choose an offer first"} onChange={id => { const revision = revisions.find(value => value.id === id); if (revision) chooseRevision(revision); }} />
      <Field label="ICP name" hint="This name appears in your reusable profile picker."><input value={policy.icp_name || ""} placeholder="Established residential AC installers" onChange={event => onChange({ ...policy, icp_name: event.target.value })} /></Field>
      <PipelinePicker label="Copy criteria from a saved ICP" value="" placeholder="Keep the cards below, or choose a profile" options={workflows.map(workflow => ({ value: workflow.id, label: workflow.policy.icp_name || workflow.name, description: `${workflow.policy.criteria.length} criteria · ${workflow.name}` }))} onChange={id => {
        const workflow = workflows.find(value => value.id === id);
        if (workflow && window.confirm("Replace the current criteria with this profile? Undo restores your current cards. Signals and offer stay unchanged.")) onChange({ ...policy, icp_name: workflow.policy.icp_name || workflow.name, icp_version_id: crypto.randomUUID(), criteria: structuredClone(workflow.policy.criteria) });
      }} />
    </div>
    <div className="op-suggestion-bank">
      <div className="op-section-heading"><div className="op-segmented" aria-label="Suggestion source"><button type="button" aria-pressed={bank === "offer"} onClick={() => setBank("offer")}>From this offer</button><button type="button" aria-pressed={bank === "library"} onClick={() => setBank("library")}>Saved research bank</button></div><input aria-label="Search research suggestions" placeholder="Find a criterion or signal…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <p className="op-muted">Suggestions come from the named document or saved workflow, not newly researched facts. Adding one creates an editable card below.</p>
      <div className="op-suggestions">{matching.map(suggestion => {
        const added = suggestionAlreadyAdded(policy, suggestion);
        return <button type="button" key={suggestion.key} disabled={added} onClick={() => onChange(addResearchSuggestion(policy, suggestion, crypto.randomUUID()))}>
          {added ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}<span><strong>{suggestion.criterion?.label || suggestion.signal?.label}</strong><small>{suggestion.criterion ? "ICP criterion" : "Writing signal"} · {suggestion.source}</small></span>
        </button>;
      })}</div>
      {!matching.length && <p className="op-muted">{bank === "offer" ? "Choose the offer and its snapshot to see the document’s screening criteria and suggested signals." : "No matching saved criteria or signals. Save a workflow to build your reusable bank."}</p>}
    </div>
  </section>;
}
