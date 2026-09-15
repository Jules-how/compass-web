import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeadListFilters } from './types'
import { crmFilterSchema } from './crm-research-query'

export type LeadScope = { filters: LeadListFilters; listIds?: string[] }

/** Resolve membership once, then let Postgres filter/count/page the canonical lead rows. */
export async function resolveLeadScope(db: SupabaseClient, filters: LeadListFilters): Promise<LeadScope> {
  if (filters.list_id) return { filters, listIds: [filters.list_id] }
  if (!filters.cohort_campaign_id) return { filters }
  const { data, error } = await db.from('compass_campaign_lists').select('list_id').eq('campaign_id', filters.cohort_campaign_id)
  if (error) throw new Error(error.message)
  const listIds = [...new Set((data ?? []).map(row => String(row.list_id)))]
  return listIds.length
    ? { filters: { ...filters, pipeline_campaign_id: undefined, instantly_campaign_id: undefined }, listIds }
    : { filters: { ...filters, pipeline_campaign_id: filters.cohort_campaign_id } }
}

export function scopedLeadQuery(db: SupabaseClient, columns: string, scope: LeadScope, options: { count?: 'exact'; head?: boolean } = {}) {
  const filters=scope.filters
  const companyFilters=Object.fromEntries(Object.entries({customer_mix:filters.company_customer_mix,system:filters.company_system,region:filters.company_region,fit_status:filters.company_fit,min_rating:filters.company_min_rating,min_age:filters.company_min_age,freshness:filters.company_freshness}).filter(([,value])=>value!==undefined))
  if (Object.keys(companyFilters).length) {
    if (process.env.COMPASS_CRM_RESEARCH!=='1') throw new Error('crm_research_disabled')
    const parsed=crmFilterSchema.safeParse(companyFilters)
    if (!parsed.success) throw new Error('invalid_company_filters:'+parsed.error.issues.map(x=>x.message).join('; '))
    return db.rpc('crm_research_lead_scope',{p_list_ids:scope.listIds ?? null,p_company_filters:parsed.data},options).select(columns)
  }
  return scope.listIds
    ? db.rpc('compass_list_cohort_leads', { p_list_ids: scope.listIds }, options).select(columns)
    : db.from('lead_contacts').select(columns, options)
}
