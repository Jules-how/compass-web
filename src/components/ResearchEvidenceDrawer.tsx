'use client'
import { useCrmResource } from '@/lib/crm-research-client'
import { ModalFrame } from '@/components/ui/ModalFrame'

export function ResearchEvidenceDrawer({observationId,onClose}:{observationId:string;onClose:()=>void}) {
  const observation=useCrmResource<{record:Record<string,unknown>}>(`/records/observation/${encodeURIComponent(observationId)}`)
  const row=observation.data?.record
  const source=useCrmResource<{record:Record<string,unknown>}>(row?.source_id ? `/records/source/${encodeURIComponent(String(row.source_id))}` : null)
  return <ModalFrame open label="Research evidence" onClose={onClose} overlayClassName="crm-detail-overlay" contentClassName="crm-detail-sheet" motion="sheet">
    <div className="crm-research-panel"><header><h2>Research evidence</h2><button type="button" onClick={onClose} aria-label="Close evidence">Close</button></header>
      {observation.error||source.error ? <p role="alert">Evidence could not be loaded. <button onClick={()=>{void observation.reload(true);void source.reload(true)}}>Retry</button></p>:null}
      {row ? <><p>{String(row.fact_key).replaceAll('_',' ')} · {String(row.review_status)}</p><blockquote>{String(row.quote||'No exact quote retained')}</blockquote><dl>
        <dt>Observation ID</dt><dd>{String(row.id)}</dd><dt>Locator</dt><dd>{String(row.locator||'Not recorded')}</dd><dt>Observed</dt><dd>{row.observed_at?new Date(String(row.observed_at)).toLocaleString('en-AU'):'Source date unknown'}</dd>
        <dt>Recorded</dt><dd>{new Date(String(row.created_at)).toLocaleString('en-AU')}</dd><dt>Basis</dt><dd>{String(row.evidence_type)}</dd><dt>Rationale</dt><dd>{String(row.rationale||'Not recorded')}</dd>
        <dt>Source</dt><dd>{source.data?.record.url?<a href={String(source.data.record.url)} target="_blank" rel="noreferrer">{String(source.data.record.url)}</a>:String(source.data?.record.source_type||'Loading source…')}</dd>
        <dt>Retrieved</dt><dd>{source.data?.record.retrieved_at?new Date(String(source.data.record.retrieved_at)).toLocaleString('en-AU'):'Not recorded'}</dd>
        <dt>Cache reference</dt><dd>{String(source.data?.record.artifact_ref||'No retained capture reference')}</dd>
      </dl></>:<p role="status">Loading evidence…</p>}
    </div>
  </ModalFrame>
}
