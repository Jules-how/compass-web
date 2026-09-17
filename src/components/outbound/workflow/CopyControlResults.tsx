'use client';
import { useState } from 'react';
import type { CopyMetricRow } from '@/lib/copy-control';
import { usePipelineRead, PIPELINE_API } from './pipeline-client';
export function CopyControlResults({ writable }: { writable: boolean }) {
  const [open, setOpen] = useState(false), [group, setGroup] = useState('signals'), [campaign, setCampaign] = useState(''), [scope, setScope] = useState(''), [revision, setRevision] = useState(0), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const state = usePipelineRead<{ rows: CopyMetricRow[]; event_count: number; excluded_human_edits: number; complete: boolean }>(open ? `/copy-control?view=metrics&group=${group}${scope ? `&campaign_id=${encodeURIComponent(scope)}` : ''}` : null, revision);
  async function importFile(file?: File) {
    if (!file) return; setBusy(true); setMessage('');
    try {
      if (file.size > 200000) throw new Error('Use a JSON file under 200 KB with up to 100 events.');
      const events = JSON.parse(await file.text());
      if (!Array.isArray(events)) throw new Error('The file must contain a JSON array of outcome events.');
      const response = await fetch(PIPELINE_API + '/copy-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import_outcomes', events }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Import failed.');
      const rejected = body.receipts.filter((r: { status: string }) => r.status === 'rejected');
      setMessage(`${body.receipts.length - rejected.length} events accepted (including existing receipts). ${rejected.length} rejected.${rejected.length ? ' ' + rejected.map((r: { source_event_id: string; reason: string }) => `${r.source_event_id}: ${r.reason}`).join('; ') : ''}`); setRevision(v => v + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed.'); } finally { setBusy(false); }
  }
  return <details className="cc-results" onToggle={e => setOpen(e.currentTarget.open)}><summary>Results <span>Signal combinations first</span></summary>
    <p>These are explicitly imported, attributed initial-email events—not sends inferred from exports. Comparisons are descriptive; differences between audiences are not controlled experiments. Human-edited copy is excluded from signal comparisons.</p>
    <div className="op-inline"><select aria-label="Results grouping" value={group} onChange={e => setGroup(e.target.value)}><option value="signals">Signal combinations</option><option value="variant">Copy variants</option><option value="mode">Template vs AI</option><option value="experiment">Eligible A/B assignments</option></select><input aria-label="Campaign ID filter" value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="All campaigns, or enter campaign ID" /><button type="button" onClick={() => { setScope(campaign.trim()); setRevision(v => v + 1); }}>Refresh results</button></div>
    {state.loading && <p role="status">Loading attributed outcomes…</p>}{state.error && <p role="alert">{state.error}</p>}
    {state.data && !state.data.rows.length && <p className="cc-empty">No attributable outcomes in this view. Export the draft ID with your copy, then import real message events through this screen or the agent API. No winner is inferred from an empty sample.</p>}
    {Boolean(state.data?.rows.length) && <div className="cc-table-wrap"><table><thead><tr><th>{group === 'signals' ? 'Signals' : 'Group'}</th><th>Sent</th><th>Delivered</th><th>Bounced</th><th>Replies</th><th>Positive</th><th>Bookings</th><th>Reply rate</th></tr></thead><tbody>{state.data!.rows.map(row => <tr key={row.key}><td>{group === 'signals' ? row.signals.join(' + ') || 'No research signals' : row.key}</td><td>{row.sent}</td><td>{row.delivered}</td><td>{row.bounced}</td><td>{row.replies}</td><td>{row.positive_replies}</td><td>{row.bookings}</td><td>{row.response_rate === null ? 'Unknown' : `${(row.response_rate * 100).toFixed(1)}%`}{row.unmatched > 0 && <small> Missing delivery events</small>}</td></tr>)}</tbody></table></div>}
    <details><summary>Import outcome events</summary><p>Import a JSON array of up to 100 records: provider, source_event_id, campaign_id, message_id, draft_id, type, occurred_at, automatic. Type is sent, delivered, bounced, reply, positive_reply or booking. Use initial messages only. Retries with unchanged event IDs are deduplicated.</p><input type="file" aria-label="Outcome event JSON file" accept=".json,application/json" disabled={busy || !writable} onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></details>{message && <p role="status">{message}</p>}
  </details>;
}
