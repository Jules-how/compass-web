import { z } from 'zod'
import { CrmValidationError, CRM_REGIONS } from './crm-research-schema'

const csvEnum = (values: readonly string[]) => z.string().refine(v => v.split(',').every(x => values.includes(x)), 'Unsupported filter value')
export const crmFilterSchema = z.strictObject({
  q: z.string().max(200).optional(), region: csvEnum(CRM_REGIONS).optional(),
  customer_mix: csvEnum(['residential_only', 'mixed', 'commercial_only', 'unknown']).optional(),
  fit_status: z.enum(['eligible', 'research_needed', 'not_in_target']).optional(), established_status: z.enum(['supported', 'contradicted', 'unresolved']).optional(),
  system: z.enum(['ducted', 'multi_split', 'high_ticket']).optional(),
  min_reviews: z.coerce.number().int().min(0).max(10000000).optional(), min_rating: z.coerce.number().min(0).max(5).optional(), min_age: z.coerce.number().int().min(0).max(250).optional(),
  age_basis: z.enum(['operating_since', 'registered_since', 'claimed_tenure']).optional(),
  freshness: z.enum(['fresh', 'stale', 'unknown']).optional(), fresh_days: z.coerce.number().int().min(1).max(3650).optional(),
  missing_fact: z.enum(['customer_mix', 'installs_air_conditioning', 'installs_ducted', 'installs_multi_split', 'established_status', 'reviews', 'business_age']).optional(),
  origin: z.enum(['published_general', 'published_personal_work', 'provider_enriched', 'generated_hypothesis', 'legacy_unknown']).optional(),
  attribution: z.enum(['not_person_specific', 'unresolved', 'hypothesized', 'provider_asserted', 'supported', 'disputed', 'refuted']).optional(),
  mailbox: z.enum(['valid', 'invalid', 'catch_all', 'unknown', 'risky']).optional(), role: z.string().max(100).optional(),
  include_archived: z.enum(['true', 'false']).optional()
})
export const CRM_SORTS = ['name', 'review_count', 'review_rating', 'age_years', 'updated_at', 'research_observed_at'] as const
const companyQuerySchema = crmFilterSchema.extend({ sort: z.enum(CRM_SORTS).default('name'), direction: z.enum(['asc', 'desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(12000).optional() })
export type CrmCompanyFilters = z.infer<typeof crmFilterSchema>
export type CrmCompanyQuery = z.infer<typeof companyQuerySchema>
export function parseCrmCompanyQuery(params: URLSearchParams): CrmCompanyQuery {
  const result = companyQuerySchema.safeParse(Object.fromEntries(params))
  if (!result.success) throw new CrmValidationError(result.error.issues.map(x => ({ path: x.path.join('.'), message: x.message })))
  return result.data
}
export function crmQueryFilters(query: CrmCompanyQuery): CrmCompanyFilters {
  const { sort: _sort, direction: _direction, limit: _limit, cursor: _cursor, ...filters } = query
  return filters
}
export function queryFingerprint(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b))))
}
export type ResearchCursor = { v: 1; sort: string; direction: 'asc' | 'desc'; value: string | number | null; id: string; scope: string }
export function encodeResearchCursor(value: ResearchCursor): string { return Buffer.from(JSON.stringify(value)).toString('base64url') }
export function decodeResearchCursor(raw: string, expected: Pick<ResearchCursor, 'sort' | 'direction' | 'scope'>): ResearchCursor {
  try {
    const result = z.strictObject({ v: z.literal(1), sort: z.string(), direction: z.enum(['asc', 'desc']), value: z.union([z.string().max(2000), z.number(), z.null()]), id: z.string().min(1).max(160), scope: z.string().max(8000) }).parse(JSON.parse(Buffer.from(raw, 'base64url').toString()))
    if (result.sort !== expected.sort || result.direction !== expected.direction || result.scope !== expected.scope) throw new Error('scope')
    return result
  } catch { throw new CrmValidationError([{ path: 'cursor', message: 'Invalid cursor or changed query scope; restart from the first page' }]) }
}
export function cursorClause(cursor: ResearchCursor, column = cursor.sort): string {
  const quote = (value: string | number) => `"${String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`
  const cmp = cursor.direction === 'asc' ? 'gt' : 'lt'
  if (cursor.value === null) return `and(${column}.is.null,id.${cmp}.${quote(cursor.id)})`
  return `${column}.${cmp}.${quote(cursor.value)},and(${column}.eq.${quote(cursor.value)},id.${cmp}.${quote(cursor.id)}),${column}.is.null`
}
