import type { SupabaseClient } from '@supabase/supabase-js'
import { siteFromEmailOrUrl } from '@/lib/company-site'
import {
  cohortTagForRow,
  ingestSkipReason,
  isLeadSourceService,
  mapCsvRow,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
  type MappedLeadRow
} from '@/lib/lead-import-shared'
import { normalizeVerticalSlug } from '@/lib/leads-meta'

const COMMIT_MAX_ROWS = 200

export function mapCommitRow(raw: Record<string, unknown>): MappedLeadRow {
  const asStr = (value: unknown): string => (value == null ? '' : String(value).trim())
  const direct: MappedLeadRow = {
    name: asStr(raw.name),
    email: asStr(raw.email ?? raw.published_email),
    phone: asStr(raw.phone),
    company: asStr(raw.company),
    role: asStr(raw.role),
    linkedin: asStr(raw.linkedin),
    city: asStr(raw.city),
    state: asStr(raw.state),
    vertical: asStr(raw.vertical),
    website: asStr(raw.website ?? raw.company_domain),
    cluster: asStr(raw.cluster ?? raw.cohort_tag)
  }
  if (direct.email || direct.company || direct.name) return direct
  const strMap: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue
    strMap[key] = String(value)
  }
  return mapCsvRow(strMap)
}

export function decideLeadCommit(mapped: MappedLeadRow): { skip: string } | { ok: true } {
  const reason = ingestSkipReason(mapped)
  if (reason) return { skip: reason }
  return { ok: true }
}

function companyKey(company: string, city: string): string {
  return `${company.trim().toLowerCase()}|${city.trim().toLowerCase()}`
}

export type CommitLeadOptions = {
  rows: Record<string, unknown>[]
  vertical?: string | null
  sourceService?: string | null
  filename?: string | null
  importBatchId?: string | null
  preferFormVertical?: boolean
}

export type CommitLeadResult = {
  batchId: string
  rowCount: number
  imported: number
  dupes: number
  emailDupes: number
  companyDupes: number
  skipped: Array<{ row: number; reason: string }>
  errors: string[]
}

export async function commitLeadRows(
  supabase: SupabaseClient,
  opts: CommitLeadOptions
): Promise<CommitLeadResult> {
  const rows = Array.isArray(opts.rows) ? opts.rows : []
  if (rows.length > COMMIT_MAX_ROWS) {
    return {
      batchId: '',
      rowCount: rows.length,
      imported: 0,
      dupes: 0,
      emailDupes: 0,
      companyDupes: 0,
      skipped: [],
      errors: [`too many rows (max ${COMMIT_MAX_ROWS})`]
    }
  }

  const sourceServiceRaw = (opts.sourceService || 'other').trim()
  const sourceService = isLeadSourceService(sourceServiceRaw) ? sourceServiceRaw : 'other'
  const vertical =
    typeof opts.vertical === 'string' && opts.vertical.trim()
      ? normalizeVerticalSlug(opts.vertical)
      : null
  const filename = opts.filename ?? null
  const preferFormVertical = opts.preferFormVertical !== false
  const now = new Date().toISOString()
  const batchId = (opts.importBatchId || '').trim() || `batch-${crypto.randomUUID()}`
  const errors: string[] = []

  const { data: existingBatch, error: batchLookupError } = await supabase
    .from('lead_import_batches')
    .select('id')
    .eq('id', batchId)
    .maybeSingle()
  if (batchLookupError) errors.push(`batch lookup: ${batchLookupError.message}`)
  if (!existingBatch) {
    const { error: batchError } = await supabase.from('lead_import_batches').insert({
      id: batchId,
      source: 'csv',
      filename,
      sheet_url: null,
      row_count: rows.length,
      imported: 0,
      dupes: 0,
      created_at: now,
      mirrored_at: now
    })
    if (batchError) errors.push(`batch_create_failed: ${batchError.message}`)
  }

  const mappedRows = rows.map((row) => mapCommitRow(row))
  const emailsToCheck = Array.from(
    new Set(mappedRows.map((mapped) => normalizeEmail(mapped.email)).filter((email) => email.length > 0))
  )
  const existingByEmail = new Map<string, string>()
  for (let i = 0; i < emailsToCheck.length; i += 300) {
    const chunk = emailsToCheck.slice(i, i + 300)
    const { data, error } = await supabase.from('lead_contacts').select('id, email').in('email', chunk)
    if (error) {
      errors.push(`dedupe lookup: ${error.message}`)
      break
    }
    for (const row of data ?? []) {
      const norm = normalizeEmail(row.email ?? '')
      if (norm && !existingByEmail.has(norm)) existingByEmail.set(norm, row.id)
    }
  }

  const domainsToCheck = Array.from(
    new Set(
      mappedRows
        .map((mapped) =>
          siteFromEmailOrUrl({
            email: normalizeEmail(mapped.email),
            website: mapped.website
          }).company_domain
        )
        .filter((domain): domain is string => Boolean(domain))
    )
  )
  const companiesToCheck = Array.from(
    new Set(mappedRows.map((mapped) => mapped.company.trim()).filter((company) => company.length > 2))
  )

  const existingByDomain = new Map<string, string>()
  for (let i = 0; i < domainsToCheck.length; i += 300) {
    const chunk = domainsToCheck.slice(i, i + 300)
    const { data, error } = await supabase
      .from('lead_contacts')
      .select('id, company_domain')
      .in('company_domain', chunk)
    if (error) {
      errors.push(`company domain lookup: ${error.message}`)
      break
    }
    for (const row of data ?? []) {
      const domain = String(row.company_domain ?? '')
        .trim()
        .toLowerCase()
      if (domain && !existingByDomain.has(domain)) existingByDomain.set(domain, row.id)
    }
  }

  const existingByCompanyKey = new Map<string, string>()
  for (let i = 0; i < companiesToCheck.length; i += 200) {
    const chunk = companiesToCheck.slice(i, i + 200)
    const { data, error } = await supabase
      .from('lead_contacts')
      .select('id, company, city')
      .in('company', chunk)
    if (error) {
      errors.push(`company name lookup: ${error.message}`)
      break
    }
    for (const row of data ?? []) {
      const company = String(row.company ?? '')
      if (!company.trim()) continue
      const key = companyKey(company, String(row.city ?? ''))
      if (!existingByCompanyKey.has(key)) existingByCompanyKey.set(key, row.id)
    }
  }

  let imported = 0
  let dupes = 0
  let emailDupes = 0
  let companyDupes = 0
  const skipped: Array<{ row: number; reason: string }> = []
  const contactsToInsert: Record<string, unknown>[] = []

  for (let i = 0; i < mappedRows.length; i++) {
    const mapped = mappedRows[i]
    const email = normalizeEmail(mapped.email)
    const phone = normalizePhone(mapped.phone)
    const linkedin = normalizeLinkedin(mapped.linkedin)
    const site = siteFromEmailOrUrl({ email, website: mapped.website })
    const csvVertical = normalizeVerticalSlug(mapped.vertical)
    const formWins = preferFormVertical && vertical && vertical !== 'other'
    const rowVertical = formWins ? vertical : csvVertical || vertical

    const decision = decideLeadCommit(mapped)
    if ('skip' in decision) {
      skipped.push({ row: i + 1, reason: decision.skip })
      continue
    }

    const matchedId = email ? existingByEmail.get(email) : undefined
    if (matchedId) {
      dupes += 1
      emailDupes += 1
      skipped.push({ row: i + 1, reason: 'matched normalized email' })
      continue
    }

    const rowCompanyKey = mapped.company.trim().length > 2 ? companyKey(mapped.company, mapped.city) : null
    const domainMatch = site.company_domain ? existingByDomain.get(site.company_domain) : undefined
    const nameMatch = rowCompanyKey ? existingByCompanyKey.get(rowCompanyKey) : undefined
    const companyMatchId = domainMatch ?? nameMatch
    if (companyMatchId) {
      dupes += 1
      companyDupes += 1
      skipped.push({
        row: i + 1,
        reason: domainMatch ? 'matched company domain' : 'matched company name + city'
      })
      continue
    }

    const contactId = `contact-${crypto.randomUUID()}`
    const cohortTag = cohortTagForRow(mapped, filename)
    contactsToInsert.push({
      id: contactId,
      name: mapped.name || mapped.company || email || phone || 'Unknown',
      email: email || null,
      phone: phone || null,
      company: mapped.company || null,
      role: mapped.role || null,
      vertical: rowVertical,
      source: sourceService,
      tags: null,
      city: mapped.city || null,
      state: mapped.state || null,
      linkedin: linkedin || null,
      website: site.website,
      company_domain: site.company_domain,
      list_ids: null,
      import_batch_id: batchId,
      outbound_status: 'uncontacted',
      recontact_ok: 1,
      cohort_tag: cohortTag || null,
      icp_status: 'none',
      created_at: now,
      updated_at: now,
      mirrored_at: now
    })
    if (email) existingByEmail.set(email, contactId)
    if (site.company_domain && !existingByDomain.has(site.company_domain)) {
      existingByDomain.set(site.company_domain, contactId)
    }
    if (rowCompanyKey && !existingByCompanyKey.has(rowCompanyKey)) {
      existingByCompanyKey.set(rowCompanyKey, contactId)
    }
    imported += 1
  }

  for (let i = 0; i < contactsToInsert.length; i += 200) {
    const chunk = contactsToInsert.slice(i, i + 200)
    const { error: contactError } = await supabase.from('lead_contacts').insert(chunk)
    if (contactError) errors.push(`contacts batch ${Math.floor(i / 200) + 1}: ${contactError.message}`)
  }

  const { error: tallyError } = await supabase
    .from('lead_import_batches')
    .update({ imported, dupes })
    .eq('id', batchId)
  if (tallyError) errors.push(`batch tally: ${tallyError.message}`)

  return {
    batchId,
    rowCount: rows.length,
    imported,
    dupes,
    emailDupes,
    companyDupes,
    skipped,
    errors
  }
}
