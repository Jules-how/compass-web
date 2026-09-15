import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CRM_RESEARCH_VERSION, CrmValidationError, parseCrmCommand, type CrmStoredRecord } from './crm-research-schema'
import { crmQueryFilters, cursorClause, decodeResearchCursor, encodeResearchCursor, queryFingerprint, type CrmCompanyQuery } from './crm-research-query'

export function requireCrmResearch(write = false) {
  if (process.env.COMPASS_CRM_RESEARCH !== '1') throw new Error('crm_research_disabled')
  if (write && process.env.COMPASS_CRM_RESEARCH_WRITES !== '1') throw new Error('crm_research_read_only')
}
export const CRM_TABLES = { company: 'crm_companies', source: 'crm_research_sources', location: 'crm_company_locations', person: 'crm_people', affiliation: 'crm_company_people', method: 'crm_contact_methods', candidate: 'crm_contact_candidates', observation: 'crm_research_observations', verification: 'crm_verification_events', lead_link: 'crm_lead_links', legacy_company_link: 'crm_legacy_company_links' } as const
export function crmDatabaseError(error: { message: string; code?: string } | null): void {
  if (!error) return
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '')) throw new Error('crm_schema_unavailable')
  throw new Error(error.message)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}'
  return JSON.stringify(value)
}
export async function applyCrmResearch(db: SupabaseClient, input: unknown, actor: string) {
  requireCrmResearch(true)
  const command = parseCrmCommand(input)
  const hash = createHash('sha256').update(canonical(command)).digest('hex')
  const result = await db.rpc('crm_research_apply', { p_command: command, p_hash: hash, p_actor: actor })
  crmDatabaseError(result.error)
  return result.data
}
export async function readCrmReceipt(db: SupabaseClient, id: string) {
  requireCrmResearch()
  const result = await db.from('crm_research_receipts').select('receipt').eq('request_id',id).maybeSingle()
  crmDatabaseError(result.error)
  if (!result.data) throw new Error('crm_not_found')
  return result.data.receipt
}
export async function searchCrmCompanies(db: SupabaseClient, query: CrmCompanyQuery) {
  requireCrmResearch()
  const filters = crmQueryFilters(query)
  const scope = queryFingerprint(filters)
  const cursor = query.cursor ? decodeResearchCursor(query.cursor, { sort: query.sort, direction: query.direction, scope }) : null
  const total = await db.rpc('crm_search_companies', { p_filters: filters }).select('id',{ count: 'exact', head: true })
  crmDatabaseError(total.error)
  let request = db.rpc('crm_search_companies', { p_filters: filters }).select('*')
  if (cursor) request = request.or(cursorClause(cursor))
  const result = await request.order(query.sort,{ ascending: query.direction==='asc', nullsFirst:false }).order('id',{ascending:query.direction==='asc'}).limit(query.limit+1)
  crmDatabaseError(result.error)
  const rows = (result.data ?? []) as CrmStoredRecord[]
  const companies = rows.slice(0,query.limit)
  const last = companies.at(-1)
  return { schema_version: CRM_RESEARCH_VERSION, grain:'companies', total_matching:total.count ?? 0, returned:companies.length, companies, filters, sort:query.sort, direction:query.direction, next_cursor: rows.length>query.limit && last ? encodeResearchCursor({v:1,sort:query.sort,direction:query.direction,scope,value:(last[query.sort] ?? null) as string|number|null,id:last.id}) : null }
}
export async function getCrmCompany(db: SupabaseClient, id: string) {
  requireCrmResearch()
  const result = await db.from('crm_company_profiles').select('*').eq('id',id).maybeSingle()
  crmDatabaseError(result.error)
  if (!result.data) throw new Error('crm_not_found')
  return result.data
}
export async function getCrmLeadLinks(db: SupabaseClient, leadId: string) {
  requireCrmResearch()
  const result = await db.from('crm_lead_links').select('*,company:crm_companies(id,name,identity_status)').eq('lead_id',leadId).order('id').limit(100)
  crmDatabaseError(result.error)
  const lead=await db.from('lead_contacts').select('id,company,email,phone,name,role,website,city,state,lead_facts,email_verify_status,email_verified_at,updated_at').eq('id',leadId).maybeSingle()
  crmDatabaseError(lead.error)
  if (!lead.data) throw new Error('crm_not_found')
  return { links: result.data ?? [], lead:lead.data }
}
export async function readCrmCollection(db: SupabaseClient, params: URLSearchParams) {
  requireCrmResearch()
  const allowed = new Set(['collection','company_id','candidate_id','method_id','source_id','after','limit'])
  for (const key of params.keys()) if (!allowed.has(key)) throw new CrmValidationError([{path:key,message:'Unknown parameter'}])
  const collection = params.get('collection') || 'candidates'
  const table = { candidates:'crm_candidate_profiles', people:'crm_company_people', locations:'crm_company_locations', observations:'crm_research_observations', verifications:'crm_verification_events', sources:'crm_research_sources' }[collection]
  if (!table) throw new CrmValidationError([{path:'collection',message:'Unknown collection'}])
  const scope = collection==='verifications' ? 'method_id' : collection==='sources' ? 'source_id' : params.has('candidate_id') && collection==='observations' ? 'candidate_id' : 'company_id'
  for (const key of ['company_id','candidate_id','method_id','source_id']) if (params.has(key) && key !== scope) throw new CrmValidationError([{path:key,message:'Unsupported scope for this collection'}])
  const scopeId = params.get(scope)
  if (!scopeId) throw new CrmValidationError([{path:scope,message:'Required scope'}])
  const limit = Number(params.get('limit') || 50)
  if (!Number.isInteger(limit) || limit<1 || limit>100) throw new CrmValidationError([{path:'limit',message:'Use 1 to 100'}])
  let q = db.from(table).select(collection==='people' ? '*,person:crm_people(*)' : '*', {count:'exact'}).eq(scope==='source_id' ? 'id' : scope, scopeId)
  // ID pagination is stable for append-only evidence. UI sorts observation dates separately.
  const total = await db.from(table).select('id',{count:'exact',head:true}).eq(scope==='source_id' ? 'id' : scope,scopeId)
  crmDatabaseError(total.error)
  if (params.get('after')) q=q.gt('id',params.get('after')!)
  const result=await q.order('id').limit(limit+1)
  crmDatabaseError(result.error)
  const rows=(result.data ?? []) as unknown as CrmStoredRecord[]
  return { collection, total_matching:total.count ?? 0, records:rows.slice(0,limit), next_after:rows.length>limit ? rows[limit-1].id : null }
}
