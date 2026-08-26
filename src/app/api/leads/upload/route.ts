import { type NextRequest } from 'next/server'
import { siteFromEmailOrUrl } from '@/lib/company-site'
import {
  normalizeEmail,
  normalizePhone,
  normalizeLinkedin,
  mapCsvRow,
  ingestSkipReason,
  isLeadSourceService,
  cohortTagForRow
} from '@/lib/lead-import-shared'
import { normalizeVerticalSlug } from '@/lib/leads-meta'
import type { LeadSourceService, LeadVertical } from '@/lib/types'
import { portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'
import { deriveCleanName, cleanTradeCompanyName } from '@/lib/lead-import-shared'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { commitLeadRows, type LeadCommitInput } from '@/lib/lead-commit'

export const dynamic = 'force-dynamic'

interface UploadBody {
  rows: Record<string, string | undefined>[]
  vertical?: LeadVertical | string
  sourceService?: LeadSourceService | string
  filename?: string
  preferFormVertical?: boolean
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: UploadBody
  try {
    body = (await readBoundedJson(request, 8 * 1024 * 1024)) as UploadBody
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) {
    return portalJson({ error: 'no_rows' }, { status: 400 })
  }
  if (rows.length > 5000) {
    return portalJson({ error: 'too many rows (max 5000 per upload)' }, { status: 413 })
  }

  const vertical =
    typeof body.vertical === 'string' && body.vertical.trim()
      ? normalizeVerticalSlug(body.vertical)
      : 'trades'
  const sourceServiceRaw =
    typeof body.sourceService === 'string' ? body.sourceService.trim() : ''
  if (!isLeadSourceService(sourceServiceRaw)) {
    return portalJson({ error: 'source_service_required' }, { status: 400 })
  }
  const sourceService = sourceServiceRaw
  const filename = typeof body.filename === 'string' ? body.filename : 'upload.csv'
  const preferFormVertical = body.preferFormVertical !== false
  const batchId = `batch-${crypto.randomUUID()}`

  const commitRows: LeadCommitInput[] = []
  const skipped: Array<{ row: number; reason: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    if (!raw) continue
    const mapped = mapCsvRow(raw)
    const skipReason = ingestSkipReason(mapped)
    if (skipReason) {
      skipped.push({ row: i + 1, reason: skipReason })
      continue
    }
    const email = normalizeEmail(mapped.email ?? '')
    const csvVertical = normalizeVerticalSlug(mapped.vertical)
    const formWins = preferFormVertical && vertical && vertical !== 'other'
    const rowVertical = formWins ? vertical : csvVertical || vertical || 'trades'
    const site = siteFromEmailOrUrl({ email, website: mapped.website })
    const cleanCompany = cleanTradeCompanyName(mapped.company || '')
    const cleanName = deriveCleanName(mapped.name || '', '', cleanCompany, email)
    commitRows.push({
      email,
      company: cleanCompany || mapped.company,
      name: cleanName,
      phone: normalizePhone(mapped.phone ?? ''),
      role: mapped.role || null,
      city: mapped.city || null,
      state: mapped.state || null,
      linkedin: normalizeLinkedin(mapped.linkedin ?? ''),
      website: site.website,
      company_domain: site.company_domain,
      vertical: rowVertical,
      source: sourceService,
      cohort_tag: cohortTagForRow(mapped, filename) || null,
      pipeline_campaign_id: null,
      enrich_status: 'ready',
      icp_status: 'qualified',
      email_origin: 'gmaps',
      outbound_status: 'uncontacted',
      import_batch_id: batchId,
      lead_status_source: 'local_upload'
    })
  }

  try {
    const admin = getPortalAdminClient()
    const result = await commitLeadRows(admin, {
      rows: commitRows,
      source: sourceService
    })
    const companyDupes = result.skipped.filter((row) => row.reason === 'company_dupe').length
    const missing = result.skipped.filter((row) => row.reason !== 'company_dupe')
    return portalJson({
      batchId,
      imported: result.inserted,
      dupes: result.updated + companyDupes,
      emailDupes: result.updated,
      companyDupes,
      skipped: [
        ...skipped,
        ...missing.map((row) => ({ row: 0, reason: row.reason })),
        ...result.skipped
          .filter((row) => row.reason === 'company_dupe')
          .map((row) => ({ row: 0, reason: `company_dupe ${row.existing_id || ''}`.trim() }))
      ],
      errors: result.failed.map((row) => `${row.key}: ${row.error}`)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload_failed'
    return portalJson({ error: 'upload_failed', detail: message }, { status: 500 })
  }
}
