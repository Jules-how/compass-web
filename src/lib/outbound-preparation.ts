import { createHash } from 'node:crypto'
import { compileStepBody, type OutboundSequence } from './outbound-copy'

export const PREPARATION_SCHEMA = 'outbound.preparation.v1'
export const MAX_BATCH = 200
export const REQUIRED_EVIDENCE = [
  'service',
  'service_area',
  'residential',
  'quote_journey',
  'independent',
  'email'
] as const
export type Evidence = {
  kind: string
  value: string
  quote: string
  url: string
  observed_at: string
}
export type Candidate = {
  id: string
  company_id: string
  lead_id: string | null
  company: string
  website: string
  email: string
  evidence: Evidence[]
  identity_reviewed: boolean
  hold_reason?: string
  exclude_reason?: string
  contact_basis?: {
    kind: string
    rationale: string
    url: string
    checked_at: string
  }
  verification?: { status: string; provider: string; checked_at: string }
}
export type Recipe = { subject: string; opener: string }
export type Settings = {
  timezone: string
  email_list: string[]
  from: string
  to: string
  daily_limit: number
}
export type Context = {
  campaign_id: string
  offer: Record<string, unknown>
  vertical: string
  city: string
  sequence: OutboundSequence
  recipe: Recipe
  settings: Settings
}
export type LedgerRow = {
  id: string
  email: string | null
  company: string | null
  company_domain?: string | null
  outbound_status?: string | null
  suppression_reason?: string | null
  recontact_ok?: boolean | number | null
  is_archived?: boolean | number | null
  icp_status?: string | null
  pipeline_campaign_id?: string | null
}
export type Rendered = {
  candidate_id: string
  values: Record<string, string>
  steps: Array<{ subject: string; body: string }>
}
export type Assessed = {
  candidate: Candidate
  status: 'pass' | 'hold' | 'exclude'
  reasons: string[]
  rendered: Rendered | null
}
export type Bundle = {
  schema_version: string
  context: Context
  input_hash: string
  records: Assessed[]
  counts: { total: number; pass: number; hold: number; exclude: number }
  hash: string
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ':' +
            canonical((value as Record<string, unknown>)[key])
        )
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
export function emailKey(value: unknown): string {
  return text(value).toLowerCase()
}
export function validUrl(value: unknown): boolean {
  try {
    const u = new URL(text(value))
    return (
      ['https:', 'http:'].includes(u.protocol) &&
      !!u.hostname &&
      !u.username &&
      !u.password
    )
  } catch {
    return false
  }
}
export function domainKey(value: unknown): string {
  try {
    return new URL(text(value)).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}
export function companyKey(
  row: { company: string; website: string },
  city: string
): string {
  const domain = domainKey(row.website)
  return domain
    ? 'domain:' + domain
    : 'name:' +
        text(row.company)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ') +
        ':' +
        city.toLowerCase()
}
export function validTime(value: unknown): boolean {
  const n = Date.parse(text(value))
  return Number.isFinite(n) && n <= Date.now() + 60000
}
export function evidenceValid(e: Evidence): boolean {
  return (
    !!text(e.value) &&
    !!text(e.quote) &&
    validUrl(e.url) &&
    validTime(e.observed_at) &&
    e.quote.toLowerCase().includes(e.value.toLowerCase())
  )
}
export function evidenceValue(row: Candidate, kind: string): string {
  const facts = row.evidence.filter((e) => e.kind === kind)
  if (facts.some((e) => !evidenceValid(e))) return ''
  const values = [...new Set(facts.map((e) => text(e.value)))]
  return values.length === 1 ? values[0] : ''
}
export function ledgerBlock(
  row: LedgerRow | undefined,
  campaignId: string
): string[] {
  if (!row) return ['not_in_lead_ledger']
  const reasons: string[] = []
  if (row.is_archived) reasons.push('archived')
  if (
    row.suppression_reason ||
    row.recontact_ok === false ||
    row.recontact_ok === 0
  )
    reasons.push('suppressed')
  if (row.outbound_status !== 'uncontacted') reasons.push('previous_outreach')
  if (row.icp_status === 'skip') reasons.push('icp_excluded')
  if (row.pipeline_campaign_id && row.pipeline_campaign_id !== campaignId)
    reasons.push('different_campaign')
  return reasons
}
export function assessCandidate(
  row: Candidate,
  context: Context,
  ledger: LedgerRow[]
): string[] {
  const reasons: string[] = []
  if (!row.company.trim()) reasons.push('missing_company')
  if (!validUrl(row.website)) reasons.push('company_website_required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    reasons.push('missing_or_invalid_email')
  if (!row.identity_reviewed) reasons.push('identity_review_required')
  for (const kind of REQUIRED_EVIDENCE) {
    if (!evidenceValue(row, kind))
      reasons.push('evidence_missing_or_contradictory:' + kind)
  }
  if (emailKey(evidenceValue(row, 'email')) !== emailKey(row.email))
    reasons.push('email_not_published')
  if (!/ducted/i.test(evidenceValue(row, 'service')))
    reasons.push('ducted_service_unconfirmed')
  if (!/sydney/i.test(evidenceValue(row, 'service_area')))
    reasons.push('sydney_service_area_unconfirmed')
  const basis = row.contact_basis
  if (
    !basis ||
    !['express', 'published_role_relevant', 'existing_relationship'].includes(
      basis.kind
    ) ||
    !text(basis.rationale) ||
    !validUrl(basis.url) ||
    !validTime(basis.checked_at)
  )
    reasons.push('contact_basis_required')
  const check = row.verification
  if (!check || !text(check.provider) || !validTime(check.checked_at))
    reasons.push('verification_pending')
  else if (
    !['valid', 'ok', 'catch_all', 'unknown', 'risky', 'error'].includes(
      check.status
    )
  )
    reasons.push('verification_ineligible')
  const own = ledger.find(
    (l) => l.id === row.lead_id && emailKey(l.email) === emailKey(row.email)
  )
  reasons.push(...ledgerBlock(own, context.campaign_id))
  const domain = domainKey(row.website)
  if (
    own &&
    (text(own.company).toLowerCase() !== row.company.toLowerCase() ||
      (own.company_domain &&
        own.company_domain.toLowerCase().replace(/^www\./, '') !== domain))
  )
    reasons.push('ledger_identity_mismatch')
  for (const other of ledger) {
    if (other.id === own?.id) continue
    if (
      emailKey(other.email) === emailKey(row.email) ||
      (domain &&
        other.company_domain?.toLowerCase().replace(/^www\./, '') === domain)
    ) {
      if (
        ledgerBlock(other, context.campaign_id).length ||
        other.id !== row.lead_id
      )
        reasons.push('company_or_inbox_overlap:' + other.id)
    }
  }
  if (row.hold_reason) reasons.push(row.hold_reason)
  return [...new Set(reasons)]
}
export function contextErrors(ctx: Context): string[] {
  const errors: string[] = []
  if (
    ctx.offer.offer_key !== 'installation-booking' ||
    ctx.offer.archived ||
    !['testing', 'live'].includes(text(ctx.offer.gtm_status))
  )
    errors.push('active_installation_offer_required')
  if (ctx.vertical !== 'hvac' || ctx.city.toLowerCase() !== 'sydney')
    errors.push('sydney_hvac_cell_required')
  const relevance = (ctx.offer.lock as { relevance?: unknown[] })?.relevance
  if (!Array.isArray(relevance) || !relevance.length)
    errors.push('targeting_contract_required')
  const steps = Array.isArray(ctx.sequence?.steps) ? ctx.sequence.steps : []
  if (steps.length !== 2) errors.push('email_plus_followup_required')
  if (
    !text(ctx.recipe?.subject) ||
    !text(ctx.recipe?.opener).startsWith('Saw ')
  )
    errors.push('opener_recipe_required')
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (
    ctx.settings?.timezone !== 'Australia/Sydney' ||
    !Array.isArray(ctx.settings.email_list) ||
    !ctx.settings.email_list.length ||
    !Number.isInteger(ctx.settings.daily_limit) ||
    ctx.settings.daily_limit < 1 ||
    !time.test(ctx.settings.from) ||
    !time.test(ctx.settings.to) ||
    ctx.settings.from >= ctx.settings.to
  )
    errors.push('review_send_settings')
  for (const [index, step] of steps.entries()) {
    if (
      !step ||
      typeof step.subject !== 'string' ||
      !Array.isArray(step.slots) ||
      step.slots.some(
        (s) => !s || typeof s.body !== 'string' || (s.required && !text(s.body))
      )
    ) {
      errors.push('required_sequence_slot:' + index)
      continue
    }
    const body = compileStepBody(step, { includeCompliance: true })
    if (!body.trim()) errors.push('empty_email:' + index)
    if (index === 0 && !body.trim().startsWith('{{personalization}}'))
      errors.push('personalization_first')
    if (
      !/<a\s+[^>]*href=["']\{\{unsubscribe\}\}["'][^>]*>\s*Unsubscribe\s*<\/a>/i.test(
        body
      )
    )
      errors.push('unsubscribe_required:' + index)
    if (
      index > 0 &&
      (!Number.isFinite(step.delay_days) || Number(step.delay_days) < 2)
    )
      errors.push('two_day_gap_required')
  }
  return errors
}
// Independent boundary validation of the worker's deterministic substitutions.
// The UI displays persisted worker output; it never generates another opener.
export function substitute(
  body: string,
  values: Record<string, string>,
  double = true
): string {
  const pattern = double ? /\{\{\s*(\w+)\s*\}\}/g : /\{(\w+)\}/g
  const result = body.replace(pattern, (_token, key: string) => {
    if (
      !Object.prototype.hasOwnProperty.call(values, key) ||
      !values[key]?.trim()
    )
      throw new Error('blank_or_unknown_variable:' + key)
    return values[key]
  })
  if (/[{}]/.test(result)) throw new Error('unsupported_template_syntax')
  if (/\b(?:Hi|Hey|Hello)\s*[,!]/i.test(result))
    throw new Error('blank_greeting')
  return result
}
export function expectedValues(
  candidate: Candidate,
  recipe: Recipe
): Record<string, string> {
  const facts = {
    company: candidate.company,
    service: evidenceValue(candidate, 'service'),
    service_area: evidenceValue(candidate, 'service_area')
  }
  const firstName =
    evidenceValue(candidate, 'person_name').split(/\s+/)[0] || ''
  let opener = substitute(recipe.opener, facts, false)
  if (firstName)
    opener =
      'Hi ' +
      firstName +
      ', ' +
      opener.charAt(0).toLowerCase() +
      opener.slice(1)
  return {
    email: emailKey(candidate.email),
    first_name: firstName,
    firstName,
    company_name: candidate.company,
    companyName: candidate.company,
    companyShort: candidate.company,
    service: facts.service,
    suburb: facts.service_area,
    city: 'Sydney',
    subject: substitute(recipe.subject, facts, false).toLowerCase(),
    opener,
    Opener: opener,
    personalization: opener
  }
}
export function validateWorkerRender(
  candidate: Candidate,
  ctx: Context,
  rendered: Rendered
): void {
  const expected = expectedValues(candidate, ctx.recipe)
  if (
    canonical(rendered.values) !== canonical(expected) ||
    rendered.candidate_id !== candidate.id
  )
    throw new Error('worker_values_mismatch')
  const values = { ...expected, unsubscribe: '[Unsubscribe]' }
  const steps = ctx.sequence.steps.map((step, i) => ({
    subject: substitute(step.subject, values),
    body: substitute(compileStepBody(step, { includeCompliance: true }), values)
  }))
  if (canonical(steps) !== canonical(rendered.steps))
    throw new Error('worker_render_mismatch')
}
export function prepareBundle(
  context: Context,
  candidates: Candidate[],
  ledger: LedgerRow[],
  outputs: Rendered[]
): Bundle {
  const errs = contextErrors(context)
  if (errs.length) throw new Error(errs.join('; '))
  if (
    !candidates.length ||
    candidates.length > MAX_BATCH ||
    new Set(candidates.map((c) => c.id)).size !== candidates.length
  )
    throw new Error('invalid_candidate_set')
  const seenCompany = new Set<string>()
  const seenEmail = new Set<string>()
  if (
    !Array.isArray(outputs) ||
    outputs.some((o) => !o || typeof o.candidate_id !== 'string') ||
    new Set(outputs.map((o) => o.candidate_id)).size !== outputs.length ||
    outputs.some((o) => !candidates.some((c) => c.id === o.candidate_id))
  )
    throw new Error('invalid_render_set')
  const records: Assessed[] = candidates.map((candidate) => {
    if (candidate.exclude_reason)
      return {
        candidate,
        status: 'exclude',
        reasons: [candidate.exclude_reason],
        rendered: null
      }
    const reasons = assessCandidate(candidate, context, ledger)
    const output = outputs.find((o) => o.candidate_id === candidate.id)
    if (
      seenCompany.has(candidate.company_id) ||
      seenEmail.has(emailKey(candidate.email))
    )
      reasons.push('duplicate_company_or_inbox')
    if (!reasons.length) {
      if (!output) reasons.push('render_missing')
      else
        try {
          validateWorkerRender(candidate, context, output)
        } catch (err) {
          reasons.push(err instanceof Error ? err.message : 'render_invalid')
        }
    }
    if (reasons.length)
      return { candidate, status: 'hold', reasons, rendered: null }
    seenCompany.add(candidate.company_id)
    seenEmail.add(emailKey(candidate.email))
    return { candidate, status: 'pass', reasons: [], rendered: output! }
  })
  const base = {
    schema_version: PREPARATION_SCHEMA,
    context,
    input_hash: digest(candidates),
    records,
    counts: {
      total: records.length,
      pass: records.filter((r) => r.status === 'pass').length,
      hold: records.filter((r) => r.status === 'hold').length,
      exclude: records.filter((r) => r.status === 'exclude').length
    }
  }
  return { ...base, hash: digest(base) }
}
export function transportCsv(bundle: Bundle): string {
  const rows = bundle.records
    .filter((r) => r.status === 'pass')
    .map((r) => r.rendered!.values)
  if (!rows.length) throw new Error('no_eligible_recipients')
  const keys = Object.keys(rows[0])
  const cell = (s: string) => '"' + s.replaceAll('"', '""') + '"'
  return (
    [
      keys.map(cell).join(','),
      ...rows.map((row) => keys.map((k) => cell(row[k])).join(','))
    ].join('\r\n') + '\r\n'
  )
}
export function instantlyExpected(bundle: Bundle) {
  return {
    sequences: [
      {
        steps: bundle.context.sequence.steps.map((step, i) => ({
          type: 'email',
          delay:
            i === bundle.context.sequence.steps.length - 1
              ? 0
              : bundle.context.sequence.steps[i + 1].delay_days,
          variants: [
            {
              subject: step.subject,
              body: compileStepBody(step, { includeCompliance: true })
            }
          ]
        }))
      }
    ],
    text_only: true,
    open_tracking: false,
    link_tracking: false,
    stop_on_reply: true,
    insert_unsubscribe_header: true,
    daily_limit: bundle.context.settings.daily_limit,
    email_list: bundle.context.settings.email_list
  }
}
export type PlatformLead = {
  id: string
  email: string
  first_name?: string
  company_name?: string
  personalization?: string
  custom_variables?: Record<string, unknown>
  payload?: Record<string, unknown>
}
export function reconcileRecipients(bundle: Bundle, actual: PlatformLead[]) {
  const expected = bundle.records.filter((r) => r.status === 'pass')
  const receipts = expected.map((record) => {
    const email = emailKey(record.candidate.email)
    const matches = actual.filter((l) => emailKey(l.email) === email)
    if (matches.length !== 1 || !matches[0].id)
      return {
        candidate_id: record.candidate.id,
        lead_id: record.candidate.lead_id,
        email,
        status: matches.length ? 'conflict' : 'missing',
        provider_id: null
      }
    const found = matches[0]
    const custom = {
      ...(found.payload ?? {}),
      ...(found.custom_variables ?? {})
    }
    const values = record.rendered!.values
    const mismatches = Object.entries(values).filter(([key, value]) => {
      const observed =
        key === 'email'
          ? email
          : key === 'first_name'
            ? text(found.first_name)
            : key === 'firstName'
              ? Object.hasOwn(custom, key)
                ? text(custom[key])
                : text(found.first_name)
              : key === 'company_name'
                ? text(found.company_name)
                : key === 'companyName'
                  ? Object.hasOwn(custom, key)
                    ? text(custom[key])
                    : text(found.company_name)
                  : key === 'personalization'
                    ? text(found.personalization) ||
                      text(custom.personalization)
                    : text(custom[key])
      return observed !== value
    })
    return {
      candidate_id: record.candidate.id,
      lead_id: record.candidate.lead_id,
      email,
      status: mismatches.length ? 'variables_mismatch' : 'confirmed',
      provider_id: found.id
    }
  })
  const extras = actual
    .filter(
      (l) =>
        !expected.some((r) => emailKey(r.candidate.email) === emailKey(l.email))
    )
    .map((l) => emailKey(l.email))
  return {
    receipts,
    extras,
    complete:
      extras.length === 0 &&
      receipts.length > 0 &&
      receipts.every((r) => r.status === 'confirmed')
  }
}
