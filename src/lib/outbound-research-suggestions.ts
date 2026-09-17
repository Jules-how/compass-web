import type { OfferLock } from './offer-sku';
import type { WorkflowPolicy, WorkflowVersion, SignalDefinition } from './outbound-pipeline';
type Criterion = WorkflowPolicy['criteria'][number];
export type ResearchSuggestion = { key: string; source: string; criterion?: Omit<Criterion, 'id'>; signal?: Omit<SignalDefinition, 'id'> };
const normal = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
/** Extract only supplied offer requirements; no invented capacity, reviews, or result claims. */
export function offerResearchSuggestions(lock: OfferLock, source: string): ResearchSuggestion[] {
  const criteria = [
    ...(lock.icp ? [{ label: lock.icp, required: true, exclusion: false }] : []),
    ...lock.screen.map(label => ({ label, required: true, exclusion: false })),
    ...lock.antiIcp.map(label => ({ label, required: false, exclusion: true })),
  ];
  const seen = new Set<string>();
  const result: ResearchSuggestion[] = [];
  for (const criterion of criteria) {
    const key = `criterion:${criterion.exclusion}:${normal(criterion.label)}`;
    if (!criterion.label.trim() || seen.has(key)) continue;
    seen.add(key);
    result.push({ key, source, criterion: { ...criterion, instructions: 'Record direct supporting or contradicting evidence and its source. Missing evidence is unknown.' } });
  }
  for (const fact of lock.relevance) {
    const key = `signal:${normal(fact.fact)}`;
    if (!fact.fact.trim() || seen.has(key)) continue;
    seen.add(key);
    result.push({ key, source, signal: { label: fact.fact, collection_instructions: `Collect the evidence requested by the offer: ${fact.fact}`, acceptable_evidence: fact.source || 'A directly published statement with source URL and quotation.', usefulness_guidance: 'Use only a supported, specific fact relevant to this offer. Do not invent an outcome.', required: fact.required, value_type: 'text', writing_eligible: true } });
  }
  // Screening criteria are also useful research questions when the offer has no separate relevance section.
  if (!result.some(value => value.signal)) for (const criterion of criteria.filter(value => !value.exclusion).slice(0, 6)) {
    if (!criterion.label.trim()) continue;
    result.push({ key: `signal:${normal(criterion.label)}`, source: `${source} · derived from screening`, signal: { label: criterion.label, collection_instructions: `Find direct evidence for: ${criterion.label}. Return a short supported fact, not a guess.`, acceptable_evidence: 'Company website or another attributable primary source; retain the URL and exact quotation.', usefulness_guidance: 'Use the supported fact to select relevant copy. No evidence means no personalisation.', writing_eligible: true, required: false, value_type: 'text' } });
  }
  return result;
}
export function workflowResearchSuggestions(workflows: WorkflowVersion[]): ResearchSuggestion[] {
  const seen = new Set<string>();
  const output: ResearchSuggestion[] = [];
  for (const workflow of workflows) {
    for (const criterion of workflow.policy.criteria) {
      const key = `criterion:${criterion.exclusion}:${normal(criterion.label)}`;
      if (seen.has(key)) continue;
      seen.add(key); output.push({ key, source: workflow.name, criterion });
    }
    for (const signal of workflow.policy.signals) {
      const key = `signal:${normal(signal.label)}`;
      if (seen.has(key)) continue;
      seen.add(key); output.push({ key, source: workflow.name, signal });
    }
  }
  return output;
}
export function suggestionAlreadyAdded(policy: WorkflowPolicy, suggestion: ResearchSuggestion) {
  return suggestion.criterion
    ? policy.criteria.some(value => value.exclusion === suggestion.criterion!.exclusion && normal(value.label) === normal(suggestion.criterion!.label))
    : policy.signals.some(value => normal(value.label) === normal(suggestion.signal!.label));
}
export function addResearchSuggestion(policy: WorkflowPolicy, suggestion: ResearchSuggestion, id: string): WorkflowPolicy {
  if (suggestionAlreadyAdded(policy, suggestion)) return policy;
  return suggestion.criterion ? { ...policy, criteria: [...policy.criteria, { ...suggestion.criterion, id }] }
    : { ...policy, signals: [...policy.signals, { ...suggestion.signal!, id }] };
}
