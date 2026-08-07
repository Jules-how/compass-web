import type { LeadListFilters } from '@/lib/types'
import { verticalFilterValues, type CompletenessFilter } from '@/lib/leads-meta'

/** Loose PostgREST query builder — matches supabase-js filter chain. */
export type LeadFilterQuery = {
  eq: (column: string, value: unknown) => LeadFilterQuery
  in: (column: string, values: readonly string[]) => LeadFilterQuery
  ilike: (column: string, pattern: string) => LeadFilterQuery
  or: (filters: string) => LeadFilterQuery
  is: (column: string, value: null) => LeadFilterQuery
  not: (column: string, operator: string, value: unknown) => LeadFilterQuery
  neq: (column: string, value: unknown) => LeadFilterQuery
}

export function parseLeadListFilters(searchParams: URLSearchParams): LeadListFilters {
  const completeness = searchParams.get('completeness') ?? undefined
  const recontact = searchParams.get('recontact_ok')
  const suppressed = searchParams.get('suppressed')
  return {
    vertical: emptyToUndef(searchParams.get('vertical')),
    source: emptyToUndef(searchParams.get('source')),
    outbound_status: emptyToUndef(searchParams.get('outbound_status')),
    sync_state: emptyToUndef(searchParams.get('sync_state')),
    completeness: isCompleteness(completeness) ? completeness : undefined,
    city: emptyToUndef(searchParams.get('city')),
    q: emptyToUndef(searchParams.get('q')),
    recontact_ok: recontact === '1' || recontact === '0' ? recontact : undefined,
    suppressed: suppressed === '1' || suppressed === '0' ? suppressed : undefined
  }
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

export function applyLeadFilters<T extends LeadFilterQuery>(query: T, filters: LeadListFilters): T {
  let q = query

  if (filters.vertical) {
    const values = verticalFilterValues(filters.vertical)
    q = (values.length === 1 ? q.eq('vertical', values[0]) : q.in('vertical', values)) as T
  }
  if (filters.source) q = q.eq('source', filters.source) as T
  if (filters.outbound_status) {
    // Pipeline filter: exact match on outbound_status.
    // Also accept replied|interested via multi for preset "hot" if needed later.
    if (filters.outbound_status === 'replied_or_interested') {
      q = q.in('outbound_status', ['replied', 'interested']) as T
    } else {
      q = q.eq('outbound_status', filters.outbound_status) as T
    }
  }
  if (filters.city) q = q.ilike('city', `%${escapeIlike(filters.city)}%`) as T

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

  return q
}

function applyCompleteness(query: LeadFilterQuery, completeness: CompletenessFilter): LeadFilterQuery {
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
  if (filters.q) params.set('q', filters.q)
  if (filters.recontact_ok) params.set('recontact_ok', filters.recontact_ok)
  if (filters.suppressed) params.set('suppressed', filters.suppressed)
  if (page && page > 1) params.set('page', String(page))
  return params
}
