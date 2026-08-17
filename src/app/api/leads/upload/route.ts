import { type NextRequest } from 'next/server'
import { siteFromEmailOrUrl } from '@/lib/company-site'
import { normalizeEmail, normalizePhone, normalizeLinkedin, mapCsvRow, ingestSkipReason, isLeadSourceService } from '@/lib/lead-import-shared'
import { normalizeVerticalSlug } from '@/lib/leads-meta'
import type { LeadSourceService, LeadVertical } from '@/lib/types'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, readBoundedJson, requireSameOrigin } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface UploadBody {
  rows: Record<string, string | undefined>[]
  vertical?: LeadVertical | string
  sourceService?: LeadSourceService | string
  filename?: string
  /**
   * When true (default), the picker vertical is applied to every imported row.
   * Set false to keep per-row CSV Industry/Category when present (mixed consolidations).
   */
  preferFormVertical?: boolean
}

// POST /api/leads/upload — import a parsed CSV into lead_contacts +
// lead_import_batches + lead_source_rows. Mirrors the contactPayload() +
// sourceRowPayload() patterns from apps/compass/src/main/leads/lead-cloud-sync.ts
// and the dedupe-by-email flow from apps/compass/src/main/leads/lead-import.ts.
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let supabase
  try {
    ;({ supabase } = await requirePortalAccess({ operator: true }))
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'upload_failed' }, { status: 500 })
  }

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
    return portalJson(
      { error: 'too many rows (max 5000 per upload)' },
      { status: 413 }
    )
  }

  const vertical =
    typeof body.vertical === 'string' && body.vertical.trim()
      ? normalizeVerticalSlug(body.vertical)
      : null
  const sourceServiceRaw =
    typeof body.sourceService === 'string' ? body.sourceService.trim() : ''
  if (!isLeadSourceService(sourceServiceRaw)) {
    return portalJson({ error: 'source_service_required' }, { status: 400 })
  }
  const sourceService = sourceServiceRaw
  const filename = typeof body.filename === 'string' ? body.filename : null
  // When true (default), the upload form vertical wins over CSV Industry/Category.
  // Mixed-industry consolidations can set preferFormVertical: false to keep per-row Industry.
  const preferFormVertical = body.preferFormVertical !== false

  const now = new Date().toISOString()
  const batchId = `batch-${crypto.randomUUID()}`
  const errors: string[] = []

  try {
    // 1. Create the import batch row.
    const batchRow = {
      id: batchId,
      source: 'csv',
      filename,
      sheet_url: null,
      row_count: rows.length,
      imported: 0,
      dupes: 0,
      created_at: now,
      mirrored_at: now
    }
    const { error: batchError } = await supabase.from('lead_import_batches').insert(batchRow)
    if (batchError) {
      return portalJson({ error: 'batch_create_failed' }, { status: 400 })
    }

    // 2. Pre-fetch existing contacts by email so dedupe is one round-trip per
    //    chunk of unique emails rather than one per row. The contact insert path
    //    keeps the in-memory map updated so duplicate emails within the same
    //    batch also dedupe against rows we just inserted (mirrors lead-import.ts
    //    `byEmail` + `touch`).
    //
    //    Both the Compass desktop import and this route store emails already
    //    lower-cased via normalizeEmail(), and migration 0005 indexes
    //    lower(email), so an exact `.in('email', normalizedEmails)` lookup hits
    //    the same rows `where lower(email) = lower($1)` would. The fetched rows
    //    are re-normalized before keying the map as a belt-and-braces guard.
    const emailsToCheck = Array.from(
      new Set(
        rows
          .map((r) => normalizeEmail(mapCsvRow(r).email ?? ''))
          .filter((e) => e.length > 0)
      )
    )
    const existingByEmail = new Map<string, string>()
    // PostgREST `in` filters are safest chunked; 300 stays well under URL limits.
    for (let i = 0; i < emailsToCheck.length; i += 300) {
      const chunk = emailsToCheck.slice(i, i + 300)
      const { data, error } = await supabase
        .from('lead_contacts')
        .select('id, email')
        .in('email', chunk)
      if (error) {
        errors.push(`dedupe lookup: ${error.message}`)
        break
      }
      for (const row of data ?? []) {
        const norm = normalizeEmail(row.email ?? '')
        if (norm && !existingByEmail.has(norm)) existingByEmail.set(norm, row.id)
      }
    }

    // 3. Iterate rows in memory to decide each row's fate and build the contact
    //    + source-row payloads. Contact IDs are generated up front so source rows
    //    can reference them; the dedupe map is updated in-memory so duplicate
    //    emails within the same batch dedupe against rows we're about to insert
    //    (mirrors lead-import.ts `byEmail` + `touch`).
    let imported = 0
    let dupes = 0
    const skipped: Array<{ row: number; reason: string }> = []
    const contactsToInsert: Record<string, unknown>[] = []
    const sourceRowsToInsert: Record<string, unknown>[] = []

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]
      const mapped = mapCsvRow(raw)
      const email = normalizeEmail(mapped.email ?? '')
      const phone = normalizePhone(mapped.phone ?? '')
      const linkedin = normalizeLinkedin(mapped.linkedin ?? '')
      const site = siteFromEmailOrUrl({ email, website: mapped.website })
      const sourceRowId = `source-${crypto.randomUUID()}`
      const csvVertical = normalizeVerticalSlug(mapped.vertical)
      // Form vertical wins when the operator picked a real vertical. Leaving
      // "other" keeps per-row CSV Industry/Category so mixed consolidations stay tagged.
      const formWins = preferFormVertical && vertical && vertical !== 'other'
      const rowVertical = formWins ? vertical : csvVertical || vertical

      const baseSourceRow: Record<string, unknown> = {
        id: sourceRowId,
        batch_id: batchId,
        source_type: 'csv',
        source_service: sourceService,
        source_file: filename,
        sheet_url: null,
        source_row_number: i + 1,
        raw_json: JSON.stringify(raw),
        normalized_email: email || null,
        normalized_phone: phone || null,
        linkedin: linkedin || null,
        company_domain: site.company_domain,
        decision: 'imported',
        contact_id: null,
        reason: null,
        created_at: now,
        updated_at: now,
        mirrored_at: now
      }

      // Skip rows missing email, name, or company — record as skipped, not imported.
      const skipReason = ingestSkipReason(mapped)
      if (skipReason) {
        baseSourceRow.decision = 'skipped'
        baseSourceRow.reason = skipReason
        sourceRowsToInsert.push(baseSourceRow)
        skipped.push({ row: i + 1, reason: skipReason })
        continue
      }

      const matchedId = email ? existingByEmail.get(email) : undefined
      if (matchedId) {
        baseSourceRow.decision = 'dupe'
        baseSourceRow.contact_id = matchedId
        baseSourceRow.reason = 'matched normalized email'
        sourceRowsToInsert.push(baseSourceRow)
        dupes++
        continue
      }

      const contactId = `contact-${crypto.randomUUID()}`
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
        created_at: now,
        updated_at: now,
        mirrored_at: now
      })
      if (email) existingByEmail.set(email, contactId)
      baseSourceRow.contact_id = contactId
      sourceRowsToInsert.push(baseSourceRow)
      imported++
    }

    // 4. Bulk-insert contacts in chunks, then source rows. Chunking stays under
    //    Supabase's per-request body limit. A failed chunk is reported but does
    //    not abort the whole batch — the affected source rows keep their
    //    pre-assigned contact_id for traceability.
    for (let i = 0; i < contactsToInsert.length; i += 500) {
      const chunk = contactsToInsert.slice(i, i + 500)
      const { error: contactError } = await supabase.from('lead_contacts').insert(chunk)
      if (contactError) {
        errors.push(`contacts batch ${Math.floor(i / 500) + 1}: ${contactError.message}`)
      }
    }

    for (let i = 0; i < sourceRowsToInsert.length; i += 500) {
      const chunk = sourceRowsToInsert.slice(i, i + 500)
      const { error: sourceError } = await supabase.from('lead_source_rows').insert(chunk)
      if (sourceError) {
        errors.push(`source_rows batch ${Math.floor(i / 500) + 1}: ${sourceError.message}`)
      }
    }

    // 5. Update the batch tally.
    const { error: tallyError } = await supabase
      .from('lead_import_batches')
      .update({ imported, dupes })
      .eq('id', batchId)
    if (tallyError) {
      errors.push(`batch tally: ${tallyError.message}`)
    }

    return portalJson(
      { batchId, rowCount: rows.length, imported, dupes, skipped, errors },
      { status: 201 }
    )
  } catch (err) {
    return portalJson({ error: 'upload_failed' }, { status: 500 })
  }
}
