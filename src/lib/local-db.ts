import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import Papa from 'papaparse'
import type {
  LeadContact,
  LeadListFilters,
  LeadSummaryCounts,
  LeadUploadResult
} from './types'
import type { CompassCampaign } from './campaigns'
import {
  normalizeEmail,
  normalizePhone,
  normalizeLinkedin,
  cleanTradeCompanyName,
  deriveCleanName,
  isEmailHandleOrCorrupted
} from './lead-import-shared'
import { PROSPECT_OUTBOUND_STATUSES } from './lead-buckets'
import { normalizeVerticalSlug } from './leads-meta'
import { recontactCutoffIso } from './recontact-eligibility'

let dbInstance: DatabaseSync | null = null

export function getDbPath(): string {
  if (process.env.COMPASS_DB_PATH) {
    return process.env.COMPASS_DB_PATH
  }
  const isServerless =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().startsWith('/var/task') ||
    process.cwd().startsWith('/var/runtime')

  if (isServerless) {
    const tmpDir = path.join('/tmp', 'compass-data')
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true })
      }
    } catch {
      /* ignore */
    }
    return path.join(tmpDir, 'compass.db')
  }

  const cwd = process.cwd()
  const inCompassWeb = cwd.endsWith('compass-web')
  const baseDir = inCompassWeb ? path.join(cwd, 'data') : path.join(cwd, 'compass-web', 'data')
  try {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true })
    }
    return path.join(baseDir, 'compass.db')
  } catch {
    const fallbackDir = path.join('/tmp', 'compass-data')
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true })
      }
    } catch {
      /* ignore */
    }
    return path.join(fallbackDir, 'compass.db')
  }
}

export function getLocalDb(): DatabaseSync {
  if (dbInstance) return dbInstance

  const dbPath = getDbPath()
  const db = new DatabaseSync(dbPath)

  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA foreign_keys = ON;')

  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_contacts (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      role TEXT,
      vertical TEXT,
      source TEXT,
      tags TEXT,
      city TEXT,
      state TEXT,
      linkedin TEXT,
      list_ids TEXT,
      import_batch_id TEXT,
      outbound_status TEXT DEFAULT 'uncontacted',
      instantly_campaign TEXT,
      instantly_campaign_id TEXT,
      instantly_campaign_name TEXT,
      instantly_lead_id TEXT,
      instantly_uploaded_at TEXT,
      instantly_synced_at TEXT,
      lead_status_source TEXT,
      interest_label TEXT,
      recontact_ok INTEGER DEFAULT 1,
      suppression_reason TEXT,
      last_outbound_at TEXT,
      lead_context_status TEXT,
      lead_context_updated_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      mirrored_at TEXT,
      instantly_campaign_ids TEXT,
      pipeline_campaign_id TEXT,
      cohort_tag TEXT,
      enrich_status TEXT,
      opener TEXT,
      lead_facts TEXT,
      website TEXT,
      company_domain TEXT,
      email_verify_status TEXT,
      email_verified_at TEXT,
      opener_track TEXT,
      opener_kind TEXT,
      icp_status TEXT,
      review_count INTEGER,
      hours_label TEXT,
      after_hours INTEGER,
      capture_crack TEXT,
      email_origin TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_email ON lead_contacts (email);
    CREATE INDEX IF NOT EXISTS idx_leads_vertical ON lead_contacts (vertical);
    CREATE INDEX IF NOT EXISTS idx_leads_city ON lead_contacts (city);
    CREATE INDEX IF NOT EXISTS idx_leads_outbound_status ON lead_contacts (outbound_status);
    CREATE INDEX IF NOT EXISTS idx_leads_pipeline_campaign ON lead_contacts (pipeline_campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_instantly_campaign ON lead_contacts (instantly_campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_cohort_tag ON lead_contacts (cohort_tag);
    CREATE INDEX IF NOT EXISTS idx_leads_mirrored_at ON lead_contacts (mirrored_at);

    CREATE TABLE IF NOT EXISTS compass_pipeline_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'planned',
      priority INTEGER DEFAULT 0,
      health TEXT DEFAULT 'no_updates',
      start_date TEXT,
      end_date TEXT,
      go_live_at TEXT,
      color TEXT DEFAULT '#94a3b8',
      summary TEXT,
      labels TEXT DEFAULT '[]',
      owner_label TEXT,
      instantly_campaign_id TEXT,
      offer_key TEXT,
      structure_id TEXT,
      opener_mode TEXT,
      opener_track TEXT,
      opener_kind TEXT,
      vertical_tags TEXT DEFAULT '[]',
      location_tags TEXT DEFAULT '[]',
      audience_tag TEXT,
      copy_status TEXT DEFAULT 'draft',
      copy_subject TEXT,
      copy_opener_pattern TEXT,
      copy_sequence_json TEXT,
      copy_cold_expression TEXT,
      copy_updated_at TEXT,
      wave_cadence TEXT,
      wave_pacing_mode TEXT,
      wave_window_start TEXT,
      wave_window_end TEXT,
      wave_assigned_lead_count INTEGER DEFAULT 0,
      wave_pushed_lead_count INTEGER DEFAULT 0,
      wave_target_cap INTEGER,
      sequence_subject_pattern TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compass_pipeline_activity (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_import_batches (
      id TEXT PRIMARY KEY,
      source TEXT,
      filename TEXT,
      sheet_url TEXT,
      row_count INTEGER DEFAULT 0,
      imported INTEGER DEFAULT 0,
      dupes INTEGER DEFAULT 0,
      created_at TEXT,
      mirrored_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lead_source_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      source_type TEXT,
      source_service TEXT,
      source_file TEXT,
      sheet_url TEXT,
      source_row_number INTEGER,
      raw_json TEXT,
      normalized_email TEXT,
      normalized_phone TEXT,
      linkedin TEXT,
      company_domain TEXT,
      decision TEXT,
      contact_id TEXT,
      reason TEXT,
      created_at TEXT,
      updated_at TEXT,
      mirrored_at TEXT
    );

    CREATE TABLE IF NOT EXISTS compass_settings (
      id TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `)

  dbInstance = db
  return db
}

export function closeLocalDb() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

export { cleanTradeCompanyName, deriveCleanName, isEmailHandleOrCorrupted }

/** Query leads with filters matching PostgREST behavior */
export function queryLeadContacts(
  filters: LeadListFilters,
  page = 1,
  pageSize = 50,
  exportLimit: number | null = null
): { leads: LeadContact[]; total: number } {
  const db = getLocalDb()
  const whereClauses: string[] = []
  const params: unknown[] = []

  if (filters.vertical) {
    whereClauses.push('LOWER(vertical) = LOWER(?)')
    params.push(filters.vertical.trim())
  }
  if (filters.source) {
    whereClauses.push('source = ?')
    params.push(filters.source)
  }
  if (filters.city) {
    whereClauses.push('(city LIKE ? OR state LIKE ?)')
    params.push(`%${filters.city.trim()}%`, `%${filters.city.trim()}%`)
  }
  if (filters.cohort_tag) {
    whereClauses.push('cohort_tag = ?')
    params.push(filters.cohort_tag)
  }
  if (filters.pipeline_campaign_id) {
    whereClauses.push('pipeline_campaign_id = ?')
    params.push(filters.pipeline_campaign_id)
  }
  if (filters.instantly_campaign_id) {
    whereClauses.push('instantly_campaign_id = ?')
    params.push(filters.instantly_campaign_id)
  }
  if (filters.enrich_status) {
    whereClauses.push('enrich_status = ?')
    params.push(filters.enrich_status)
  }
  if (filters.icp_status) {
    whereClauses.push('icp_status = ?')
    params.push(filters.icp_status)
  }
  if (filters.after_hours === '1') {
    whereClauses.push('after_hours = 1')
  } else if (filters.after_hours === '0') {
    whereClauses.push('(after_hours = 0 OR after_hours IS NULL)')
  }
  if (filters.email_origin) {
    whereClauses.push('email_origin = ?')
    params.push(filters.email_origin)
  }
  if (filters.min_reviews) {
    const min = Number(filters.min_reviews)
    if (Number.isFinite(min) && min >= 0) {
      whereClauses.push('review_count >= ?')
      params.push(min)
    }
  }
  if (filters.outbound_status) {
    if (filters.outbound_status === 'replied_or_interested') {
      whereClauses.push("outbound_status IN ('replied', 'interested')")
    } else {
      whereClauses.push('outbound_status = ?')
      params.push(filters.outbound_status)
    }
  }
  if (filters.q) {
    const term = `%${filters.q.trim()}%`
    whereClauses.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?)')
    params.push(term, term, term, term)
  }
  if (filters.completeness) {
    if (filters.completeness === 'has_phone') {
      whereClauses.push("phone IS NOT NULL AND phone != ''")
    } else if (filters.completeness === 'no_phone') {
      whereClauses.push("(phone IS NULL OR phone = '')")
    } else if (filters.completeness === 'has_email') {
      whereClauses.push("email IS NOT NULL AND email != ''")
    } else if (filters.completeness === 'no_email') {
      whereClauses.push("(email IS NULL OR email = '')")
    }
  }
  if (filters.sync_state) {
    if (filters.sync_state === 'in_instantly') {
      whereClauses.push(
        "(outbound_status = 'in_instantly' OR instantly_lead_id IS NOT NULL OR instantly_campaign_id IS NOT NULL)"
      )
    } else if (filters.sync_state === 'not_uploaded') {
      whereClauses.push(
        "instantly_lead_id IS NULL AND instantly_campaign_id IS NULL AND outbound_status NOT IN ('in_instantly', 'suppressed')"
      )
    } else if (filters.sync_state === 'needs_review') {
      whereClauses.push("outbound_status IN ('needs_review', 'needs-review')")
    }
  }
  if (filters.suppressed === '1') {
    whereClauses.push("(outbound_status = 'suppressed' OR suppression_reason IS NOT NULL)")
  } else if (filters.suppressed === '0') {
    whereClauses.push("(outbound_status != 'suppressed' AND suppression_reason IS NULL)")
  }
  if (filters.recontact_ok === '1') {
    whereClauses.push('recontact_ok = 1')
  } else if (filters.recontact_ok === '0') {
    whereClauses.push('(recontact_ok = 0 OR recontact_ok IS NULL)')
  }
  if (filters.recontact_ready === '1') {
    const cutoff = recontactCutoffIso()
    whereClauses.push(
      `outbound_status != 'suppressed' AND suppression_reason IS NULL AND (recontact_ok = 1 OR recontact_ok IS NULL) AND last_outbound_at IS NOT NULL AND last_outbound_at < ? AND outbound_status NOT IN ('replied', 'interested', 'booked', 'meeting_booked', 'converted')`
    )
    params.push(cutoff)
  }

  // Bucket filter
  if (filters.bucket === 'archived') {
    whereClauses.push('is_archived = 1')
  } else {
    whereClauses.push('(is_archived = 0 OR is_archived IS NULL)')
    if (!filters.outbound_status) {
      if (filters.bucket === 'prospects') {
        const list = PROSPECT_OUTBOUND_STATUSES.map((s) => `'${s}'`).join(',')
        whereClauses.push(`outbound_status IN (${list})`)
      } else {
        const list = PROSPECT_OUTBOUND_STATUSES.map((s) => `'${s}'`).join(',')
        whereClauses.push(`(outbound_status IS NULL OR outbound_status NOT IN (${list}))`)
      }
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  // Total count
  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM lead_contacts ${whereSql}`)
    .get(...(params as string[])) as { count: number }
  const total = countRow?.count ?? 0

  // Paged query
  const limit = exportLimit ?? pageSize
  const offset = exportLimit ? 0 : (page - 1) * pageSize
  const selectSql = `
    SELECT * FROM lead_contacts
    ${whereSql}
    ORDER BY mirrored_at DESC, created_at DESC
    LIMIT ? OFFSET ?
  `
  const rows = db.prepare(selectSql).all(...(params as string[]), limit, offset) as unknown as LeadContact[]

  return { leads: rows, total }
}

/** Global counts for the CRM header chips */
export function getLeadSummaryCounts(): LeadSummaryCounts {
  const db = getLocalDb()
  const cutoff = recontactCutoffIso()

  const total = (
    db.prepare('SELECT COUNT(*) as c FROM lead_contacts WHERE is_archived = 0 OR is_archived IS NULL').get() as {
      c: number
    }
  ).c
  const archived = (
    db.prepare('SELECT COUNT(*) as c FROM lead_contacts WHERE is_archived = 1').get() as { c: number }
  ).c
  const uncontacted = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND outbound_status = 'uncontacted'"
      )
      .get() as {
      c: number
    }
  ).c
  const inInstantly = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND (outbound_status = 'in_instantly' OR instantly_lead_id IS NOT NULL OR instantly_campaign_id IS NOT NULL)"
      )
      .get() as { c: number }
  ).c
  const replied = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND outbound_status = 'replied'"
      )
      .get() as {
      c: number
    }
  ).c
  const interested = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND outbound_status = 'interested'"
      )
      .get() as {
      c: number
    }
  ).c
  const suppressed = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND (outbound_status = 'suppressed' OR suppression_reason IS NOT NULL)"
      )
      .get() as { c: number }
  ).c
  const noPhone = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND (phone IS NULL OR phone = '')"
      )
      .get() as {
      c: number
    }
  ).c
  const noEmail = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND (email IS NULL OR email = '')"
      )
      .get() as {
      c: number
    }
  ).c
  const needsReview = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND outbound_status IN ('needs_review', 'needs-review')"
      )
      .get() as { c: number }
  ).c
  const recontactReady = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM lead_contacts WHERE (is_archived = 0 OR is_archived IS NULL) AND outbound_status != 'suppressed' AND suppression_reason IS NULL AND (recontact_ok = 1 OR recontact_ok IS NULL) AND last_outbound_at IS NOT NULL AND last_outbound_at < ? AND outbound_status NOT IN ('replied', 'interested', 'booked', 'meeting_booked', 'converted')`
      )
      .get(cutoff) as { c: number }
  ).c

  return {
    total,
    filtered: total,
    uncontacted,
    in_instantly: inInstantly,
    replied,
    interested,
    suppressed,
    no_phone: noPhone,
    no_email: noEmail,
    needs_review: needsReview,
    recontact_ready: recontactReady,
    archived
  }
}

/** Facet counts for dropdowns */
export function getLeadFacets(): {
  verticals: Array<{ value: string; count: number }>
  cities: Array<{ value: string; count: number }>
} {
  const db = getLocalDb()

  const verticalRows = db
    .prepare(
      `SELECT vertical as value, COUNT(*) as count FROM lead_contacts WHERE vertical IS NOT NULL AND vertical != '' GROUP BY vertical ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>

  const cityRows = db
    .prepare(
      `SELECT city as value, COUNT(*) as count FROM lead_contacts WHERE city IS NOT NULL AND city != '' GROUP BY city ORDER BY count DESC LIMIT 80`
    )
    .all() as Array<{ value: string; count: number }>

  return {
    verticals: verticalRows,
    cities: cityRows
  }
}

/** Get all campaigns */
export function getPipelineCampaigns(): CompassCampaign[] {
  const db = getLocalDb()
  const rows = db
    .prepare(
      `SELECT * FROM compass_pipeline_campaigns ORDER BY go_live_at ASC, start_date ASC, name ASC`
    )
    .all() as Array<Record<string, unknown>>

  return rows.map((r) => {
    let sequenceDraft = null
    if (r.copy_sequence_json) {
      try {
        sequenceDraft = JSON.parse(String(r.copy_sequence_json))
      } catch {
        sequenceDraft = null
      }
    }
    return {
      id: String(r.id),
      name: String(r.name),
      status: (r.status as CompassCampaign['status']) || 'planned',
      priority: typeof r.priority === 'number' ? r.priority : 0,
      health: (r.health as CompassCampaign['health']) || 'no_updates',
      start_date: r.start_date ? String(r.start_date) : null,
      end_date: r.end_date ? String(r.end_date) : null,
      go_live_at: r.go_live_at ? String(r.go_live_at) : null,
      color: r.color ? String(r.color) : '#94a3b8',
      summary: r.summary ? String(r.summary) : null,
      labels: parseJsonArray(r.labels),
      owner_label: r.owner_label ? String(r.owner_label) : null,
      instantly_campaign_id: r.instantly_campaign_id ? String(r.instantly_campaign_id) : null,
      offer_key: r.offer_key ? String(r.offer_key) : null,
      structure_id: r.structure_id ? String(r.structure_id) : null,
      opener_mode: r.opener_mode ? String(r.opener_mode) : null,
      vertical_tags: parseJsonArray(r.vertical_tags),
      location_tags: parseJsonArray(r.location_tags),
      cold_expression: r.copy_cold_expression ? String(r.copy_cold_expression) : null,
      sequence_draft: sequenceDraft,
      copy_status: (r.copy_status as CompassCampaign['copy_status']) || 'draft',
      created_at: r.created_at ? String(r.created_at) : new Date().toISOString(),
      updated_at: r.updated_at ? String(r.updated_at) : new Date().toISOString()
    }
  })
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      return val.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

/** Upsert campaign */
export function upsertPipelineCampaign(campaign: Partial<CompassCampaign> & { name: string }): CompassCampaign {
  const db = getLocalDb()
  const id = campaign.id || `campaign-${crypto.randomUUID()}`
  const now = new Date().toISOString()

  const labelsJson = JSON.stringify(campaign.labels || [])
  const verticalTagsJson = JSON.stringify(campaign.vertical_tags || [])
  const locationTagsJson = JSON.stringify(campaign.location_tags || [])
  const sequenceDraftJson = campaign.sequence_draft ? JSON.stringify(campaign.sequence_draft) : null

  db.prepare(`
    INSERT INTO compass_pipeline_campaigns (
      id, name, status, priority, health, start_date, end_date, go_live_at, color, summary,
      labels, owner_label, instantly_campaign_id, offer_key, structure_id, opener_mode,
      vertical_tags, location_tags, copy_status, copy_cold_expression, copy_sequence_json,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      priority = excluded.priority,
      health = excluded.health,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      go_live_at = excluded.go_live_at,
      color = excluded.color,
      summary = excluded.summary,
      labels = excluded.labels,
      owner_label = excluded.owner_label,
      instantly_campaign_id = excluded.instantly_campaign_id,
      offer_key = excluded.offer_key,
      structure_id = excluded.structure_id,
      opener_mode = excluded.opener_mode,
      vertical_tags = excluded.vertical_tags,
      location_tags = excluded.location_tags,
      copy_status = excluded.copy_status,
      copy_cold_expression = excluded.copy_cold_expression,
      copy_sequence_json = excluded.copy_sequence_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    campaign.name,
    campaign.status || 'planned',
    campaign.priority || 0,
    campaign.health || 'no_updates',
    campaign.start_date || null,
    campaign.end_date || null,
    campaign.go_live_at || null,
    campaign.color || '#94a3b8',
    campaign.summary || null,
    labelsJson,
    campaign.owner_label || null,
    campaign.instantly_campaign_id || null,
    campaign.offer_key || null,
    campaign.structure_id || null,
    campaign.opener_mode || null,
    verticalTagsJson,
    locationTagsJson,
    campaign.copy_status || 'draft',
    campaign.cold_expression || null,
    sequenceDraftJson,
    campaign.created_at || now,
    now
  )

  return getPipelineCampaigns().find((c) => c.id === id)!
}

/** Delete campaign */
export function deletePipelineCampaign(id: string): void {
  const db = getLocalDb()
  db.prepare('DELETE FROM compass_pipeline_campaigns WHERE id = ?').run(id)
}

/** Record pipeline activity */
export function addPipelineActivity(
  campaignId: string,
  kind: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  const db = getLocalDb()
  const id = `act-${crypto.randomUUID()}`
  db.prepare(`
    INSERT INTO compass_pipeline_activity (id, campaign_id, kind, message, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, campaignId, kind, message, metadata ? JSON.stringify(metadata) : null, new Date().toISOString())
}

/** Update single lead */
export function updateLeadContact(id: string, patch: Partial<LeadContact>): void {
  const db = getLocalDb()
  const keys = Object.keys(patch).filter((k) => k !== 'id')
  if (keys.length === 0) return

  const setClauses = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => (patch as Record<string, unknown>)[k])

  db.prepare(`UPDATE lead_contacts SET ${setClauses}, updated_at = ? WHERE id = ?`).run(
    ...(values as string[]),
    new Date().toISOString(),
    id
  )
}

/** Bulk update leads */
export function bulkUpdateLeadContacts(ids: string[], patch: Partial<LeadContact>): void {
  if (ids.length === 0) return
  const db = getLocalDb()
  const keys = Object.keys(patch).filter((k) => k !== 'id')
  if (keys.length === 0) return

  const setClauses = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => (patch as Record<string, unknown>)[k])
  const placeholders = ids.map(() => '?').join(',')

  db.prepare(
    `UPDATE lead_contacts SET ${setClauses}, updated_at = ? WHERE id IN (${placeholders})`
  ).run(...(values as string[]), new Date().toISOString(), ...ids)
}

/** Delete lead */
export function deleteLeadContact(id: string): void {
  const db = getLocalDb()
  db.prepare('DELETE FROM lead_contacts WHERE id = ?').run(id)
}

/** Sync all clean CSV files from cold-email folders into SQLite */
export function syncLocalCsvFiles(): { imported: number; updated: number; total: number } {
  const db = getLocalDb()
  const cwd = process.cwd()
  const rootDir = cwd.endsWith('compass-web') ? path.join(cwd, '..') : cwd

  const openersOutDir = path.join(rootDir, 'cold-email', 'openers', 'out')
  let imported = 0
  let updated = 0

  if (!fs.existsSync(openersOutDir)) {
    return { imported: 0, updated: 0, total: 0 }
  }

  const files = fs.readdirSync(openersOutDir).filter((f) => f.endsWith('.csv'))

  // Load existing leads map by email
  const existingRows = db.prepare('SELECT id, email, outbound_status, instantly_campaign_id FROM lead_contacts').all() as Array<{
    id: string
    email: string
    outbound_status: string
    instantly_campaign_id: string | null
  }>
  const byEmail = new Map<string, { id: string; outbound_status: string; instantly_campaign_id: string | null }>()
  for (const row of existingRows) {
    if (row.email) byEmail.set(row.email.toLowerCase(), row)
  }

  const insertStmt = db.prepare(`
    INSERT INTO lead_contacts (
      id, name, email, phone, company, role, vertical, source, tags, city, state,
      linkedin, list_ids, import_batch_id, outbound_status, instantly_campaign,
      instantly_campaign_id, instantly_campaign_name, instantly_lead_id, instantly_uploaded_at,
      instantly_synced_at, lead_status_source, interest_label, recontact_ok, suppression_reason,
      last_outbound_at, lead_context_status, lead_context_updated_at, created_at, updated_at,
      mirrored_at, instantly_campaign_ids, pipeline_campaign_id, cohort_tag, enrich_status,
      opener, lead_facts, website, company_domain, email_verify_status, email_verified_at,
      opener_track, opener_kind, icp_status, review_count, hours_label, after_hours,
      capture_crack, email_origin
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `)

  const updateStmt = db.prepare(`
    UPDATE lead_contacts SET
      name = ?, phone = ?, company = ?, vertical = ?, city = ?, state = ?,
      website = ?, review_count = ?, opener = ?, email_verify_status = ?,
      cohort_tag = ?, updated_at = ?
    WHERE id = ?
  `)

  const now = new Date().toISOString()

  for (const filename of files) {
    const filePath = path.join(openersOutDir, filename)
    const content = fs.readFileSync(filePath, 'utf8')
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: 'greedy'
    })

    // Infer vertical from filename (e.g. plumber-brisbane, hvac-darwin)
    const stem = filename.toLowerCase()
    let inferredVertical = 'trades'
    if (stem.includes('plumber')) inferredVertical = 'plumber'
    else if (stem.includes('hvac')) inferredVertical = 'hvac'
    else if (stem.includes('electrician')) inferredVertical = 'electricians'
    else if (stem.includes('locksmith')) inferredVertical = 'locksmith'
    else if (stem.includes('roofing')) inferredVertical = 'roofing'

    let inferredCity = ''
    if (stem.includes('brisbane')) inferredCity = 'Brisbane'
    else if (stem.includes('sydney')) inferredCity = 'Sydney'
    else if (stem.includes('melbourne')) inferredCity = 'Melbourne'
    else if (stem.includes('darwin')) inferredCity = 'Darwin'
    else if (stem.includes('adelaide')) inferredCity = 'Adelaide'
    else if (stem.includes('newcastle')) inferredCity = 'Newcastle'
    else if (stem.includes('perth')) inferredCity = 'Perth'

    const cohortTag = filename.replace(/\.csv$/i, '')

    for (const row of parsed.data) {
      const rawEmail = row.email || row.Email || row['Email address'] || ''
      const email = normalizeEmail(rawEmail)
      if (!email || !email.includes('@')) continue

      const rawPhone = row.phone || row.Phone || row.Mobile || ''
      const phone = normalizePhone(rawPhone)

      const rawCompany = row.company || row.Company || row.business_name_raw || ''
      const company = cleanTradeCompanyName(rawCompany)

      const rawFirstName = row.firstName || row.first_name || row['First name'] || ''
      const rawLastName = row.lastName || row.last_name || row['Last name'] || ''
      const rawName = [rawFirstName, rawLastName].filter(Boolean).join(' ')
      const cleanName = deriveCleanName(rawName, rawFirstName, company, email)

      const city = row.suburb || row.city || row.City || inferredCity || null
      const state = row.state || row.State || null
      const website = row.website || row.Website || null
      const opener = row.opener || row.Opener || row.personalization || null
      const reviewCount = Number(row.review_count || row.reviews || 0) || null
      const emailVerifyStatus = row.email_status || row.email_verify_status || 'valid'

      const existing = byEmail.get(email)
      if (existing) {
        updateStmt.run(
          cleanName,
          phone || null,
          company || null,
          inferredVertical,
          city,
          state,
          website,
          reviewCount,
          opener,
          emailVerifyStatus,
          cohortTag,
          now,
          existing.id
        )
        updated++
      } else {
        const newId = `contact-${crypto.randomUUID()}`
        insertStmt.run(
          newId,
          cleanName,
          email,
          phone || null,
          company || null,
          null, // role
          inferredVertical,
          'local-csv', // source
          null, // tags
          city,
          state,
          null, // linkedin
          null, // list_ids
          null, // import_batch_id
          'uncontacted', // outbound_status
          null, // instantly_campaign
          null, // instantly_campaign_id
          null, // instantly_campaign_name
          null, // instantly_lead_id
          null, // instantly_uploaded_at
          null, // instantly_synced_at
          'local_import', // lead_status_source
          null, // interest_label
          1, // recontact_ok
          null, // suppression_reason
          null, // last_outbound_at
          null, // lead_context_status
          null, // lead_context_updated_at
          now, // created_at
          now, // updated_at
          now, // mirrored_at
          null, // instantly_campaign_ids
          null, // pipeline_campaign_id
          cohortTag,
          'ready', // enrich_status
          opener,
          null, // lead_facts
          website,
          null, // company_domain
          emailVerifyStatus,
          now, // email_verified_at
          null, // opener_track
          null, // opener_kind
          'qualified', // icp_status
          reviewCount,
          null, // hours_label
          null, // after_hours
          null, // capture_crack
          'gmaps' // email_origin
        )
        byEmail.set(email, { id: newId, outbound_status: 'uncontacted', instantly_campaign_id: null })
        imported++
      }
    }
  }

  const total = (db.prepare('SELECT COUNT(*) as c FROM lead_contacts').get() as { c: number }).c
  return { imported, updated, total }
}
