'use client';
import { useEffect, useState } from 'react';
import type { PipelineStage } from '@/lib/outbound-pipeline';
import { Field, label } from './PipelineForms';
export type CompanyFilters = { q: string; city: string; suburb: string; country: string; administrative_region: string; fit: string; status: string };
export type RecipientFilters = { draft_status: string; verification_status: string };
const EMPTY: CompanyFilters = { q: '', city: '', suburb: '', country: '', administrative_region: '', fit: '', status: '' };
const EMPTY_RECIPIENT: RecipientFilters = { draft_status: '', verification_status: '' };
const fitChoices = ['unknown', 'anti_icp', 'non_fit', 'likely_fit', 'sure_fit'];
export function PipelineFilters({ stage, value, recipientValue, onApply }: {
  stage: PipelineStage; value: CompanyFilters; recipientValue: RecipientFilters;
  onApply: (companies: CompanyFilters, recipients: RecipientFilters) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [recipientDraft, setRecipientDraft] = useState(recipientValue);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { setRecipientDraft(recipientValue); }, [recipientValue]);
  const active = Object.entries(value).filter(([, item]) => Boolean(item));
  const recipientActive = stage === 'write' ? Object.entries(recipientValue).filter(([, item]) => Boolean(item)) : [];
  const extras = [draft.country, draft.administrative_region, draft.suburb, draft.status, ...(stage === 'write' ? Object.values(recipientDraft) : [])].filter(Boolean).length;
  function apply() {
    const clean = Object.fromEntries(Object.entries(draft).map(([key, item]) => [key, item.trim()])) as CompanyFilters;
    onApply(clean, recipientDraft);
  }
  return <div className="op-filter-area">
    <form className="op-filter-form" onSubmit={event => { event.preventDefault(); apply(); event.currentTarget.querySelector("details")?.removeAttribute("open"); }}>
      <div className="op-filter-main">
        <Field label="Search companies"><input value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })} placeholder="Company name or website" /></Field>
        <Field label="City"><input value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })} placeholder="Any city" /></Field>
        <Field label="ICP fit"><select value={draft.fit} onChange={event => setDraft({ ...draft, fit: event.target.value })}><option value="">All fit outcomes</option>{fitChoices.map(item => <option value={item} key={item}>{label(item)}</option>)}</select></Field>
        <button type="submit">Apply filters</button>
      </div>
      <details className="op-extra-filters"><summary>More filters{extras > 0 ? ` (${extras})` : ''}</summary>
        <div className="op-extra-filter-fields">
          <Field label="Country"><input value={draft.country} maxLength={2} placeholder="AU" onChange={event => setDraft({ ...draft, country: event.target.value.toUpperCase() })} /></Field>
          <Field label="State / region"><input value={draft.administrative_region} placeholder="Any region" onChange={event => setDraft({ ...draft, administrative_region: event.target.value })} /></Field>
          <Field label="Suburb"><input value={draft.suburb} placeholder="Any suburb" onChange={event => setDraft({ ...draft, suburb: event.target.value })} /></Field>
          <Field label="Stage outcome"><select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">All outcomes</option>{['ready', 'held', 'completed', 'failed', 'stale'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
          {stage === 'write' && <>
            <Field label="Draft status"><select value={recipientDraft.draft_status} onChange={event => setRecipientDraft({ ...recipientDraft, draft_status: event.target.value })}><option value="">All drafts</option><option value="drafted">Drafted</option><option value="undrafted">Not drafted</option></select></Field>
            <Field label="Email verification"><select value={recipientDraft.verification_status} onChange={event => setRecipientDraft({ ...recipientDraft, verification_status: event.target.value })}><option value="">All results</option>{['valid', 'invalid', 'catch_all', 'unknown', 'risky', 'unverified'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
          </>}
        </div>
      </details>
    </form>
    {active.length + recipientActive.length > 0 && <div className="op-filter-chips" aria-label="Applied filters">
      {active.map(([key, item]) => <button type="button" key={key} aria-label={`Remove ${label(key)} filter`} onClick={() => onApply({ ...value, [key]: '' }, recipientValue)}>{key === 'q' ? 'Search' : key === 'administrative_region' ? 'Region' : label(key)}: {label(item)} <span aria-hidden="true">×</span></button>)}
      {recipientActive.map(([key, item]) => <button type="button" key={key} aria-label={`Remove ${label(key)} filter`} onClick={() => onApply(value, { ...recipientValue, [key]: '' })}>{label(key)}: {label(item)} <span aria-hidden="true">×</span></button>)}
      <button type="button" className="op-text-action" onClick={() => onApply({ ...EMPTY }, { ...EMPTY_RECIPIENT })}>Clear filters</button>
    </div>}
  </div>;
}
