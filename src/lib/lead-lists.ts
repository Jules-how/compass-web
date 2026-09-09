import { resolveLeadScope, scopedLeadQuery } from './lead-scope'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CompassLeadList = {
  id: string
  name: string
  notes: string | null
  created_at: string
  updated_at: string
  member_count?: number
}

export type CohortSource = 'lists' | 'pipeline'

export type CampaignCohort = {
  source: CohortSource
  listIds: string[]
  leadIds: string[]
}

const MEMBER_PAGE = 1000
const LEAD_IN_CHUNK = 200

export function chunkIds(ids: string[], size = LEAD_IN_CHUNK): string[][] {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size))
  }
  return chunks
}

export function newLeadListId(): string {
  return `list-${crypto.randomUUID()}`
}

export async function fetchListIdsForCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('compass_campaign_lists')
    .select('list_id')
    .eq('campaign_id', campaignId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => String(row.list_id)).filter(Boolean)
}

export async function fetchMemberLeadIds(
  supabase: SupabaseClient,
  listIds: string[]
): Promise<string[]> {
  const ids = listIds.map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) return []
  const found: string[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('compass_lead_list_members')
      .select('lead_id')
      .in('list_id', ids)
      .order('list_id').order('lead_id')
      .range(from, from + MEMBER_PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const row of rows) {
      const leadId = typeof row.lead_id === 'string' ? row.lead_id.trim() : ''
      if (leadId) found.push(leadId)
    }
    if (rows.length < MEMBER_PAGE) break
    from += MEMBER_PAGE
  }
  return Array.from(new Set(found))
}

async function fetchPipelineLeadIds(
  supabase: SupabaseClient,
  campaignId: string
): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; ; from += MEMBER_PAGE) {
    const { data, error } = await supabase.from('lead_contacts').select('id').eq('pipeline_campaign_id', campaignId).order('id').range(from, from + MEMBER_PAGE - 1)
    if (error) throw new Error(error.message)
    ids.push(...(data ?? []).map(row => String(row.id)))
    if (!data || data.length < MEMBER_PAGE) return ids
  }
}

export async function resolveCampaignCohort(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CampaignCohort> {
  const listIds = await fetchListIdsForCampaign(supabase, campaignId)
  if (listIds.length > 0) {
    const leadIds = await fetchMemberLeadIds(supabase, listIds)
    return { source: 'lists', listIds, leadIds }
  }
  const leadIds = await fetchPipelineLeadIds(supabase, campaignId)
  return { source: 'pipeline', listIds: [], leadIds }
}

export async function selectLeadsByIds<T>(
  supabase: SupabaseClient,
  columns: string,
  leadIds: string[],
  extra?: (query: any) => any
): Promise<T[]> {
  const chunks = chunkIds(leadIds)
  if (chunks.length === 0) return []
  const out: T[] = []
  for (const chunk of chunks) {
    let query = supabase.from('lead_contacts').select(columns).in('id', chunk)
    if (extra) query = extra(query)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    if (Array.isArray(data)) out.push(...(data as T[]))
  }
  return out
}

export async function loadCampaignCohortLeadRows<T>(
  supabase: SupabaseClient,
  campaignId: string,
  columns: string,
  extra?: (query: ReturnType<SupabaseClient['from']>) => ReturnType<SupabaseClient['from']>
): Promise<{ cohort: CampaignCohort; rows: T[] }> {
  const cohort = await resolveCampaignCohort(supabase, campaignId)
  if (cohort.leadIds.length === 0) return { cohort, rows: [] }
  const rows = await selectLeadsByIds<T>(supabase, columns, cohort.leadIds, extra)
  return { cohort, rows }
}

export async function loadCohortLeadRowsForCampaigns<T extends { id?: string | null }>(
  supabase: SupabaseClient,
  campaignIds: string[],
  columns: string
): Promise<Record<string, T[]>> {
  const out: Record<string, T[]> = {}
  for (const id of [...new Set(campaignIds.map(id => id.trim()).filter(Boolean))]) {
    const scope = await resolveLeadScope(supabase, { cohort_campaign_id: id })
    const rows: T[] = []
    for (let from = 0; ; from += MEMBER_PAGE) {
      let query = scopedLeadQuery(supabase, columns, scope)
      if (scope.filters.pipeline_campaign_id) query = query.eq('pipeline_campaign_id', scope.filters.pipeline_campaign_id)
      const { data, error } = await query.order('id').range(from, from + MEMBER_PAGE - 1)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []) as unknown as T[])
      if (!data || data.length < MEMBER_PAGE) break
    }
    out[id] = rows
  }
  return out
}

export async function countMembersByList(
  supabase: SupabaseClient,
  listIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const id of listIds) {
    const { count, error } = await supabase.from('compass_lead_list_members').select('lead_id', { count: 'exact', head: true }).eq('list_id', id)
    if (error) throw new Error(error.message)
    counts[id] = count ?? 0
  }
  return counts
}

export async function listCrmLists(supabase: SupabaseClient): Promise<CompassLeadList[]> {
  const { data, error } = await supabase
    .from('compass_lead_lists')
    .select('id,name,notes,created_at,updated_at')
    .order('name')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as CompassLeadList[]
  const counts = await countMembersByList(
    supabase,
    rows.map((row) => row.id)
  )
  return rows.map((row) => ({ ...row, member_count: counts[row.id] ?? 0 }))
}

export async function replaceCampaignLists(
  supabase: SupabaseClient,
  campaignId: string,
  listIds: string[]
): Promise<string[]> {
  const { data, error } = await supabase.rpc('compass_replace_campaign_lists', { p_campaign_id: campaignId, p_list_ids: listIds })
  if (error) throw new Error(error.message)
  return data as string[]
}

export async function addListMembers(
  supabase: SupabaseClient,
  listId: string,
  leadIds: string[]
): Promise<number> {
  const ids = Array.from(new Set(leadIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return 0
  const rows = ids.map((lead_id) => ({ list_id: listId, lead_id }))
  const { error } = await supabase.from('compass_lead_list_members').upsert(rows, {
    onConflict: 'list_id,lead_id',
    ignoreDuplicates: true
  })
  if (error) throw new Error(error.message)
  return ids.length
}

export async function removeListMembers(
  supabase: SupabaseClient,
  listId: string,
  leadIds: string[]
): Promise<number> {
  const ids = Array.from(new Set(leadIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return 0
  const { error } = await supabase
    .from('compass_lead_list_members')
    .delete()
    .eq('list_id', listId)
    .in('lead_id', ids)
  if (error) throw new Error(error.message)
  return ids.length
}
