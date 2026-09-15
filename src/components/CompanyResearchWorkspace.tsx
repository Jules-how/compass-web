'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CRM_REGIONS, type CrmCompanyProfile } from '@/lib/crm-research-schema'
import { crmId, crmOperation, useCrmDraft, useCrmMutation, useCrmResource } from '@/lib/crm-research-client'
import { CompanyResearchPanel } from './CompanyResearchPanel'

type Results={companies:CrmCompanyProfile[];total_matching:number;next_cursor:string|null}
export function CompanyResearchWorkspace() {
  const capabilities=useCrmResource<{enabled:boolean;writable:boolean}>('/capabilities')
  const [filters,setFilters]=useState<Record<string,string>>({sort:'name',direction:'asc'})
  const [cursor,setCursor]=useState('')
  const [selected,setSelected]=useState<string|null>(null)
  const params=new URLSearchParams(Object.entries(filters).filter(([,value])=>Boolean(value)))
  if(cursor)params.set('cursor',cursor)
  const results=useCrmResource<Results>(capabilities.data?.enabled?'/companies?'+params.toString():null)
  function filter(key:string,value:string){setFilters(previous=>({...previous,[key]:value}));setCursor('')}
  return <section className="crm-research-workspace">
    <header><div><h1>Company research</h1><p>Reusable company evidence, people and contact routes.</p></div><Link href="/leads">Outreach records</Link></header>
    {capabilities.error?<p role="alert">Research availability could not be checked. <button onClick={()=>void capabilities.reload(true)}>Retry</button></p>:null}
    {capabilities.data&&!capabilities.data.enabled?<p>Company research is not enabled on this deployment.</p>:null}
    {capabilities.data?.enabled?<>
      <form className="crm-research-filters" onSubmit={event=>event.preventDefault()}>
        <label>Company<input value={filters.q||''} onChange={event=>filter('q',event.target.value)}/></label>
        {([
          ['region','Operating region',CRM_REGIONS],
          ['customer_mix','Customers',['residential_only','mixed','commercial_only','unknown']],
          ['system','Systems',['ducted','multi_split','high_ticket']],
          ['fit_status','Target fit',['eligible','research_needed','not_in_target']],
          ['freshness','Evidence freshness',['fresh','stale','unknown']],
          ['origin','Contact origin',['published_general','published_personal_work','provider_enriched','generated_hypothesis','legacy_unknown']],
          ['attribution','Person attribution',['supported','provider_asserted','hypothesized','unresolved','disputed','refuted','not_person_specific']],
          ['mailbox','Mailbox',['valid','invalid','catch_all','unknown','risky']],
          ['sort','Sort all companies',['name','review_count','review_rating','age_years','updated_at','research_observed_at']],
          ['direction','Direction',['asc','desc']]
        ] as const).map(([key,label,values])=><label key={key}>{label}<select value={filters[key]||''} onChange={event=>filter(key,event.target.value)}>{!['sort','direction'].includes(key)?<option value="">All</option>:null}{values.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>)}
        <label>Minimum reviews<input type="number" min="0" value={filters.min_reviews||''} onChange={event=>filter('min_reviews',event.target.value)}/></label>
        <label>Minimum rating<input type="number" min="0" max="5" step="0.1" value={filters.min_rating||''} onChange={event=>filter('min_rating',event.target.value)}/></label>
        <label>Minimum age (years)<input type="number" min="0" value={filters.min_age||''} onChange={event=>filter('min_age',event.target.value)}/></label>
      </form>
      <p className="crm-research-muted">{results.data?.total_matching??'…'} matching companies. Filters and sorting apply across the full dataset. Freshness uses company facts and active locations, with a 90 day window.</p>
      {results.error?<p role="alert">Companies could not be loaded. <button onClick={()=>void results.reload(true)}>Retry</button></p>:null}
      <div className="crm-research-layout"><div>
        <div className="crm-research-company-list">{results.data?.companies.map(company=><button type="button" key={company.id} aria-pressed={selected===company.id} onClick={()=>setSelected(company.id)}><strong>{company.name}</strong><span>{company.fit_status.replaceAll('_',' ')} · {company.people_count} people · {company.candidate_count} routes</span><small>{company.review_count??'Unknown'} reviews · {company.review_rating??'Unknown'} rating · {company.age_years??'Unknown'} years</small></button>)}</div>
        {results.data?.companies.length===0?<p>No companies match these filters.</p>:null}
        <div className="crm-research-paging">{cursor?<button onClick={()=>setCursor('')}>First page</button>:null}{results.data?.next_cursor?<button onClick={()=>setCursor(results.data!.next_cursor!)}>Next page</button>:null}</div>
        {capabilities.data.writable?<CreateCompany onCreated={setSelected}/>:null}
      </div><div>{selected?<CompanyResearchPanel key={selected} companyId={selected} writable={capabilities.data.writable}/>:<p>Select a company to inspect its research.</p>}</div></div>
    </>:null}
  </section>
}
function CreateCompany({onCreated}:{onCreated:(id:string)=>void}) {
  const {draft,set,clear}=useCrmDraft('new-company')
  const mutation=useCrmMutation('new-company')
  async function save(){const id=crmId('company');if(await mutation.save([crmOperation('company',{id,name:draft.name,website:draft.website||null})])){clear();onCreated(id)}}
  return <details><summary>Add company</summary><p className="crm-research-muted">Search existing companies first. A shared website is a matching clue; branches and franchise operators may be separate businesses.</p><form className="crm-research-form" onSubmit={event=>{event.preventDefault();void save()}}><fieldset disabled={mutation.busy||Boolean(mutation.pending)}><label>Trading name<input required value={draft.name||''} onChange={event=>set('name',event.target.value)}/></label><label>Website<input type="url" value={draft.website||''} onChange={event=>set('website',event.target.value)}/></label><button>Create unreviewed company</button></fieldset></form>{mutation.error?<p role="alert">{mutation.error}</p>:null}{mutation.pending?<button onClick={()=>void mutation.retry().then(ok=>{if(ok)clear()})}>Reconcile previous save</button>:null}</details>
}
