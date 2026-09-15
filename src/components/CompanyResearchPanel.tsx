'use client'
import { useState, type ReactNode } from 'react'
import { crmGet, crmId, crmOperation, useCrmDraft, useCrmMutation, useCrmResource } from '@/lib/crm-research-client'
import { CRM_REGIONS, type CrmCompanyProfile, type CrmOperation } from '@/lib/crm-research-schema'
import { ResearchEvidenceDrawer } from './ResearchEvidenceDrawer'

type Row=Record<string,unknown>&{id:string;revision:number}
type Collection={records:Row[];next_after:string|null;total_matching:number}
function date(value:unknown){return value ? new Date(String(value)).toLocaleDateString('en-AU') : 'Date unknown'}
function valueLabel(value:unknown):string {
  if(value===null||value===undefined)return 'Unknown'
  if(Array.isArray(value))return value.join(', ')
  if(typeof value==='boolean')return value?'Yes':'No'
  if(typeof value==='object')return Object.entries(value).map(([key,item])=>`${key.replaceAll('_',' ')}: ${Array.isArray(item)?item.join(', '):String(item??'unknown')}`).join(' · ')
  return String(value).replaceAll('_',' ')
}
function Field({label,name,draft,set,type='text',required=false}:{label:string;name:string;draft:Record<string,string>;set:(key:string,value:string)=>void;type?:string;required?:boolean}){return <label>{label}<input type={type} value={draft[name]||''} onChange={e=>set(name,e.target.value)} required={required}/></label>}

export function CompanyResearchPanel({companyId,writable}:{companyId:string;writable:boolean}) {
  const company=useCrmResource<{company:CrmCompanyProfile}>(`/companies/${encodeURIComponent(companyId)}`)
  const [section,setSection]=useState<'research'|'people'|'locations'>('research')
  const [evidence,setEvidence]=useState<string|null>(null)
  const profile=company.data?.company
  if(company.error)return <p role="alert">Company research could not be loaded. <button onClick={()=>void company.reload(true)}>Retry</button></p>
  if(!profile)return <p role="status">Loading company research…</p>
  return <div className="crm-research-panel">
    <header><div><h3>{profile.name}</h3><p>{profile.fit_status.replaceAll('_',' ')} · Identity {profile.identity_status}</p></div><span className="crm-research-muted">Oldest current evidence: {date(profile.research_observed_at)}</span></header>
    <nav aria-label="Company research section">{(['research','people','locations'] as const).map(s=><button type="button" key={s} aria-pressed={section===s} onClick={()=>setSection(s)}>{s==='people'?'People & contacts':s==='locations'?'Locations':'Company research'}</button>)}</nav>
    {section==='research'?<>
      <p className="crm-research-muted">Research is shared across linked leads and campaigns. Revenue and spare capacity remain unknown unless sourced.</p>
      <dl className="crm-research-facts">{Object.entries(profile.facts).map(([key,fact])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{fact.state==='disputed'?'Disputed evidence':valueLabel(fact.value)}<small>{date(fact.observed_at)}</small>{fact.evidence_ids.map((id,index)=><button key={id} type="button" className="crm-evidence-link" onClick={()=>setEvidence(id)}>Source {index+1}</button>)}</dd></div>)}</dl>
      {!Object.keys(profile.facts).length?<p>No structured observations yet.</p>:null}
      {writable?<ResearchEntryForm companyId={companyId} mode="observation"/>:null}
      {writable?<CompanyIdentityReview companyId={companyId}/>:null}
      <ObservationHistory companyId={companyId} onEvidence={setEvidence}/>
    </>:null}
    {section==='people'?<PeopleAndContacts companyId={companyId} writable={writable} onEvidence={setEvidence}/>:null}
    {section==='locations'?<><CollectionRows collection="locations" companyId={companyId} render={r=><div><strong>{String(r.label)}</strong><p>{String(r.kind).replaceAll('_',' ')} · {String(r.city||'')} {String(r.state||'')} · {String(r.status)}</p><small>{(r.regions as string[]).join(', ')} · {date(r.observed_at)}</small></div>}/>{writable?<ResearchEntryForm companyId={companyId} mode="location"/>:null}</>:null}
    {evidence?<ResearchEvidenceDrawer observationId={evidence} onClose={()=>setEvidence(null)}/>:null}
  </div>
}
function CollectionRows({collection,companyId,render}:{collection:string;companyId:string;render:(row:Row)=>ReactNode}) {
  const [after,setAfter]=useState('')
  const result=useCrmResource<Collection>(`/collections?collection=${collection}&company_id=${encodeURIComponent(companyId)}&limit=50${after?'&after='+encodeURIComponent(after):''}`)
  return <>{result.error?<p role="alert">Unable to load {collection}. <button onClick={()=>void result.reload(true)}>Retry</button></p>:null}{result.data?.records.map(r=><article className="crm-research-item" key={r.id}>{render(r)}</article>)}{result.data?.records.length===0?<p>No {collection} recorded.</p>:null}<div className="crm-research-paging">{after?<button onClick={()=>setAfter('')}>First page</button>:null}{result.data?.next_after?<button onClick={()=>setAfter(result.data!.next_after!)}>More {collection}</button>:null}</div></>
}
function ObservationHistory({companyId,onEvidence}:{companyId:string;onEvidence:(id:string)=>void}){return <details><summary>All retained observations</summary><CollectionRows collection="observations" companyId={companyId} render={r=><button className="crm-evidence-link" onClick={()=>onEvidence(r.id)}>{String(r.fact_key).replaceAll('_',' ')} · {String(r.review_status)} · {date(r.observed_at)}</button>}/></details>}
function PeopleAndContacts({companyId,writable,onEvidence}:{companyId:string;writable:boolean;onEvidence:(id:string)=>void}) {
  return <><h4>People</h4><CollectionRows collection="people" companyId={companyId} render={r=><div><strong>{String((r.person as Row)?.name||'Name unresolved')}</strong><p>{String(r.role)} · {String(r.state)}</p><small>{String(r.decision_maker_basis||'Decision-maker basis not recorded')}</small></div>}/>
    {writable?<ResearchEntryForm companyId={companyId} mode="person"/>:null}<h4>Contact routes</h4><p className="crm-research-muted">Alternate routes are retained for research. Campaigns continue to use their existing primary contact.</p>
    <CollectionRows collection="candidates" companyId={companyId} render={r=><div><strong>{String(r.value)}</strong>{r.legacy_primary?<span className="crm-research-tag">Existing primary</span>:null}<p>{String(r.person_name||'General / unassigned')}{r.affiliation_id?` (${String(r.affiliation_state)})`:''} · {String(r.first_origin).replaceAll('_',' ')}</p><p>Person attribution: {String(r.attribution_status).replaceAll('_',' ')}<br/>Mailbox: {String(r.mailbox_result||'Not checked').replaceAll('_',' ')} · {date(r.verified_at)}</p>{r.latest_attempt_state&&r.latest_attempt_state!=='completed'?<p role="status">Latest attempt {String(r.latest_attempt_state)}. Prior result retained. {String(r.latest_attempt_reason||'')}</p>:null}<CandidateEvidence candidateId={r.id} onEvidence={onEvidence}/><VerificationHistory methodId={String(r.method_id)}/>{writable&&r.method_type==='email'?<ResearchEntryForm companyId={companyId} mode="verification" method={{id:String(r.method_id),value:String(r.normalized_value)}}/>:null}</div>}/>
    {writable?<ResearchEntryForm companyId={companyId} mode="candidate"/>:null}
  </>
}
function CandidateEvidence({candidateId,onEvidence}:{candidateId:string;onEvidence:(id:string)=>void}) {
  const [open,setOpen]=useState(false)
  const [after,setAfter]=useState('')
  const result=useCrmResource<Collection>(open?`/collections?collection=observations&candidate_id=${encodeURIComponent(candidateId)}&limit=50${after?'&after='+encodeURIComponent(after):''}`:null)
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Contact evidence</summary>{result.error?<p role="alert">Evidence unavailable. <button onClick={()=>void result.reload(true)}>Retry</button></p>:null}{result.data?.records.map(r=><p key={r.id}><button className="crm-evidence-link" onClick={()=>onEvidence(r.id)}>{String(r.fact_key).replaceAll('_',' ')} · {date(r.observed_at)}</button></p>)}{result.data?.next_after?<button onClick={()=>setAfter(result.data!.next_after!)}>More evidence</button>:null}{after?<button onClick={()=>setAfter('')}>First page</button>:null}</details>
}
function VerificationHistory({methodId}:{methodId:string}) {
  const [open,setOpen]=useState(false)
  const [after,setAfter]=useState('')
  const result=useCrmResource<Collection>(open?`/collections?collection=verifications&method_id=${encodeURIComponent(methodId)}&limit=50${after?'&after='+encodeURIComponent(after):''}`:null)
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Mailbox check history</summary>{result.error?<p role="alert">History unavailable. <button onClick={()=>void result.reload(true)}>Retry</button></p>:null}{result.data?.records.map(r=><p key={r.id}>{String(r.provider)} · {String(r.mailbox_result||r.attempt_state)} · {date(r.checked_at)}<br/><small>{String(r.raw_status)} {String(r.reason)}</small></p>)}{result.data?.next_after?<button onClick={()=>setAfter(result.data!.next_after!)}>More checks</button>:null}{after?<button onClick={()=>setAfter('')}>First page</button>:null}</details>
}

type EntryMode='observation'|'person'|'candidate'|'location'|'verification'
function ResearchEntryForm({companyId,mode,method}:{companyId:string;mode:EntryMode;method?:{id:string;value:string}}) {
  const {draft,set,clear}=useCrmDraft(`${companyId}:${mode}:${method?.id||''}`)
  const mutation=useCrmMutation(`${companyId}:${mode}:${method?.id||''}`)
  const [localError,setLocalError]=useState('')
  const [open,setOpen]=useState(false)
  const people=useCrmResource<Collection>(open&&mode==='candidate'?`/collections?collection=people&company_id=${encodeURIComponent(companyId)}&limit=100`:null)
  const fact=draft.fact||'customer_mix'
  const [message,setMessage]=useState('')
  const sourceFields=<>{mode!=='verification'?<><Field label="Source URL" name="url" draft={draft} set={set} type="url" required/><label>Exact source quote<textarea value={draft.quote||''} onChange={e=>set('quote',e.target.value)} required rows={3}/></label></>:null}<Field label="Observed / checked date and time" name="observed" draft={draft} set={set} type="datetime-local" required/></>
  const makeObservation=(sourceId:string,extra:Record<string,unknown>)=>crmOperation('observation',{id:crmId('observation'),source_id:sourceId,quote:draft.quote||'',observed_at:new Date(draft.observed).toISOString(),evidence_type:'published',review_status:'reviewed',...extra})
  async function submit() {
    setLocalError('');setMessage('')
    try {
      const sourceId=crmId('source')
      const ops:CrmOperation[]=mode==='verification'?[]:[crmOperation('source',{id:sourceId,source_type:'official_site',url:draft.url,retrieved_at:new Date(draft.observed).toISOString()})]
      if(mode==='person') {
        const personId=crmId('person')
        ops.push(crmOperation('person',{id:personId,name:draft.name,source_id:sourceId,profile_url:draft.profile||null}),crmOperation('affiliation',{id:crmId('affiliation'),company_id:companyId,person_id:personId,role:draft.role,source_id:sourceId,observed_at:new Date(draft.observed).toISOString(),state:'current',decision_maker_basis:draft.basis||''}),makeObservation(sourceId,{person_id:personId,fact_key:'note',value:draft.quote}))
      }else if(mode==='location') {
        ops.push(crmOperation('location',{id:crmId('location'),company_id:companyId,label:draft.name,kind:draft.kind||'service_area',address:draft.address||null,city:draft.city||null,state:draft.state||null,regions:CRM_REGIONS.filter(region=>draft['region_'+region]==='yes'),source_id:sourceId,observed_at:new Date(draft.observed).toISOString(),status:'active'}))
      }else if(mode==='candidate') {
        const methodType=draft.method_type||'email'
        const found=await crmGet<{method:Row|null}>(`/methods?type=${methodType}&value=${encodeURIComponent(draft.value)}`)
        const methodId=found.method?.id||crmId('method')
        if(!found.method)ops.push(crmOperation('method',{id:methodId,method_type:methodType,value:draft.value,normalized_value:draft.value}))
        const candidateId=crmId('candidate')
        const origin=draft.origin||'published_general'
        ops.push(crmOperation('candidate',{id:candidateId,company_id:companyId,method_id:methodId,affiliation_id:draft.affiliation||null,purpose:origin==='published_personal_work'?'personal_work':'general',first_origin:origin,state:'retained'}),makeObservation(sourceId,{candidate_id:candidateId,fact_key:'contact_origin',value:origin}))
        if(origin==='published_personal_work')ops.push(makeObservation(sourceId,{candidate_id:candidateId,fact_key:'person_attribution',value:'supported'}))
      }else if(mode==='verification') {
        ops.push(crmOperation('verification',{id:crmId('verification'),method_id:method!.id,provider:draft.provider,provider_request_id:draft.request,submitted_address:method!.value,checked_at:new Date(draft.observed).toISOString(),received_at:new Date().toISOString(),attempt_state:'completed',mailbox_result:draft.result||'unknown',raw_status:draft.raw||draft.result||'unknown',reason:draft.reason||''}))
      }else {
        let value:unknown=draft.value
        if(fact.startsWith('installs_'))value=draft.value==='true'
        if(fact==='reviews')value={count:Number(draft.count),rating:draft.rating?Number(draft.rating):null,platform:draft.platform||'Google',profile_id:draft.profile_id,scope:draft.scope}
        if(fact==='business_age')value={year:Number(draft.year),basis:draft.basis||'operating_since',precision:'year'}
        if(['commercial_signals','quote_routes'].includes(fact))value=(draft.value||'').split('\n').map(x=>x.trim()).filter(Boolean)
        ops.push(makeObservation(sourceId,{company_id:companyId,fact_key:fact,value,supersedes_ids:draft.supersedes?draft.supersedes.split(',').map(x=>x.trim()).filter(Boolean):[],...(fact==='established_status'?{evidence_type:'inference',rationale:draft.rationale,basis_ids:(draft.basis_ids||'').split(',').map(x=>x.trim()).filter(Boolean)}:{})}))
      }
      if(await mutation.save(ops)){clear();setMessage('Saved and read back.');setOpen(false)}
    }catch(error){setLocalError(error instanceof Error?error.message:'Unable to save')}
  }
  return <div><details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{mode==='observation'?'Add sourced observation':mode==='person'?'Add person':mode==='location'?'Add location / service area':mode==='candidate'?'Add published contact route':'Record mailbox check result'}</summary>
    <form className="crm-research-form" onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={mutation.busy||Boolean(mutation.pending)}>
      {mode==='person'?<><Field label="Published full name" name="name" draft={draft} set={set} required/><Field label="Published role" name="role" draft={draft} set={set} required/><Field label="Profile URL" name="profile" draft={draft} set={set} type="url"/><Field label="Decision-maker basis (if supported)" name="basis" draft={draft} set={set}/></>:null}
      {mode==='location'?<><Field label="Location label" name="name" draft={draft} set={set} required/><label>Location type<select value={draft.kind||'service_area'} onChange={e=>set('kind',e.target.value)}><option value="service_area">Service area</option><option value="premises">Physical premises</option></select></label><Field label="Published address" name="address" draft={draft} set={set}/><Field label="City / suburb" name="city" draft={draft} set={set}/><label>State<select value={draft.state||''} onChange={e=>set('state',e.target.value)}><option value="">Unknown</option>{['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map(s=><option key={s}>{s}</option>)}</select></label><div>{CRM_REGIONS.map(region=><label className="crm-research-checkbox" key={region}><input type="checkbox" checked={draft['region_'+region]==='yes'} onChange={e=>set('region_'+region,e.target.checked?'yes':'no')}/>{region}</label>)}</div></>:null}
      {mode==='candidate'?<><label>Route type<select value={draft.method_type||'email'} onChange={e=>set('method_type',e.target.value)}>{['email','phone','linkedin','contact_form'].map(s=><option value={s} key={s}>{s.replaceAll('_',' ')}</option>)}</select></label><Field label="Published address or number" name="value" draft={draft} set={set} required/><label>Person<select value={draft.affiliation||''} onChange={e=>set('affiliation',e.target.value)}><option value="">General / unassigned</option>{people.data?.records.map(r=><option key={r.id} value={r.id}>{String((r.person as Row)?.name)} · {String(r.role)}</option>)}</select></label>{people.error?<p role="alert">People could not be loaded. Reopen this form to retry.</p>:null}<label>Published basis<select value={draft.origin||'published_general'} onChange={e=>set('origin',e.target.value)}><option value="published_general">General business route</option><option value="published_personal_work">Named person’s work address</option></select></label><p className="crm-research-muted">A personal address needs a quote containing the person’s full name and exact address. Provider and generated candidates can be imported through the research API with their original evidence.</p></>:null}
      {mode==='verification'?<><p>Record an existing provider result. This does not run a verification check.</p><Field label="Provider" name="provider" draft={draft} set={set} required/><Field label="Provider request ID" name="request" draft={draft} set={set} required/><label>Mailbox result<select value={draft.result||'unknown'} onChange={e=>set('result',e.target.value)}>{['unknown','valid','invalid','catch_all','risky'].map(s=><option value={s} key={s}>{s.replaceAll('_',' ')}</option>)}</select></label><Field label="Raw provider status" name="raw" draft={draft} set={set}/><Field label="Provider reason" name="reason" draft={draft} set={set}/></>:null}
      {mode==='observation'?<><label>Observation<select value={fact} onChange={e=>{set('fact',e.target.value);set('value','')}}>{['customer_mix','operating_status','established_status','installs_air_conditioning','installs_ducted','installs_multi_split','installs_single_split','reviews','business_age','quote_routes','commercial_signals','note'].map(s=><option value={s} key={s}>{s.replaceAll('_',' ')}</option>)}</select></label>
        {fact==='customer_mix'||fact==='operating_status'||fact==='established_status'||fact.startsWith('installs_')?<label>Value<select value={draft.value||''} onChange={e=>set('value',e.target.value)} required><option value="">Select supported value</option>{(fact==='customer_mix'?['residential_only','mixed','commercial_only','unknown']:fact==='operating_status'?['active','closed','unknown']:fact==='established_status'?['supported','contradicted','unresolved']:['true','false']).map(s=><option value={s} key={s}>{s==='true'?'Yes':s==='false'?'No':s.replaceAll('_',' ')}</option>)}</select></label>:fact==='reviews'?<><Field label="Review count" name="count" type="number" draft={draft} set={set} required/><Field label="Rating (0–5)" name="rating" draft={draft} set={set}/><Field label="Platform" name="platform" draft={draft} set={set}/><Field label="Profile URL or ID" name="profile_id" draft={draft} set={set} required/><Field label="Profile scope (company or named branch)" name="scope" draft={draft} set={set} required/></>:fact==='business_age'?<><Field label="Start year" name="year" type="number" draft={draft} set={set} required/><label>Age basis<select value={draft.basis||'operating_since'} onChange={e=>set('basis',e.target.value)}>{['operating_since','registered_since','claimed_tenure'].map(s=><option value={s} key={s}>{s.replaceAll('_',' ')}</option>)}</select></label></>:<label>{['quote_routes','commercial_signals'].includes(fact)?'One supported item per line':'Observation'}<textarea value={draft.value||''} onChange={e=>set('value',e.target.value)} required/></label>}
      </>:null}
      {mode==='observation'?<><Field label="Superseded observation IDs (only when resolving or replacing evidence)" name="supersedes" draft={draft} set={set}/>{fact==='established_status'?<><Field label="Supporting observation IDs, comma separated" name="basis_ids" draft={draft} set={set} required/><Field label="Establishment assessment rationale" name="rationale" draft={draft} set={set} required/></>:null}</>:null}
      {sourceFields}<button type="submit">{mutation.busy?'Saving…':'Save research'}</button><button type="button" onClick={()=>{clear();setOpen(false)}}>Discard draft</button>
    </fieldset></form>
  </details>{mutation.error||localError?<p role="alert">{mutation.error||localError}</p>:null}{mutation.pending?<p role="status">Previous save needs reconciliation. <button disabled={mutation.busy} onClick={()=>void mutation.retry().then(ok=>{if(ok){clear();setOpen(false);setMessage('Saved and read back.')}})}>Retry previous save</button></p>:null}{message?<p role="status">{message}</p>:null}</div>
}

function CompanyIdentityReview({companyId}:{companyId:string}) {
  const {draft,set,clear}=useCrmDraft(companyId+':identity')
  const mutation=useCrmMutation(companyId+':identity')
  const [error,setError]=useState('')
  async function save(){try{
    setError('')
    const {record}=await crmGet<{record:Row}>(`/records/company/${encodeURIComponent(companyId)}`)
    const {revision,created_at:_created,updated_at:_updated,actor:_actor,...company}=record
    const sourceId=crmId('source'),observed=new Date(draft.observed).toISOString()
    if(await mutation.save([
      crmOperation('source',{id:sourceId,source_type:'operator_report',url:draft.url,retrieved_at:observed}),
      crmOperation('observation',{id:crmId('observation'),company_id:companyId,fact_key:'note',value:'Company identity reviewed',source_id:sourceId,quote:draft.quote,observed_at:observed,evidence_type:'operator_report',review_status:'reviewed',rationale:draft.reason}),
      crmOperation('company',{...company,identity_status:draft.status||'reviewed'},revision)
    ]))clear()
  }catch(e){setError(e instanceof Error?e.message:'Review failed')}}
  return <details><summary>Review company identity</summary><p>Check the operating business, branch and legal identity. Shared domains and similar names do not establish a match.</p><form className="crm-research-form" onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={mutation.busy||Boolean(mutation.pending)}>
    <label>Identity state<select value={draft.status||'reviewed'} onChange={e=>set('status',e.target.value)}><option value="reviewed">Reviewed</option><option value="disputed">Disputed</option><option value="unreviewed">Unreviewed</option></select></label>
    <Field label="Supporting source URL" name="url" draft={draft} set={set} type="url" required/><Field label="Exact identity evidence quote" name="quote" draft={draft} set={set} required/><Field label="Reason for identity decision" name="reason" draft={draft} set={set} required/><Field label="Observed date and time" name="observed" draft={draft} set={set} type="datetime-local" required/><button>Save identity review</button>
  </fieldset></form>{error||mutation.error?<p role="alert">{error||mutation.error}</p>:null}{mutation.pending?<button onClick={()=>void mutation.retry().then(ok=>{if(ok)clear()})}>Reconcile previous review</button>:null}</details>
}
