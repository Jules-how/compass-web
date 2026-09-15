import { z } from 'zod'

export const CRM_RESEARCH_VERSION = 'crm.research.v1'
export const CRM_BODY_LIMIT = 1024 * 1024
export const CRM_REGIONS = ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide'] as const
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_:.-]+$/)
const optionalId = id.nullable().default(null)
const text = z.string().trim().min(1).max(500)
const nullableText = z.string().trim().max(2000).nullable().default(null)
const time = z.iso.datetime({ offset: true }).refine(v => Date.parse(v) <= Date.now() + 60000, 'Date is in the future')
const optionalTime = time.nullable().default(null)
const url = z.url().refine(v => ['https:', 'http:'].includes(new URL(v).protocol) && !new URL(v).username && !new URL(v).password, 'Public HTTP URL required')
const optionalUrl = url.nullable().default(null)

export const crmRecordSchemas = {
  source: z.strictObject({ id, source_type: z.enum(['official_site', 'directory', 'business_register', 'provider', 'operator_report', 'legacy_import', 'generator']), url: optionalUrl, provider: nullableText, external_id: nullableText, retrieved_at: optionalTime, published_at: optionalTime, content_hash: nullableText, artifact_ref: nullableText, note: z.string().max(4000).default('') }),
  company: z.strictObject({ id, name: text, legal_name: nullableText, country: z.string().regex(/^[A-Z]{2}$/).default('AU'), website: optionalUrl, domains: z.array(z.string().regex(/^[a-z0-9.-]+$/).max(253)).max(30).default([]), identity_status: z.enum(['unreviewed', 'reviewed', 'disputed']).default('unreviewed'), parent_company_id: optionalId, parent_relation: z.enum(['owned_by', 'franchise_of']).nullable().default(null), identifiers: z.array(z.strictObject({ kind: z.enum(['abn', 'acn', 'provider']), value: text, source_id: id })).max(20).default([]), is_archived: z.boolean().default(false) }),
  location: z.strictObject({ id, company_id: id, label: text, kind: z.enum(['premises', 'service_area']), address: nullableText, city: nullableText, state: z.enum(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']).nullable().default(null), regions: z.array(z.enum(CRM_REGIONS)).max(5).default([]), source_id: id, observed_at: optionalTime, status: z.enum(['active', 'closed', 'unknown']).default('unknown') }),
  person: z.strictObject({ id, name: text, profile_url: optionalUrl, source_id: id, identity_status: z.enum(['unreviewed', 'reviewed', 'disputed']).default('unreviewed') }),
  affiliation: z.strictObject({ id, company_id: id, person_id: id, location_id: optionalId, role: text, state: z.enum(['current', 'former', 'unknown']).default('unknown'), source_id: id, observed_at: optionalTime, decision_maker_basis: z.string().max(2000).default('') }),
  method: z.strictObject({ id, method_type: z.enum(['email', 'phone', 'linkedin', 'contact_form']), value: text, normalized_value: text, normalization_version: z.literal(1).default(1) }),
  candidate: z.strictObject({ id, company_id: id, method_id: id, affiliation_id: optionalId, location_id: optionalId, purpose: z.enum(['general', 'personal_work', 'department', 'unknown']).default('unknown'), first_origin: z.enum(['published_general', 'published_personal_work', 'provider_enriched', 'generated_hypothesis', 'legacy_unknown']), state: z.enum(['retained', 'unresolved', 'rejected']).default('unresolved'), reason: z.string().max(2000).default(''), generation: z.strictObject({ generator_version: text, format_ids: z.array(text).min(1).max(20), name_tokens: z.array(text).min(1).max(10), domain: text }).nullable().default(null) }),
  observation: z.strictObject({ id, company_id: optionalId, location_id: optionalId, person_id: optionalId, affiliation_id: optionalId, candidate_id: optionalId, fact_key: text, value: z.json(), source_id: id, quote: z.string().max(10000).default(''), locator: z.string().max(2000).default(''), observed_at: optionalTime, effective_date: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).nullable().default(null), evidence_type: z.enum(['published', 'provider_assertion', 'operator_report', 'inference', 'legacy_import', 'generation']), review_status: z.enum(['pending', 'reviewed', 'rejected']).default('pending'), rationale: z.string().max(4000).default(''), researcher: z.string().max(200).default(''), model: z.string().max(200).default(''), extraction_version: z.string().max(200).default(''), basis_ids: z.array(id).max(30).default([]), supersedes_ids: z.array(id).max(30).default([]) }),
  verification: z.strictObject({ id, method_id: id, provider: text, provider_request_id: nullableText, provider_result_id: nullableText, cache_key: nullableText, submitted_address: text, checked_at: optionalTime, received_at: optionalTime, attempt_state: z.enum(['completed', 'failed', 'timed_out', 'pending']), mailbox_result: z.enum(['valid', 'invalid', 'catch_all', 'unknown', 'risky']).nullable().default(null), raw_status: z.string().max(500).default(''), reason: z.string().max(4000).default(''), artifact_ref: nullableText, source_id: optionalId, legacy_import: z.boolean().default(false) }),
  lead_link: z.strictObject({ id, lead_id: id, company_id: id, affiliation_id: optionalId, location_id: optionalId, primary_email_candidate_id: optionalId, primary_phone_candidate_id: optionalId, match_state: z.enum(['proposed', 'confirmed', 'rejected']), reason: text, source_id: id, expected_lead_updated_at: optionalTime }),
  legacy_company_link: z.strictObject({ id, outbound_company_id: id, company_id: id, match_state: z.enum(['proposed', 'confirmed', 'rejected']), reason: text, source_id: id })
} as const

export type CrmRecordKind = keyof typeof crmRecordSchemas
export type CrmRecord = { [K in CrmRecordKind]: z.infer<(typeof crmRecordSchemas)[K]> }[CrmRecordKind]
export type CrmOperation = { kind: CrmRecordKind; expected_revision: number; record: CrmRecord }
export type CrmCommand = { schema_version: typeof CRM_RESEARCH_VERSION; request_id: string; source: string; operations: CrmOperation[] }
export type CrmStoredRecord = Record<string, unknown> & { id: string; revision: number }
export class CrmValidationError extends Error {
  constructor(public issues: Array<{ path: string; message: string }>) { super(issues.map(x => `${x.path}: ${x.message}`).join('; ')); this.name = 'CrmValidationError' }
}

export function normalizeCrmMethod(kind: string, value: string): string {
  const trimmed = value.trim()
  if (kind === 'email') return trimmed.toLowerCase()
  if (kind === 'phone') return trimmed.replace(/[\s().-]/g, '')
  const parsed = new URL(trimmed)
  parsed.hash = ''
  return parsed.toString()
}

const companyFacts: Record<string, z.ZodType> = {
  operating_status: z.enum(['active', 'closed', 'unknown']), customer_mix: z.enum(['residential_only', 'mixed', 'commercial_only', 'unknown']),
  installs_air_conditioning: z.boolean(), installs_ducted: z.boolean(), installs_multi_split: z.boolean(), installs_single_split: z.boolean(),
  established_status: z.enum(['supported', 'contradicted', 'unresolved']),
  business_age: z.strictObject({ year: z.number().int().min(1800).max(new Date().getFullYear()), basis: z.enum(['operating_since', 'registered_since', 'claimed_tenure']), precision: z.enum(['year', 'lower_bound']) }),
  reviews: z.strictObject({ count: z.number().int().min(0).max(10000000), rating: z.number().min(0).max(5).nullable(), profile_id: text, platform: text, scope: text }),
  team: z.strictObject({ minimum: z.number().int().nonnegative().nullable(), maximum: z.number().int().nonnegative().nullable(), basis: text }),
  quote_routes: z.array(text).max(20), commercial_signals: z.array(text).max(30),
  revenue: z.strictObject({ amount: z.number().nonnegative(), currency: z.string().length(3), period: text }),
  capacity: z.strictObject({ value: text, period: text }), note: z.string().min(1).max(4000)
}
const contactFacts: Record<string, z.ZodType> = {
  contact_origin: z.enum(['published_general', 'published_personal_work', 'provider_enriched', 'generated_hypothesis', 'legacy_unknown']),
  person_attribution: z.enum(['not_person_specific', 'unresolved', 'hypothesized', 'provider_asserted', 'supported', 'disputed', 'refuted']),
  note: companyFacts.note
}

export function parseCrmCommand(input: unknown): CrmCommand {
  const envelope = z.strictObject({ schema_version: z.literal(CRM_RESEARCH_VERSION), request_id: id, source: text, operations: z.array(z.strictObject({ kind: z.enum(Object.keys(crmRecordSchemas) as [CrmRecordKind, ...CrmRecordKind[]]), expected_revision: z.number().int().nonnegative(), record: z.unknown() })).min(1).max(100) }).safeParse(input)
  if (!envelope.success) throw new CrmValidationError(envelope.error.issues.map(x => ({ path: x.path.join('.'), message: x.message })))
  const issues: CrmValidationError['issues'] = []
  const operations: CrmOperation[] = []
  const seen = new Set<string>()
  for (const [i, op] of envelope.data.operations.entries()) {
    const parsed = crmRecordSchemas[op.kind].safeParse(op.record)
    const fail = (key: string, message: string) => issues.push({ path: `operations.${i}.record.${key}`, message })
    if (!parsed.success) { for (const issue of parsed.error.issues) fail(issue.path.join('.'), issue.message); continue }
    const r = parsed.data as unknown as Record<string, unknown>
    const key = `${op.kind}:${r.id}`
    if (seen.has(key)) fail('id', 'One operation per record per command')
    seen.add(key)
    if (op.kind === 'company' && Boolean(r.parent_company_id) !== Boolean(r.parent_relation)) fail('parent_relation', 'Parent and relation must be supplied together')
    if (op.kind === 'method') {
      const v = String(r.value)
      if (r.method_type === 'email' && !z.email().safeParse(v).success) fail('value', 'Invalid email')
      if (r.method_type === 'phone' && !/^\+?[0-9\s().-]{6,30}$/.test(v)) fail('value', 'Invalid phone')
      try { r.normalized_value = normalizeCrmMethod(String(r.method_type), v) } catch { fail('value', 'Invalid route URL') }
      if (['linkedin', 'contact_form'].includes(String(r.method_type)) && !url.safeParse(v).success) fail('value', 'HTTP URL required')
    }
    if (op.kind === 'candidate') {
      if (r.first_origin === 'generated_hypothesis' && (!r.generation || !r.affiliation_id)) fail('generation', 'Generated candidates require named affiliation and generation inputs')
      if (r.first_origin !== 'generated_hypothesis' && r.generation) fail('generation', 'Generation inputs require generated origin')
      if (r.first_origin === 'published_personal_work' && !r.affiliation_id) fail('affiliation_id', 'Personal address requires an affiliation')
    }
    if (op.kind === 'observation') {
      const subjects = ['company_id', 'location_id', 'person_id', 'affiliation_id', 'candidate_id'].filter(k => r[k])
      if (subjects.length !== 1) fail('company_id', 'Exactly one observation subject is required')
      const factSchema = (r.candidate_id ? contactFacts : r.company_id ? companyFacts : { note: companyFacts.note })[String(r.fact_key)]
      if (!factSchema) fail('fact_key', 'Unsupported fact for this subject')
      else { const value = factSchema.safeParse(r.value); if (!value.success) fail('value', value.error.issues.map(x => x.message).join('; ')) }
      if (r.company_id && r.fact_key !== 'note' && (r.evidence_type === 'generation' || (r.evidence_type === 'legacy_import' && r.review_status === 'reviewed'))) fail('evidence_type', 'Generated or unreviewed legacy material cannot establish company facts')
      if (['revenue','capacity'].includes(String(r.fact_key)) && ['inference','generation'].includes(String(r.evidence_type))) fail('evidence_type', 'Revenue and capacity require directly reported evidence, not an estimate')
      if (r.fact_key === 'contact_origin') {
        const required = ({ published_general:'published', published_personal_work:'published', provider_enriched:'provider_assertion', generated_hypothesis:'generation', legacy_unknown:'legacy_import' } as Record<string,string>)[String(r.value)]
        if (r.evidence_type !== required) fail('evidence_type', 'Origin must match its published, provider, generated or legacy evidence')
      }
      if (r.evidence_type !== 'legacy_import' && r.evidence_type !== 'generation' && (!r.observed_at || (!r.quote && !r.locator))) fail('quote', 'New research requires observation date and exact quote or locator')
      if (r.evidence_type === 'inference' && (!(r.basis_ids as string[]).length || !r.rationale)) fail('basis_ids', 'Inference requires evidence and rationale')
      if (r.fact_key === 'established_status' && r.value === 'supported' && (!(r.basis_ids as string[]).length || !r.rationale)) fail('basis_ids', 'Established assessment requires explicit evidence and rationale')
      if (r.fact_key === 'person_attribution' && r.value === 'supported' && r.evidence_type !== 'published' && !r.rationale) fail('rationale', 'Reviewed personal attribution requires explicit rationale')
      if (r.fact_key === 'person_attribution' && r.value === 'supported' && ['provider_assertion', 'generation', 'legacy_import'].includes(String(r.evidence_type))) fail('value', 'Provider, generated and legacy assertions cannot establish personal ownership')
    }
    if (op.kind === 'verification') {
      if (r.attempt_state === 'completed' && !r.mailbox_result) fail('mailbox_result', 'Completed check needs a result')
      if (r.attempt_state !== 'completed' && r.mailbox_result) fail('mailbox_result', 'Incomplete attempts have no mailbox result')
      if (!r.legacy_import && (!r.checked_at || !r.provider_request_id)) fail('checked_at', 'New checks require a date and provider request ID')
      r.submitted_address = String(r.submitted_address).trim().toLowerCase()
    }
    operations.push({ kind: op.kind, expected_revision: op.expected_revision, record: r as CrmRecord })
  }
  if (issues.length) throw new CrmValidationError(issues)
  return { ...envelope.data, operations }
}

export function crmFactLabel(key: string): string { return key.replaceAll('_', ' ') }
export type CrmFact = { value: unknown; state: 'supported' | 'disputed'; observed_at: string | null; evidence_ids: string[] }
export type CrmCompanyProfile = { id: string; revision: number; name: string; website: string | null; country: string; identity_status: string; facts: Record<string, CrmFact>; regions: string[]; fit_status: string; people_count: number; candidate_count: number; review_count: number | null; review_rating: number | null; age_years: number | null; research_observed_at: string | null; updated_at: string }
