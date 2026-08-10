/**
 * Lead list UX helpers: human labels, taxonomy, pipeline vs sync state,
 * and saved-segment shapes. Keeps operator-facing copy out of raw DB values.
 */

export const PIPELINE_STATUSES = [
  'uncontacted',
  'contacted',
  'replied',
  'interested',
  'not_interested',
  'suppressed',
  'booked',
  'converted'
] as const

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number]

/** Instantly / mirror sync states (orthogonal to pipeline stage). */
export const SYNC_STATES = [
  'in_instantly',
  'not_uploaded',
  'stale_sync',
  'needs_review',
  'missing_context'
] as const

export type SyncState = (typeof SYNC_STATES)[number]

export const COMPLETENESS_OPTIONS = [
  'any',
  'has_phone',
  'no_phone',
  'has_email',
  'no_email'
] as const

export type CompletenessFilter = (typeof COMPLETENESS_OPTIONS)[number]

/** Canonical vertical slugs used in filters + uploads. */
export const LEAD_VERTICALS = [
  'mortgage-brokers',
  'hvac',
  'electrician',
  'plumber',
  'broker',
  'recruitment',
  'trades',
  'agency',
  'other'
] as const

export const LEAD_SOURCES = [
  'prospeo',
  'origami',
  'vibe',
  'manual',
  'instantly',
  'csv',
  'sheets',
  'hubspot'
] as const

/**
 * Map canonical vertical → known DB spellings for filter matching.
 * Keep aliases exhaustive — historical uploads stored free-text Industry values.
 */
export const VERTICAL_ALIASES: Record<string, string[]> = {
  broker: ['broker', 'brokers', 'mortgage-brokers', 'mortgage_brokers', 'mortgage brokers'],
  'mortgage-brokers': [
    'mortgage-brokers',
    'mortgage_brokers',
    'mortgage brokers',
    'mortgage broker',
    'broker',
    'brokers'
  ],
  hvac: ['hvac', 'heating', 'cooling', 'heating and cooling', 'air conditioning'],
  electrician: ['electrician', 'electricians', 'electrical'],
  plumber: ['plumber', 'plumbers', 'plumbing'],
  recruitment: ['recruitment', 'recruiting', 'recruiters', 'recruiter'],
  trades: ['trades', 'trade', 'tradies', 'tradie'],
  agency: [
    'agency',
    'agencies',
    'marketing-agencies',
    'marketing_agencies',
    'marketing agencies',
    'marketing agency',
    'digital agency',
    'digital agencies'
  ],
  other: ['other']
}

/** Lowercase slug key used for alias lookup (spaces/underscores → hyphens). */
export function slugifyVerticalKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[&/]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Free-text / CSV Industry → canonical slug when we recognize it. */
const VERTICAL_CANONICAL_BY_ALIAS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const [canonical, aliases] of Object.entries(VERTICAL_ALIASES)) {
    map[canonical] = canonical
    for (const alias of aliases) {
      map[slugifyVerticalKey(alias)] = canonical
    }
  }
  // Extra display forms that show up in consolidated imports.
  map['marketing-agency'] = 'agency'
  map['real-estate'] = 'other'
  map['realestate'] = 'other'
  return map
})()

/**
 * Normalize a vertical for storage. Known aliases collapse to a canonical slug;
 * unknown values become a stable kebab-case slug so they are immediately filterable.
 */
export function normalizeVerticalSlug(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const key = slugifyVerticalKey(trimmed)
  if (!key) return null
  return VERTICAL_CANONICAL_BY_ALIAS[key] ?? key
}

const PIPELINE_LABELS: Record<string, string> = {
  uncontacted: 'Uncontacted',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  not_interested: 'Not interested',
  suppressed: 'Suppressed',
  booked: 'Booked',
  converted: 'Converted',
  in_instantly: 'Synced',
  not_uploaded: 'Not uploaded',
  stale_sync: 'Stale sync',
  'stale-sync': 'Stale sync',
  needs_review: 'Needs review',
  'needs-review': 'Needs review',
  missing_context: 'Missing context',
  'missing-context': 'Missing context'
}

const VERTICAL_LABELS: Record<string, string> = {
  'mortgage-brokers': 'Mortgage brokers',
  mortgage_brokers: 'Mortgage brokers',
  broker: 'Broker',
  hvac: 'HVAC',
  electrician: 'Electrician',
  plumber: 'Plumber',
  plumbers: 'Plumbers',
  plumbing: 'Plumbing',
  recruitment: 'Recruitment',
  trades: 'Trades',
  agency: 'Agency',
  agencies: 'Agencies',
  'marketing-agencies': 'Marketing agencies',
  other: 'Other'
}

const SYNC_LABELS: Record<SyncState, string> = {
  in_instantly: 'Synced',
  not_uploaded: 'Not uploaded',
  stale_sync: 'Stale sync',
  needs_review: 'Needs review',
  missing_context: 'Missing context'
}

const COMPLETENESS_LABELS: Record<CompletenessFilter, string> = {
  any: 'Any',
  has_phone: 'Has phone',
  no_phone: 'Missing phone',
  has_email: 'Has email',
  no_email: 'Missing email'
}

export function humanizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'Uncontacted'
  const key = raw.trim()
  return PIPELINE_LABELS[key] ?? titleCaseSlug(key)
}

export function humanizeVertical(raw: string | null | undefined): string {
  if (!raw) return '—'
  const key = raw.trim()
  const slug = slugifyVerticalKey(key)
  const canonical = normalizeVerticalSlug(key) ?? slug
  return (
    VERTICAL_LABELS[key] ??
    VERTICAL_LABELS[key.toLowerCase()] ??
    VERTICAL_LABELS[slug] ??
    VERTICAL_LABELS[canonical] ??
    titleCaseSlug(canonical || key)
  )
}

export function humanizeSyncState(state: SyncState): string {
  return SYNC_LABELS[state]
}

export function humanizeCompleteness(value: CompletenessFilter): string {
  return COMPLETENESS_LABELS[value]
}

/**
 * Expand a filter vertical into every DB value that should match.
 * Includes slug forms + spaced/underscored variants for historical free-text rows.
 */
export function verticalFilterValues(vertical: string): string[] {
  const trimmed = vertical.trim()
  if (!trimmed) return []
  const canonical = normalizeVerticalSlug(trimmed) ?? slugifyVerticalKey(trimmed)
  const aliases = VERTICAL_ALIASES[canonical] ?? [canonical, trimmed]
  const out = new Set<string>()
  for (const alias of aliases) {
    const a = alias.trim()
    if (!a) continue
    out.add(a)
    out.add(a.toLowerCase())
    const slug = slugifyVerticalKey(a)
    if (slug) {
      out.add(slug)
      out.add(slug.replace(/-/g, '_'))
      out.add(slug.replace(/-/g, ' '))
      out.add(titleCaseSlug(slug))
    }
  }
  // Always include the raw filter token + its slug.
  out.add(trimmed)
  out.add(trimmed.toLowerCase())
  if (canonical) out.add(canonical)
  return Array.from(out)
}

/** Merge canonical taxonomy with live DB facets (newest uploads appear immediately). */
export function mergeVerticalOptions(discovered: string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string) => {
    const slug = normalizeVerticalSlug(raw) ?? slugifyVerticalKey(raw)
    if (!slug || seen.has(slug)) return
    seen.add(slug)
    out.push(slug)
  }
  for (const v of LEAD_VERTICALS) push(v)
  for (const v of discovered ?? []) push(v)
  return out
}

export function outboundBadgeTone(
  status: string | null | undefined
): 'positive' | 'negative' | 'active' | 'sync' | 'neutral' {
  switch (status) {
    case 'interested':
    case 'replied':
    case 'booked':
    case 'converted':
      return 'positive'
    case 'not_interested':
    case 'suppressed':
      return 'negative'
    case 'contacted':
      return 'active'
    case 'in_instantly':
    case 'not_uploaded':
    case 'stale_sync':
    case 'stale-sync':
    case 'needs_review':
    case 'needs-review':
      return 'sync'
    default:
      return 'neutral'
  }
}

export function titleCaseSlug(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatLeadLocation(
  city: string | null | undefined,
  state: string | null | undefined
): string {
  const parts = [city?.trim(), state?.trim()].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

export function inferSyncState(lead: {
  outbound_status?: string | null
  instantly_lead_id?: string | null
  instantly_campaign_id?: string | null
  lead_context_status?: string | null
  suppression_reason?: string | null
  instantly_synced_at?: string | null
  mirrored_at?: string | null
}): SyncState | null {
  if (lead.suppression_reason || lead.outbound_status === 'suppressed') return null
  if (lead.outbound_status === 'needs_review' || lead.outbound_status === 'needs-review') {
    return 'needs_review'
  }
  if (!lead.lead_context_status) return 'missing_context'
  if (lead.outbound_status === 'stale_sync' || lead.outbound_status === 'stale-sync') {
    return 'stale_sync'
  }
  if (lead.instantly_lead_id || lead.instantly_campaign_id || lead.outbound_status === 'in_instantly') {
    if (isStaleSync(lead.instantly_synced_at, lead.mirrored_at)) return 'stale_sync'
    return 'in_instantly'
  }
  return 'not_uploaded'
}

function isStaleSync(
  syncedAt: string | null | undefined,
  mirroredAt: string | null | undefined
): boolean {
  const ref = syncedAt || mirroredAt
  if (!ref) return false
  const t = Date.parse(ref)
  if (Number.isNaN(t)) return false
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return Date.now() - t > sevenDays
}

export interface LeadSegmentFilters {
  vertical?: string
  source?: string
  outbound_status?: string
  sync_state?: string
  completeness?: CompletenessFilter
  city?: string
  q?: string
  recontact_ok?: '1' | '0'
  suppressed?: '1' | '0'
  recontact_ready?: '1' | '0'
}

export interface SavedLeadSegment {
  id: string
  name: string
  filters: LeadSegmentFilters
  createdAt: string
}

export const LEAD_SEGMENTS_STORAGE_KEY = 'compass.leadSegments.v1'

export const PRESET_SEGMENTS: Array<{ name: string; filters: LeadSegmentFilters }> = [
  {
    name: 'Never contacted',
    filters: { outbound_status: 'uncontacted' }
  },
  {
    name: 'Synced',
    filters: { sync_state: 'in_instantly' }
  },
  {
    name: 'Missing phone',
    filters: { completeness: 'no_phone' }
  },
  {
    name: 'Replied / interested',
    filters: { outbound_status: 'replied_or_interested' }
  },
  {
    name: 'Suppressed',
    filters: { suppressed: '1' }
  },
  {
    name: 'Ready to upload',
    filters: { sync_state: 'not_uploaded', completeness: 'has_email' }
  },
  {
    name: 'Ready to recontact (90d+)',
    filters: { recontact_ready: '1' }
  }
]

export interface LeadSummaryCounts {
  total: number
  filtered: number
  uncontacted: number
  in_instantly: number
  replied: number
  interested: number
  suppressed: number
  no_phone: number
  no_email: number
  needs_review: number
  recontact_ready: number
}
