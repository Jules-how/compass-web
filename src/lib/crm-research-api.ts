import type { SupabaseClient } from '@supabase/supabase-js'
import { portalJson, readBoundedJson } from './portal-http'
import { CRM_BODY_LIMIT, CRM_METHOD_TYPES, CrmValidationError, normalizeCrmMethod } from './crm-research-schema'
import { parseCrmCompanyQuery } from './crm-research-query'
import { applyCrmResearch, CRM_TABLES, crmDatabaseError, getCrmCompany, getCrmLeadLinks, readCrmCollection, readCrmReceipt, requireCrmResearch, searchCrmCompanies } from './crm-research-server'

export type CrmReadAction = 'companies'|'company'|'collection'|'lead'|'receipt'|'method'|'record'|'capabilities'
export async function handleCrmRead(db: SupabaseClient, action: CrmReadAction, request: Request, id = '', kind = '') {
  const params = new URL(request.url).searchParams
  if (action==='capabilities') {
    if (process.env.COMPASS_CRM_RESEARCH!=='1') return portalJson({enabled:false,writable:false})
    const result=await db.rpc('crm_research_capabilities')
    crmDatabaseError(result.error)
    return portalJson({enabled:true,writable:process.env.COMPASS_CRM_RESEARCH_WRITES==='1',...result.data})
  }
  requireCrmResearch()
  if (action==='companies') return portalJson(await searchCrmCompanies(db,parseCrmCompanyQuery(params)))
  if (action==='company') return portalJson({company:await getCrmCompany(db,id)})
  if (action==='collection') return portalJson(await readCrmCollection(db,params))
  if (action==='lead') return portalJson(await getCrmLeadLinks(db,id))
  if (action==='receipt') return portalJson(await readCrmReceipt(db,id))
  if (action==='method') {
    if ([...params.keys()].some(k=>!['type','value'].includes(k))) throw new CrmValidationError([{path:'query',message:'Unknown method parameter'}])
    const type=params.get('type') || ''
    if (!(CRM_METHOD_TYPES as readonly string[]).includes(type) || !params.get('value')) throw new CrmValidationError([{path:'type',message:'Method type and value required'}])
    let normalized: string
    try { normalized=normalizeCrmMethod(type,params.get('value')!) } catch { throw new CrmValidationError([{path:'value',message:'Invalid route'}]) }
    const result=await db.from('crm_contact_methods').select('*').eq('method_type',type).eq('normalized_value',normalized).maybeSingle()
    crmDatabaseError(result.error)
    return portalJson({method:result.data})
  }
  const table=CRM_TABLES[kind as keyof typeof CRM_TABLES]
  if (!table) throw new CrmValidationError([{path:'kind',message:'Unknown record kind'}])
  const result=await db.from(table).select('*').eq('id',id).maybeSingle()
  crmDatabaseError(result.error)
  if (!result.data) throw new Error('crm_not_found')
  return portalJson({record:result.data})
}
export async function handleCrmWrite(db: SupabaseClient, request: Request, actor: string) {
  return portalJson(await applyCrmResearch(db,await readBoundedJson(request,CRM_BODY_LIMIT),actor))
}
