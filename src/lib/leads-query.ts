import type { LeadListFilters } from '@/lib/types'
import { PROSPECT_OUTBOUND_STATUSES, parseLeadBucket } from '@/lib/lead-buckets'
import { verticalFilterValues, type CompletenessFilter } from '@/lib/leads-meta'
import { recontactCutoffIso } from '@/lib/recontact-eligibility'

/** Loose PostgREST query builder — matches supabase-js filter chain. */
export type LeadFilterQuery = {
  eq: (column: string, value: unknown) => LeadFilterQuery
  in: (column: string, values: readonly string[]) => LeadFilterQuery
  ilike: (column: string, pattern: string) => LeadFilterQuery
  or: (filters: string) => LeadFilterQuery
  is: (column: string, value: null) => LeadFilterQuery
  not: (column: string, operator: string, value: unknown) => LeadFilterQuery
  neq: (column: string, value: unknown) => LeadFilterQuery
  lt: (column: string, value: unknown) => LeadFilterQuery
  gte: (column: string, value: unknown) => LeadFilterQuery
}

export function parseLeadListFilters(searchParams: URLSearchParams): LeadListFilters {
  const completeness = searchParams.get('completeness') ?? undefined
  const recontact = searchParams.get('recontact_ok')
  const suppressed = searchParams.get('suppressed')
  const recontactReady = searchParams.get('recontact_ready')
  return {
    vertical: emptyToUndef(searchParams.get('vertical')),
    source: emptyToUndef(searchParams.get('source')),
    outbound_status: emptyToUndef(searchParams.get('outbound_status')),
    sync_state: emptyToUndef(searchParams.get('sync_state')),
    completeness: isCompleteness(completeness) ? completeness : undefined,
    city: emptyToUndef(searchParams.get('city')),
    state: emptyToUndef(searchParams.get('state')),
    q: emptyToUndef(searchParams.get('q')),
    unverified_only:
      searchParams.get('unverified_only') === '1' || searchParams.get('unverified_only') === '0'
        ? (searchParams.get('unverified_only') as '1' | '0')
        : undefined,
    recontact_ok: recontact === '1' || recontact === '0' ? recontact : undefined,
    suppressed: suppressed === '1' || suppressed === '0' ? suppressed : undefined,
    recontact_ready:
      recontactReady === '1' || recontactReady === '0' ? recontactReady : undefined,
    bucket: parseLeadBucket(searchParams.get('bucket')),
    pipeline_campaign_id: emptyToUndef(searchParams.get('pipeline_campaign_id')),
    instantly_campaign_id: emptyToUndef(searchParams.get('instantly_campaign_id')),
    cohort_tag: emptyToUndef(searchParams.get('cohort_tag')),
    enrich_status: emptyToUndef(searchParams.get('enrich_status')),
    icp_status: emptyToUndef(searchParams.get('icp_status')),
    after_hours:
      searchParams.get('after_hours') === '1' || searchParams.get('after_hours') === '0'
        ? (searchParams.get('after_hours') as '1' | '0')
        : undefined,
    email_origin: emptyToUndef(searchParams.get('email_origin')),
    min_reviews: emptyToUndef(searchParams.get('min_reviews')),
    list_id: emptyToUndef(searchParams.get('list_id')),
    cohort_campaign_id: emptyToUndef(searchParams.get('cohort_campaign_id'))
  }
}

/** OR membership when a lead may be tagged on the Compass campaign, Instantly, or both. */
export function campaignMembershipOrClause(
  pipelineCampaignId?: string,
  instantlyCampaignId?: string
): string | null {
  const pipeline = pipelineCampaignId?.trim()
  const instantly = instantlyCampaignId?.trim()
  if (!pipeline || !instantly || pipeline === instantly) return null
  return `pipeline_campaign_id.eq.${escapePostgrestOrValue(pipeline)},instantly_campaign_id.eq.${escapePostgrestOrValue(instantly)}`
}

function emptyToUndef(value: string | null): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function isCompleteness(value: string | undefined): value is CompletenessFilter {
  return (
    value === 'any' ||
    value === 'has_phone' ||
    value === 'no_phone' ||
    value === 'has_email' ||
    value === 'no_email'
  )
}

/** Shared PostgREST filters for the 90-day recontact-ready queue. */
export function applyRecontactReadyFilters<T extends LeadFilterQuery>(
  query: T,
  now = new Date()
): T {
  let q = query
  const cutoff = recontactCutoffIso(now)
  // Not suppressed / not explicitly blocked.
  q = q.neq('outbound_status', 'suppressed') as T
  q = q.is('suppression_reason', null) as T
  q = q.or('recontact_ok.eq.1,recontact_ok.is.null') as T
  // Must have been contacted, and last touch older than cooldown.
  q = q.not('last_outbound_at', 'is', null) as T
  q = q.lt('last_outbound_at', cutoff) as T
  // Exclude hot pipeline stages — those need personal follow-up, not cold re-launch.
  q = q.not(
    'outbound_status',
    'in',
    '(replied,interested,booked,meeting_booked,converted)'
  ) as T
  return q
}

export function applyLeadFilters<T extends LeadFilterQuery>(query: T, filters: LeadListFilters): T {
  let q = query

  if (filters.vertical) {
    const values = verticalFilterValues(filters.vertical)
    if (values.length === 1) {
      // Case-insensitive exact match for free-text historical values.
      q = q.ilike('vertical', values[0]) as T
    } else if (values.length > 1) {
      // PostgREST `or` with ilike covers casing / spaced Industry spellings.
      const clause = values
        .slice(0, 40)
        .map((v) => `vertical.ilike.${escapePostgrestOrValue(v)}`)
        .join(',')
      q = q.or(clause) as T
    }
  }
  if (filters.source) q = q.eq('source', filters.source) as T
  const pipelineId = filters.pipeline_campaign_id?.trim()
  const unattached = pipelineId?.toLowerCase() === 'none'
  const membershipOr = unattached
    ? null
    : campaignMembershipOrClause(filters.pipeline_campaign_id, filters.instantly_campaign_id)
  if (membershipOr) {
    q = q.or(membershipOr) as T
  } else if (unattached) {
    q = q.is('pipeline_campaign_id', null) as T
  } else if (pipelineId) {
    q = q.eq('pipeline_campaign_id', pipelineId) as T
  } else if (filters.instantly_campaign_id) {
    q = q.eq('instantly_campaign_id', filters.instantly_campaign_id) as T
  }
  if (filters.cohort_tag) {
    q = q.eq('cohort_tag', filters.cohort_tag) as T
  }
  if (filters.enrich_status) {
    q = applyCsvOrEq(q, 'enrich_status', filters.enrich_status) as T
  }
  if (filters.icp_status) {
    q = applyCsvOrEq(q, 'icp_status', filters.icp_status) as T
  }
  if (filters.after_hours === '1') {
    q = q.eq('after_hours', true) as T
  } else if (filters.after_hours === '0') {
    q = q.eq('after_hours', false) as T
  }
  if (filters.email_origin) {
    q = q.eq('email_origin', filters.email_origin) as T
  }
  if (filters.min_reviews) {
    const min = Number(filters.min_reviews)
    if (Number.isFinite(min) && min >= 0) {
      q = q.gte('review_count', min) as T
    }
  }
  if (filters.outbound_status) {
    // Pipeline filter: exact match on outbound_status.
    // Also accept replied|interested via multi for preset "hot" if needed later.
    if (filters.outbound_status === 'replied_or_interested') {
      q = q.in('outbound_status', ['replied', 'interested']) as T
    } else {
      q = applyCsvOrEq(q, 'outbound_status', filters.outbound_status) as T
    }
  }
  if (filters.city) q = q.ilike('city', `%${escapeIlike(filters.city)}%`) as T
  if (filters.state) q = q.ilike('state', `%${escapeIlike(filters.state)}%`) as T
  if (filters.unverified_only === '1') {
    q = q.is('email_verified_at', null) as T
  } else if (filters.unverified_only === '0') {
    q = q.not('email_verified_at', 'is', null) as T
  }

  if (filters.q) {
    const term = escapeIlike(filters.q)
    q = q.or(
      `name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%`
    ) as T
  }

  if (filters.completeness && filters.completeness !== 'any') {
    q = applyCompleteness(q, filters.completeness) as T
  }

  if (filters.sync_state) {
    q = applySyncState(q, filters.sync_state) as T
  }

  if (filters.suppressed === '1') {
    q = q.or('outbound_status.eq.suppressed,suppression_reason.not.is.null') as T
  } else if (filters.suppressed === '0') {
    q = q.neq('outbound_status', 'suppressed') as T
    q = q.is('suppression_reason', null) as T
  }

  if (filters.recontact_ok === '1') {
    q = q.eq('recontact_ok', 1) as T
  } else if (filters.recontact_ok === '0') {
    q = q.or('recontact_ok.eq.0,recontact_ok.is.null') as T
  }

  if (filters.recontact_ready === '1') {
    q = applyRecontactReadyFilters(q) as T
  } else if (filters.recontact_ready === '0') {
    // Inverse is intentionally broad: never contacted, still cooling, blocked, or hot.
    // Prefer the positive filter for operator workflows.
    const cutoff = recontactCutoffIso()
    q = q.or(
      `last_outbound_at.is.null,last_outbound_at.gte.${cutoff},outbound_status.eq.suppressed,suppression_reason.not.is.null,recontact_ok.eq.0,outbound_status.in.(replied,interested,booked,meeting_booked,converted)`
    ) as T
  }

  // Archive is orthogonal to pipeline stage. Agent search (no bucket) does not clip.
  if (filters.bucket === 'archived') {
    q = q.eq('is_archived', true) as T
  } else if (filters.bucket === 'leads' || filters.bucket === 'prospects') {
    q = q.or('is_archived.is.null,is_archived.eq.false') as T
  }

  // Leads vs Prospects tabs. Only when the caller names a bucket (UI defaults to leads).
  if (!filters.outbound_status && filters.bucket) {
    const prospectList = PROSPECT_OUTBOUND_STATUSES.join(',')
    if (filters.bucket === 'prospects') {
      q = q.in('outbound_status', [...PROSPECT_OUTBOUND_STATUSES]) as T
    } else if (filters.bucket === 'leads') {
      q = q.or(`outbound_status.is.null,outbound_status.not.in.(${prospectList})`) as T
    }
  }

  return q
}

export function splitCsvParam(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function applyCsvOrEq(query: LeadFilterQuery, column: string, raw: string): LeadFilterQuery {
  const values = splitCsvParam(raw)
  if (values.length === 0) return query
  if (values.length === 1) return query.eq(column, values[0])
  return query.in(column, values)
}

export type LeadKeysetCursor = { email: string | null; id: string }

export function encodeLeadCursor(email: string | null, id: string): string {
  return Buffer.from(JSON.stringify([email, id]), 'utf8').toString('base64url')
}

export function decodeLeadCursor(raw: string | null | undefined): LeadKeysetCursor | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    if (decoded.startsWith('[')) {
      const value: unknown = JSON.parse(decoded)
      if (!Array.isArray(value) || value.length !== 2 ||
          (value[0] !== null && typeof value[0] !== 'string') ||
          typeof value[1] !== 'string' || !value[1].trim()) return null
      return { email: value[0], id: value[1] }
    }
    // Accept existing non-null email cursors issued before the null-safe format.
    const tab = decoded.indexOf('\t')
    if (tab < 0) return null
    const email = decoded.slice(0, tab)
    const id = decoded.slice(tab + 1).trim()
    if (!id) return null
    return { email, id }
  } catch {
    return null
  }
}

/** Keyset on (email, id) ascending. */
export function applyLeadKeyset<T extends LeadFilterQuery>(query: T, cursor: LeadKeysetCursor): T {
  const id = escapePostgrestOrValue(cursor.id)
  if (cursor.email === null) return query.or(`and(email.is.null,id.gt.${id})`) as T
  const email = escapePostgrestOrValue(cursor.email)
  return query.or(`email.gt.${email},and(email.eq.${email},id.gt.${id}),email.is.null`) as T
}

const LEGACY_AGENT_LEAD_PARAMS = new Set(['status', 'limit', 'q'])

/** Old Instantly-hot list: only status / limit / q (plus empty). */
export function isLegacyAgentLeadsRequest(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (!LEGACY_AGENT_LEAD_PARAMS.has(key)) return false
  }
  return true
}

export const AGENT_LEAD_LEAN_COLUMNS =
  'id,name,email,company,role,outbound_status,interest_label,instantly_campaign_name,instantly_campaign_id,instantly_lead_id,instantly_synced_at,city,state,last_outbound_at,updated_at'

export const AGENT_LEAD_COHORT_COLUMNS =
  'id,name,email,company,city,state,linkedin,website,company_domain,vertical,enrich_status,lead_facts,opener,outbound_status,pipeline_campaign_id,cohort_tag,email_verify_status,email_verified_at,icp_status,review_count,hours_label,after_hours,capture_crack,email_origin'

export type AgentLeadColumnSet = 'lean' | 'cohort' | 'full'

export function parseAgentLeadColumns(
  value: string | null | undefined,
  fallback: AgentLeadColumnSet = 'lean'
): AgentLeadColumnSet {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'lean' || raw === 'cohort' || raw === 'full') return raw
  return fallback
}

export function applyCompleteness(query: LeadFilterQuery, completeness: CompletenessFilter): LeadFilterQuery {
  switch (completeness) {
    case 'has_phone':
      return query.not('phone', 'is', null).neq('phone', '')
    case 'no_phone':
      return query.or('phone.is.null,phone.eq.')
    case 'has_email':
      return query.not('email', 'is', null).neq('email', '')
    case 'no_email':
      return query.or('email.is.null,email.eq.')
    default:
      return query
  }
}

function applySyncState(query: LeadFilterQuery, syncState: string): LeadFilterQuery {
  switch (syncState) {
    case 'in_instantly':
      return query.or(
        'outbound_status.eq.in_instantly,instantly_lead_id.not.is.null,instantly_campaign_id.not.is.null'
      )
    case 'not_uploaded':
      return query
        .is('instantly_lead_id', null)
        .is('instantly_campaign_id', null)
        .neq('outbound_status', 'in_instantly')
        .neq('outbound_status', 'suppressed')
    case 'stale_sync':
    case 'stale-sync':
      return query.or('outbound_status.eq.stale_sync,outbound_status.eq.stale-sync')
    case 'needs_review':
    case 'needs-review':
      return query.or('outbound_status.eq.needs_review,outbound_status.eq.needs-review')
    case 'missing_context':
    case 'missing-context':
      return query.or('lead_context_status.is.null,lead_context_status.eq.')
    default:
      return query.eq('outbound_status', syncState)
  }
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, ' ').trim()
}

/** Escape a value for PostgREST `or=(col.ilike.VALUE)` grammar. */
function escapePostgrestOrValue(value: string): string {
  const cleaned = value.replace(/[%]/g, ' ').trim()
  // Quote when spaces / commas / parens would break the filter list.
  if (/[\s,()]/.test(cleaned) || cleaned.includes('.')) {
    return `"${cleaned.replace(/"/g, '')}"`
  }
  return cleaned
}

export function leadFiltersToSearchParams(filters: LeadListFilters, page?: number): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.vertical) params.set('vertical', filters.vertical)
  if (filters.source) params.set('source', filters.source)
  if (filters.outbound_status) params.set('outbound_status', filters.outbound_status)
  if (filters.sync_state) params.set('sync_state', filters.sync_state)
  if (filters.completeness && filters.completeness !== 'any') {
    params.set('completeness', filters.completeness)
  }
  if (filters.city) params.set('city', filters.city)
  if (filters.state) params.set('state', filters.state)
  if (filters.q) params.set('q', filters.q)
  if (filters.unverified_only) params.set('unverified_only', filters.unverified_only)
  if (filters.recontact_ok) params.set('recontact_ok', filters.recontact_ok)
  if (filters.suppressed) params.set('suppressed', filters.suppressed)
  if (filters.recontact_ready) params.set('recontact_ready', filters.recontact_ready)
  if (filters.pipeline_campaign_id) {
    params.set('pipeline_campaign_id', filters.pipeline_campaign_id)
  }
  if (filters.instantly_campaign_id) {
    params.set('instantly_campaign_id', filters.instantly_campaign_id)
  }
  if (filters.cohort_tag) params.set('cohort_tag', filters.cohort_tag)
  if (filters.enrich_status) params.set('enrich_status', filters.enrich_status)
  if (filters.icp_status) params.set('icp_status', filters.icp_status)
  if (filters.after_hours) params.set('after_hours', filters.after_hours)
  if (filters.email_origin) params.set('email_origin', filters.email_origin)
  if (filters.min_reviews) params.set('min_reviews', filters.min_reviews)
  if (filters.list_id) params.set('list_id', filters.list_id)
  if (filters.cohort_campaign_id) params.set('cohort_campaign_id', filters.cohort_campaign_id)
  if (filters.bucket === 'prospects') params.set('bucket', 'prospects')
  else if (filters.bucket === 'archived') params.set('bucket', 'archived')
  if (page && page > 1) params.set('page', String(page))
  return params
}

export function leadFiltersNeedExactCount(filters: LeadListFilters): boolean {
  return Boolean(
    filters.vertical ||
      filters.source ||
      filters.outbound_status ||
      filters.sync_state ||
      (filters.completeness && filters.completeness !== 'any') ||
      filters.city ||
      filters.state ||
      filters.q ||
      filters.unverified_only ||
      filters.recontact_ok ||
      filters.suppressed ||
      filters.recontact_ready ||
      filters.list_id ||
      filters.cohort_campaign_id ||
      filters.pipeline_campaign_id ||
      filters.instantly_campaign_id ||
      filters.cohort_tag ||
      filters.enrich_status ||
      filters.icp_status ||
      filters.after_hours ||
      filters.email_origin ||
      filters.min_reviews ||
      filters.bucket === 'prospects' ||
      filters.bucket === 'archived'
  )
}
