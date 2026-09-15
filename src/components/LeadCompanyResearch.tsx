'use client'
import { useState } from 'react'
import type { LeadContact } from '@/lib/types'
import type { CrmCompanyProfile } from '@/lib/crm-research-schema'
import { crmId, crmOperation, useCrmDraft, useCrmMutation, useCrmResource } from '@/lib/crm-research-client'
import { CompanyResearchPanel } from './CompanyResearchPanel'

type LinkRow={id:string;company_id:string;match_state:string;reason:string;company:{name:string}}
export function LeadCompanyResearch({lead}:{lead:LeadContact}) {
  const capability=useCrmResource<{enabled:boolean;writable:boolean}>('/capabilities')
  const links=useCrmResource<{links:LinkRow[]}>(capability.data?.enabled?`/leads/${encodeURIComponent(lead.id)}`:null)
  const [search,setSearch]=useState('')
  const [open,setOpen]=useState(false)
  const companies=useCrmResource<{companies:CrmCompanyProfile[]}>(open?`/companies?q=${encodeURIComponent(search||lead.company||'')}&limit=20`:null)
  const {draft,set,clear}=useCrmDraft('lead-link:'+lead.id)
  const mutation=useCrmMutation('lead-link:'+lead.id)
  const confirmed=links.data?.links.find(link=>link.match_state==='confirmed')
  if(!capability.data?.enabled)return null
  async function save(){const sourceId=crmId('source');if(await mutation.save([
    crmOperation('source',{id:sourceId,source_type:'operator_report',url:draft.url,note:draft.reason,retrieved_at:new Date().toISOString()}),
    crmOperation('lead_link',{id:crmId('link'),lead_id:lead.id,company_id:draft.company,match_state:'confirmed',reason:draft.reason,source_id:sourceId,expected_lead_updated_at:lead.updated_at||null})
  ])){clear();setOpen(false)}}
  return <section className="crm-research-linked"><h3>Shared company research</h3>
    {links.error?<p role="alert">Company links could not be loaded. <button onClick={()=>void links.reload(true)}>Retry</button></p>:null}
    {confirmed?<CompanyResearchPanel key={confirmed.company_id} companyId={confirmed.company_id} writable={capability.data.writable}/>:<p>This outreach record has no confirmed company link.</p>}
    {links.data?.links.filter(link=>link.match_state!=='confirmed').map(link=><p key={link.id}>{link.company?.name} · {link.match_state} · {link.reason}</p>)}
    {!confirmed&&capability.data.writable?<details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>Link existing company</summary><p>Confirm the operating business using source evidence. A matching name or shared domain alone is insufficient.</p><label>Search companies<input value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <form className="crm-research-form" onSubmit={event=>{event.preventDefault();void save()}}><fieldset disabled={mutation.busy||Boolean(mutation.pending)}><label>Company<select required value={draft.company||''} onChange={event=>set('company',event.target.value)}><option value="">Select reviewed match</option>{companies.data?.companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Supporting source URL<input required type="url" value={draft.url||''} onChange={event=>set('url',event.target.value)}/></label><label>Identity match basis<textarea required value={draft.reason||''} onChange={event=>set('reason',event.target.value)}/></label><button>Confirm company link</button></fieldset></form>
      {companies.error?<p role="alert">Company search unavailable.</p>:null}{mutation.error?<p role="alert">{mutation.error}</p>:null}{mutation.pending?<button onClick={()=>void mutation.retry().then(ok=>{if(ok){clear();setOpen(false)}})}>Reconcile previous save</button>:null}
    </details>:null}
  </section>
}
