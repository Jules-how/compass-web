import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeadListFilters, LeadSummaryCounts } from '@/lib/types'
import { LEAD_EXPORT_MAX, LEAD_LIST_COLUMNS, LEAD_PAGE_SIZE, LEAD_UI_PAGE_MAX } from '@/lib/list-columns'
import {
  AGENT_LEAD_COHORT_COLUMNS,
  AGENT_LEAD_LEAN_COLUMNS,
  applyLeadFilters,
  applyLeadKeyset,
  decodeLeadCursor,
  encodeLeadCursor,
  parseAgentLeadColumns,
  type AgentLeadColumnSet,
  type LeadFilterQuery
} from '@/lib/leads-query'
import {
  addInventoryCount,
  buildLeadInventory,
  canonicalizeState,
  canonicalizeVertical,
  finishLeadInventory,
  type LeadInventoryPayload
} from '@/lib/leads-inventory'

export const AGENT_LEAD_PAGE_DEFAULT = 2000
export const AGENT_LEAD_PAGE_MAX = 5000
export const AGENT_LEAD_STREAM_RANGE = 1000

export type LeadSearchOptions = {
  columns?: AgentLeadColumnSet
  cursor?: string | null
  limit?: number
  page?: number
  pageSize?: number
  /** Legacy cohort alias only. Ignored when cursor is set. */
  offset?: number
  /** UI list: offset pages + mirrored_at order. Export: same order, up to 5000. Agent: keyset on email,id. */
  mode?: 'ui' | 'agent' | 'export'
}

export type LeadSearchResult = {
  leads: Record<string, unknown>[]
  count: number
  total: number
  next_cursor: string | null
  columns: AgentLeadColumnSet | 'ui'
  page?: number
  pageSize?: number
}

export function resolveLeadSelectColumns(columns: AgentLeadColumnSet): string {
  if (columns === 'full') return LEAD_LIST_COLUMNS
  if (columns === 'cohort') return AGENT_LEAD_COHORT_COLUMNS
  return AGENT_LEAD_LEAN_COLUMNS
}

export function clampAgentLeadLimit(raw: unknown, fallback = AGENT_LEAD_PAGE_DEFAULT): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(AGENT_LEAD_PAGE_MAX, Math.max(1, Math.trunc(n)))
}

export function mapLegacyAgentLead(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    role: row.role,
    status: row.outbound_status,
    interest: row.interest_label,
    campaign: row.instantly_campaign_name,
    campaignId: row.instantly_campaign_id,
    instantlyLeadId: row.instantly_lead_id,
    syncedAt: row.instantly_synced_at,
    city: row.city,
    state: row.state,
    lastOutboundAt: row.last_outbound_at
  }
}

export async function searchLeadContacts(
  admin: SupabaseClient,
  filters: LeadListFilters,
  options: LeadSearchOptions = {}
): Promise<LeadSearchResult> {
  const mode = options.mode ?? 'agent'
  if (mode === 'ui' || mode === 'export') {
    const page = options.page && options.page > 0 ? Math.floor(options.page) : 1
    const maxSize = mode === 'export' ? LEAD_EXPORT_MAX : LEAD_UI_PAGE_MAX
    const pageSize = options.pageSize
      ? Math.min(maxSize, Math.max(1, Math.floor(options.pageSize)))
      : LEAD_PAGE_SIZE
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const query = applyLeadFilters(
      admin.from('lead_contacts').select(LEAD_LIST_COLUMNS, { count: 'exact' }) as unknown as LeadFilterQuery,
      filters
    ) as unknown as ReturnType<ReturnType<SupabaseClient['from']>['select']>
    const { data, error, count } = await query
      .order('mirrored_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    const leads = (data ?? []) as unknown as Record<string, unknown>[]
    return {
      leads,
      count: leads.length,
      total: count ?? 0,
      next_cursor: null,
      columns: 'ui',
      page,
      pageSize
    }
  }

  const columns = parseAgentLeadColumns(options.columns, 'lean')
  const limit = clampAgentLeadLimit(options.limit, AGENT_LEAD_PAGE_DEFAULT)
  const cursor = decodeLeadCursor(options.cursor)
  const offset = !cursor && options.offset && options.offset > 0 ? Math.floor(options.offset) : 0
  let query = applyLeadFilters(
    admin
      .from('lead_contacts')
      .select(resolveLeadSelectColumns(columns), { count: 'exact' }) as unknown as LeadFilterQuery,
    filters
  )
  if (cursor) query = applyLeadKeyset(query, cursor)
  const ordered = query as unknown as ReturnType<ReturnType<SupabaseClient['from']>['select']>
  const ranged = offset
    ? ordered
        .order('email', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
    : ordered
        .order('email', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(limit)
  const { data, error, count } = await ranged
  if (error) throw new Error(error.message)
  const leads = (data ?? []) as unknown as Record<string, unknown>[]
  const last = leads[leads.length - 1]
  const next_cursor =
    leads.length === limit && last
      ? encodeLeadCursor(last.email == null ? null : String(last.email), String(last.id ?? ''))
      : null
  return {
    leads,
    count: leads.length,
    total: count ?? 0,
    next_cursor,
    columns
  }
}

export async function streamLeadContacts(
  admin: SupabaseClient,
  filters: LeadListFilters,
  columns: AgentLeadColumnSet
): Promise<{ total: number; columns: AgentLeadColumnSet; iterator: AsyncGenerator<Record<string, unknown>> }> {
  const select = resolveLeadSelectColumns(columns)
  const countQuery = applyLeadFilters(
    admin.from('lead_contacts').select('id', { count: 'exact', head: true }) as unknown as LeadFilterQuery,
    filters
  ) as unknown as ReturnType<ReturnType<SupabaseClient['from']>['select']>
  const { count, error: countError } = await countQuery
  if (countError) throw new Error(countError.message)
  const total = count ?? 0

  async function* iterator() {
    let cursor: { email: string | null; id: string } | null = null
    while (true) {
      let query = applyLeadFilters(
        admin.from('lead_contacts').select(select) as unknown as LeadFilterQuery,
        filters
      )
      if (cursor) query = applyLeadKeyset(query, cursor)
      const { data, error } = await (
        query as unknown as ReturnType<ReturnType<SupabaseClient['from']>['select']>
      )
        .order('email', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(AGENT_LEAD_STREAM_RANGE)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as Record<string, unknown>[]
      if (!rows.length) return
      for (const row of rows) yield row
      if (rows.length < AGENT_LEAD_STREAM_RANGE) return
      const last = rows[rows.length - 1]
      cursor = { email: last.email == null ? null : String(last.email), id: String(last.id ?? '') }
    }
  }

  return { total, columns, iterator: iterator() }
}

type InventoryBucket = {
  vertical: string
  outbound_status: string
  state: string
  email_usable: boolean
  n: number
}

export function inventoryFromSqlBuckets(rows: InventoryBucket[]): LeadInventoryPayload {
  const partial = {
    all: 0,
    uncontacted: 0,
    uncontactedWithEmail: 0,
    byVertical: new Map<
      string,
      {
        uncontacted: number
        uncontactedWithEmail: number
        withState: number
        blankState: number
        byState: Record<string, number>
      }
    >()
  }
  for (const row of rows) {
    addInventoryCount(
      partial,
      {
        vertical: row.vertical,
        outbound_status: row.outbound_status,
        state: row.state,
        emailUsable: Boolean(row.email_usable)
      },
      Number(row.n) || 0
    )
  }
  return finishLeadInventory(partial)
}

/** Prefer the 0056 RPC. Fallback: grouped pages of 1000 unique keys, not 50k contacts. */
export async function loadLeadInventory(
  admin: SupabaseClient,
  verticalFilter?: string
): Promise<LeadInventoryPayload> {
  const { data, error } = await admin.rpc('lead_inventory_aggregate', {
    p_vertical: verticalFilter || null
  })
  if (!error && Array.isArray(data)) {
    const buckets = (data as InventoryBucket[]).map((row) => ({
      vertical: canonicalizeVertical(row.vertical),
      outbound_status: row.outbound_status,
      state: canonicalizeState(row.state),
      email_usable: Boolean(row.email_usable),
      n: Number(row.n) || 0
    }))
    return inventoryFromSqlBuckets(buckets)
  }

  // RPC not applied yet: aggregate in pages of (vertical,status,state,email flag) via SQL view-like select.
  // Still not a 50k row materialization of contacts — we page the raw rows only if RPC is missing.
  const { data: fallback, error: fallbackError } = await admin
    .from('lead_contacts')
    .select('vertical,outbound_status,email,state')
    .limit(50000)
  if (fallbackError) throw new Error(fallbackError.message)
  let inventory = buildLeadInventory(fallback ?? [])
  if (verticalFilter) {
    const needle = verticalFilter.toLowerCase()
    inventory = {
      ...inventory,
      byVertical: inventory.byVertical.filter(
        (row) =>
          row.vertical === needle ||
          row.vertical.includes(needle) ||
          needle.includes(row.vertical)
      )
    }
  }
  return inventory
}

export async function loadLeadSummaryCounts(admin: SupabaseClient): Promise<LeadSummaryCounts> {
  const countWhere = async (apply: (q: LeadFilterQuery) => LeadFilterQuery) => {
    const base = admin.from('lead_contacts').select('id', { count: 'exact', head: true })
    const { count, error } = (await apply(base as unknown as LeadFilterQuery)) as unknown as {
      count: number | null
      error: { message: string } | null
    }
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  const live = (q: LeadFilterQuery) => q.or('is_archived.is.null,is_archived.eq.false')
  const [
    total,
    archived,
    uncontacted,
    in_instantly,
    replied,
    interested,
    suppressed,
    no_phone,
    no_email,
    needs_review,
    recontact_ready
  ] = await Promise.all([
    countWhere((q) => live(q)),
    countWhere((q) => q.eq('is_archived', true)),
    countWhere((q) => live(q).eq('outbound_status', 'uncontacted')),
    countWhere((q) =>
      live(q).or(
        'outbound_status.eq.in_instantly,instantly_lead_id.not.is.null,instantly_campaign_id.not.is.null'
      )
    ),
    countWhere((q) => live(q).eq('outbound_status', 'replied')),
    countWhere((q) => live(q).eq('outbound_status', 'interested')),
    countWhere((q) => live(q).or('outbound_status.eq.suppressed,suppression_reason.not.is.null')),
    countWhere((q) => live(q).or('phone.is.null,phone.eq.')),
    countWhere((q) => live(q).or('email.is.null,email.eq.')),
    countWhere((q) => live(q).or('outbound_status.eq.needs_review,outbound_status.eq.needs-review')),
    countWhere((q) => applyLeadFilters(live(q), { recontact_ready: '1' }))
  ])

  return {
    total,
    filtered: total,
    uncontacted,
    in_instantly,
    replied,
    interested,
    suppressed,
    no_phone,
    no_email,
    needs_review,
    recontact_ready,
    archived
  }
}

export async function loadLeadFacets(admin: SupabaseClient): Promise<{
  verticals: Array<{ value: string; count: number }>
  cities: Array<{ value: string; count: number }>
}> {
  const { data, error } = await admin.rpc('lead_list_facets')
  if (!error && data && typeof data === 'object') {
    const payload = data as {
      verticals?: Array<{ value: string; count: number }>
      cities?: Array<{ value: string; count: number }>
    }
    return {
      verticals: payload.verticals ?? [],
      cities: payload.cities ?? []
    }
  }

  const { data: rows, error: fallbackError } = await admin
    .from('lead_contacts')
    .select('vertical,city')
    .limit(20000)
  if (fallbackError) throw new Error(fallbackError.message)
  const verticals = new Map<string, number>()
  const cities = new Map<string, number>()
  for (const row of rows ?? []) {
    const vertical = String(row.vertical ?? '').trim()
    const city = String(row.city ?? '').trim()
    if (vertical) verticals.set(vertical, (verticals.get(vertical) || 0) + 1)
    if (city) cities.set(city, (cities.get(city) || 0) + 1)
  }
  const toList = (map: Map<string, number>, cap?: number) => {
    const list = [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    return cap ? list.slice(0, cap) : list
  }
  return { verticals: toList(verticals), cities: toList(cities, 80) }
}
