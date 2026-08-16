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
      .range(from, from + MEMBER_PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const row of rows) {
      const leadId = typeof row.lead_id === 'string' ? row.lead_id.trim() : ''
      if (leadId) found.push(leadId)
    }
    if (rows.length < MEMBER_PAGE) break
    from += MEMBER_PAGE
    if (from > 50_000) break
  }
  return Array.from(new Set(found))
}

async function fetchPipelineLeadIds(
  supabase: SupabaseClient,
  campaignId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('lead_contacts')
    .select('id')
    .eq('pipeline_campaign_id', campaignId)
    .limit(8000)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => (typeof row.id === 'string' ? row.id.trim() : ''))
    .filter(Boolean)
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
  const ids = campaignIds.map((id) => id.trim()).filter(Boolean)
  const out: Record<string, T[]> = {}
  for (const id of ids) out[id] = []
  if (ids.length === 0) return out

  const { data: attachments, error: attachError } = await supabase
    .from('compass_campaign_lists')
    .select('campaign_id,list_id')
    .in('campaign_id', ids)
  if (attachError) throw new Error(attachError.message)

  const listsByCampaign = new Map<string, string[]>()
  for (const row of attachments ?? []) {
    const campaignId = String(row.campaign_id || '')
    const listId = String(row.list_id || '')
    if (!campaignId || !listId) continue
    const bucket = listsByCampaign.get(campaignId) ?? []
    bucket.push(listId)
    listsByCampaign.set(campaignId, bucket)
  }

  const listed = Array.from(listsByCampaign.keys())
  const fallback = ids.filter((id) => !listsByCampaign.has(id))
  const allListIds = Array.from(new Set(listed.flatMap((id) => listsByCampaign.get(id) ?? [])))
  const membersByList = new Map<string, string[]>()
  if (allListIds.length) {
    const { data: members, error: memberError } = await supabase
      .from('compass_lead_list_members')
      .select('list_id,lead_id')
      .in('list_id', allListIds)
      .limit(50_000)
    if (memberError) throw new Error(memberError.message)
    for (const row of members ?? []) {
      const listId = String(row.list_id || '')
      const leadId = String(row.lead_id || '')
      if (!listId || !leadId) continue
      const bucket = membersByList.get(listId) ?? []
      bucket.push(leadId)
      membersByList.set(listId, bucket)
    }
  }

  const leadIdsByCampaign = new Map<string, string[]>()
  for (const campaignId of listed) {
    const leadIds = Array.from(
      new Set(
        (listsByCampaign.get(campaignId) ?? []).flatMap((listId) => membersByList.get(listId) ?? [])
      )
    )
    leadIdsByCampaign.set(campaignId, leadIds)
  }

  const unionLeadIds = Array.from(new Set(Array.from(leadIdsByCampaign.values()).flat()))
  const leadsById = new Map<string, T>()
  if (unionLeadIds.length) {
    const rows = await selectLeadsByIds<T>(supabase, columns, unionLeadIds)
    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : ''
      if (id) leadsById.set(id, row)
    }
  }

  for (const campaignId of listed) {
    out[campaignId] = (leadIdsByCampaign.get(campaignId) ?? [])
      .map((leadId) => leadsById.get(leadId))
      .filter((row): row is T => Boolean(row))
  }

  if (fallback.length) {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select(columns)
      .in('pipeline_campaign_id', fallback)
      .limit(8000)
    if (error) throw new Error(error.message)
    const fallbackRows = (data ?? []) as unknown as Array<T & { pipeline_campaign_id?: string | null }>
    for (const row of fallbackRows) {
      const campaignId =
        typeof row.pipeline_campaign_id === 'string' ? row.pipeline_campaign_id : ''
      if (!campaignId || !out[campaignId]) continue
      out[campaignId].push(row)
    }
  }

  return out
}

export async function countMembersByList(
  supabase: SupabaseClient,
  listIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const id of listIds) counts[id] = 0
  if (listIds.length === 0) return counts
  const { data, error } = await supabase
    .from('compass_lead_list_members')
    .select('list_id')
    .in('list_id', listIds)
    .limit(50_000)
  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    const id = typeof row.list_id === 'string' ? row.list_id : ''
    if (!id) continue
    counts[id] = (counts[id] ?? 0) + 1
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
  const next = Array.from(new Set(listIds.map((id) => id.trim()).filter(Boolean)))
  const { error: delError } = await supabase
    .from('compass_campaign_lists')
    .delete()
    .eq('campaign_id', campaignId)
  if (delError) throw new Error(delError.message)
  if (next.length === 0) return []
  const { error: insError } = await supabase.from('compass_campaign_lists').insert(
    next.map((list_id) => ({ campaign_id: campaignId, list_id }))
  )
  if (insError) throw new Error(insError.message)
  return next
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
