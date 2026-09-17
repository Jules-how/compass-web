'use client';
import { useEffect, useRef } from 'react';
import type { PipelineCompany, PipelineStage, Recipient } from '@/lib/outbound-pipeline';
import { Status } from './PipelineForms';
import { companyStagePresentation, formatCompanyLocation } from './pipeline-view-model';

export type PipelineRecipientRow = Recipient & { stage_status?: string; draft_status?: string };
export function PipelineTable({ stage, rows, selected, allMatching, loading, error, listId, onToggle, onTogglePage, onCompany, onRecipient }: {
  stage: PipelineStage;
  rows: Array<PipelineCompany | PipelineRecipientRow>;
  selected: Set<string>;
  allMatching: boolean;
  loading: boolean;
  error: string;
  listId: string;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onCompany: (company: PipelineCompany) => void;
  onRecipient: (recipient: PipelineRecipientRow) => void;
}) {
  const check = useRef<HTMLInputElement>(null);
  const checkedOnPage = rows.filter(row => selected.has(row.id)).length;
  const pageChecked = rows.length > 0 && (allMatching || checkedOnPage === rows.length);
  useEffect(() => {
    if (check.current) check.current.indeterminate = !allMatching && checkedOnPage > 0 && checkedOnPage < rows.length;
  }, [allMatching, checkedOnPage, rows.length]);
  const locked = loading || Boolean(error);
  const writing = stage === 'write';
  const cols = writing ? 6 : listId ? 7 : 6;
  return <div className="op-table-scroll op-work-table" aria-busy={loading}>
    <table className="op-table" aria-label={`${stage === 'list' ? 'Company' : stage} records`}>
      <thead><tr>
        <th scope="col"><input ref={check} type="checkbox" aria-label="Select this page" checked={pageChecked} disabled={locked || !rows.length} onChange={onTogglePage} /></th>
        {writing ? <><th scope="col">Recipient</th><th scope="col">Company</th><th scope="col">Email check</th><th scope="col">Eligibility</th><th scope="col">Draft / reason</th></> : <>
          <th scope="col">Company</th><th scope="col">Location</th><th scope="col">ICP fit</th>
          <th scope="col">{stage === 'contacts' ? 'Contact sourcing' : stage === 'verify' ? 'Verification' : 'Research'}</th>
          <th scope="col">{stage === 'contacts' ? 'Contacts & next step' : stage === 'verify' ? 'Email checks & next step' : 'Reason / next step'}</th>
          {listId && <th scope="col">List</th>}
        </>}
      </tr></thead>
      <tbody>
        {rows.map(value => {
          const checked = allMatching || selected.has(value.id);
          if (writing) {
            const row = value as PipelineRecipientRow;
            return <tr key={row.id} data-selected={checked || undefined}>
              <td><input type="checkbox" aria-label={`Select ${row.mailbox}`} checked={checked} disabled={locked} onChange={() => onToggle(row.id)} /></td>
              <td><button className="op-record-link" disabled={locked} onClick={() => onRecipient(row)}>{row.name || row.mailbox}</button>{row.name && <small>{row.mailbox}</small>}{row.role && <small>{row.role}</small>}</td>
              <td>{row.company_name || 'Linked company'}</td>
              <td><Status value={row.mailbox_result || 'unverified'} />{row.checked_at && <small>Checked {new Date(row.checked_at).toLocaleDateString('en-AU')}</small>}</td>
              <td><Status value={row.suppressed ? 'suppressed' : row.suitable ? 'suitable' : 'held'} /></td>
              <td className="op-reason"><span>{row.draft_status || (row.current_draft_id ? 'Draft recorded' : 'Not drafted')}</span>{row.reason && <small>{row.reason}</small>}<button className="op-text-action" disabled={locked} onClick={() => onRecipient(row)}>Open email <span aria-hidden="true">→</span></button></td>
            </tr>;
          }
          const row = value as PipelineCompany;
          const outcome = companyStagePresentation(row, stage);
          return <tr key={row.id} data-selected={checked || undefined}>
            <td><input type="checkbox" aria-label={`Select ${row.name}`} checked={checked} disabled={locked} onChange={() => onToggle(row.id)} /></td>
            <td><button className="op-record-link" onClick={() => onCompany(row)} disabled={locked}>{row.name}</button>{row.website && <small>{row.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</small>}</td>
            <td className="op-location">{formatCompanyLocation(row)}</td>
            <td><Status value={row.fit} /></td>
            <td><Status value={outcome.status} /></td>
            <td className="op-reason"><span>{outcome.reason}</span><button className="op-text-action" disabled={locked} onClick={() => onCompany(row)}>{stage === 'contacts' ? 'View names, emails & phones' : stage === 'verify' ? 'View email results' : 'View evidence'} <span aria-hidden="true">→</span></button></td>
            {listId && <td><span className="op-membership-label">{row.membership_id ? 'In this list' : 'Not in list'}</span></td>}
          </tr>;
        })}
        {!rows.length && loading && Array.from({ length: 7 }, (_, index) => <tr key={`loading-${index}`} aria-hidden="true" className="op-skeleton-row">{Array.from({ length: cols }, (_, column) => <td key={column}><span className="op-skeleton" /></td>)}</tr>)}
        {!rows.length && !loading && <tr><td colSpan={cols}><div className="op-empty-state"><strong>{error ? 'This view could not be loaded' : 'No matching records'}</strong><p>{error ? 'Refresh to try again. A failed request does not mean the list is empty.' : 'Change your filters or add companies to this list. Earlier-stage and excluded records have not been deleted.'}</p></div></td></tr>}
      </tbody>
    </table>
    {loading && <span role="status" className="op-table-progress">{rows.length ? 'Refreshing this view…' : 'Loading records…'}</span>}
    {error && rows.length > 0 && <p className="op-notice">Showing the last loaded records. Refresh successfully before selecting or processing them.</p>}
  </div>;
}
