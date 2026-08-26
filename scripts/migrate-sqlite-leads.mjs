#!/usr/bin/env node
/**
 * One-time SQLite → Supabase lead_contacts upsert.
 *
 * Reads data/compass.db (or COMPASS_DB_PATH) and upserts into hosted Supabase
 * using the same Wave 1a rules as POST /api/agent/leads:
 *   - skip missing email or company
 *   - email match → update
 *   - company_domain or company+city match → skip (company_dupe)
 *   - never invent emails
 *   - never downgrade hot outbound_status unless the sqlite row sets it
 *   - icp_status=skip stays skip
 *   - enrich ready→enriched, icp qualified→pass, email_origin gmaps→published
 *
 * Idempotent. Do NOT run against production from an agent.
 *
 *   node scripts/migrate-sqlite-leads.mjs --dry-run
 *   node scripts/migrate-sqlite-leads.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compassWebDir = path.resolve(__dirname, '..')
const dryRun = process.argv.includes('--dry-run')
const WRITE_BATCH = 100
const HOT = new Set(['replied', 'interested', 'booked', 'meeting_booked', 'converted'])

function dbPath() {
  if (process.env.COMPASS_DB_PATH) return process.env.COMPASS_DB_PATH
  return path.join(compassWebDir, 'data', 'compass.db')
}

function readEnvLocal() {
  const envPath = path.join(compassWebDir, '.env.local')
  const out = {}
  if (!fs.existsSync(envPath)) return out
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

function normalizeCompanyKey(raw) {
  let cleaned = String(raw ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
  if (!cleaned) return ''
  cleaned = cleaned
    .replace(/\s+(Pty\s*Ltd|Pty\s*Limited|Proprietary\s*Limited|Services|Group|Pty|Ltd|LLC|Co\b)\.?$/i, '')
    .replace(/\s+(Pty\s*Ltd|Pty\s*Limited|Proprietary\s*Limited|Services|Group|Pty|Ltd|LLC)\b/gi, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned
}

function companyCityKey(company, city) {
  const companyKey = normalizeCompanyKey(company)
  if (!companyKey) return ''
  const cityKey = String(city ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${companyKey}|${cityKey}`
}

function mapEnrich(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'ready') return 'enriched'
  return raw
}

function mapIcp(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'qualified') return 'pass'
  return raw
}

function mapOrigin(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'gmaps' || raw === 'google' || raw === 'maps') return 'published'
  return raw
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function sqliteRows(db) {
  return db.prepare('SELECT * FROM lead_contacts').all()
}

async function withRetry(label, fn, attempts = 3) {
  let lastErr
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      console.error(`${label}: attempt ${i}/${attempts} failed: ${err?.message || err}`)
      if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i))
    }
  }
  throw lastErr
}

// Paged full scan (15 requests for ~14k rows) instead of hundreds of .in()
// queries. Every request carries an abort timeout so a stalled socket cannot
// hang the migration.
async function loadExisting(admin) {
  const cols = 'id,email,company,city,company_domain,outbound_status,icp_status'
  const found = new Map()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const rows = await withRetry(`load existing ${from}-${from + PAGE - 1}`, async () => {
      const { data, error } = await admin
        .from('lead_contacts')
        .select(cols)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
        .abortSignal(AbortSignal.timeout(30000))
      if (error) throw new Error(error.message)
      return data ?? []
    })
    for (const row of rows) found.set(row.id, row)
    if (rows.length < PAGE) break
    from += PAGE
  }
  console.log(`existing supabase rows loaded: ${found.size}`)
  return [...found.values()]
}

function remember(lookups, row) {
  const email = normalizeEmail(row.email || '')
  if (email) lookups.byEmail.set(email, row)
  if (row.company_domain) lookups.byDomain.set(String(row.company_domain).toLowerCase(), row)
  const key = companyCityKey(row.company, row.city)
  if (key) lookups.byCompanyCity.set(key, row)
}

function decide(row, lookups) {
  const email = normalizeEmail(row.email)
  const company = String(row.company ?? '').trim()
  if (!email) return { action: 'skip', key: row.id || 'row', reason: 'missing email' }
  if (!company) return { action: 'skip', key: email, reason: 'missing company' }
  const domain = String(row.company_domain ?? '').trim().toLowerCase()
  const cityKey = companyCityKey(company, row.city)
  const emailMatch = lookups.byEmail.get(email)
  const now = new Date().toISOString()
  const patch = {
    name: row.name || company,
    email,
    company,
    phone: row.phone || null,
    role: row.role || null,
    city: row.city || null,
    state: row.state || null,
    linkedin: row.linkedin || null,
    website: row.website || null,
    company_domain: domain || null,
    vertical: row.vertical || null,
    source: row.source || 'sqlite_migrate',
    tags: row.tags || null,
    outbound_status: row.outbound_status || 'uncontacted',
    enrich_status: mapEnrich(row.enrich_status) || 'none',
    icp_status: mapIcp(row.icp_status) || 'none',
    email_origin: mapOrigin(row.email_origin) || 'unknown',
    opener: row.opener || null,
    opener_track: row.opener_track || null,
    opener_kind: row.opener_kind || null,
    cohort_tag: row.cohort_tag || null,
    pipeline_campaign_id: row.pipeline_campaign_id || null,
    review_count: row.review_count ?? null,
    hours_label: row.hours_label || null,
    after_hours: row.after_hours == null ? null : Boolean(row.after_hours),
    capture_crack: row.capture_crack || null,
    is_archived: row.is_archived === true || row.is_archived === 1 || row.is_archived === '1',
    updated_at: now,
    mirrored_at: now
  }
  if (emailMatch) {
    // Non-destructive update: Supabase already has this contact (agents,
    // Instantly sync). Only carry over fields SQLite actually holds; never
    // null a Supabase value from a blank SQLite cell.
    const update = {}
    for (const [field, value] of Object.entries(patch)) {
      if (field === 'updated_at' || field === 'mirrored_at') {
        update[field] = value
        continue
      }
      if (value === null || value === '' || value === undefined) continue
      update[field] = value
    }
    // outbound_status only ever upgrades: fill blank/uncontacted, or promote
    // to a HOT status. Never downgrade in_instantly/contacted to uncontacted.
    const existingStatus = String(emailMatch.outbound_status || '')
    const incomingStatus = String(row.outbound_status || '')
    const existingBlank = !existingStatus || existingStatus === 'uncontacted'
    if (!incomingStatus || (!existingBlank && !HOT.has(incomingStatus)) || HOT.has(existingStatus)) {
      delete update.outbound_status
    }
    if (emailMatch.icp_status === 'skip') update.icp_status = 'skip'
    if (row.is_archived === true || row.is_archived === 1 || row.is_archived === '1') {
      update.is_archived = true
    } else {
      delete update.is_archived
    }
    return { action: 'update', key: email, id: emailMatch.id, patch: update }
  }
  if (domain && lookups.byDomain.get(domain)) {
    return { action: 'company_dupe', key: email, existing_id: lookups.byDomain.get(domain).id }
  }
  if (cityKey && lookups.byCompanyCity.get(cityKey)) {
    return { action: 'company_dupe', key: email, existing_id: lookups.byCompanyCity.get(cityKey).id }
  }
  return {
    action: 'insert',
    key: email,
    row: {
      id: row.id || `contact-${crypto.randomUUID()}`,
      created_at: row.created_at || now,
      lead_status_source: 'sqlite_migrate',
      recontact_ok: row.recontact_ok == null ? 1 : row.recontact_ok,
      ...patch
    }
  }
}

async function main() {
  const file = dbPath()
  if (!fs.existsSync(file)) {
    console.error(`SQLite not found: ${file}`)
    process.exit(1)
  }
  const env = { ...readEnvLocal(), ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = new DatabaseSync(file)
  const rows = sqliteRows(db)
  console.log(`sqlite rows: ${rows.length}${dryRun ? ' (dry-run)' : ''}`)

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  // Load real Supabase state in dry-run too, so the preview matches the run.
  const existing = await loadExisting(admin)
  const lookups = { byEmail: new Map(), byDomain: new Map(), byCompanyCity: new Map() }
  for (const row of existing) remember(lookups, row)

  const inserts = []
  const updates = []
  const skipped = []
  for (const row of rows) {
    const decision = decide(row, lookups)
    if (decision.action === 'skip' || decision.action === 'company_dupe') {
      skipped.push(decision)
      continue
    }
    if (decision.action === 'insert') {
      inserts.push(decision)
      remember(lookups, {
        id: decision.row.id,
        email: decision.row.email,
        company: decision.row.company,
        city: decision.row.city,
        company_domain: decision.row.company_domain,
        outbound_status: decision.row.outbound_status,
        icp_status: decision.row.icp_status
      })
    } else {
      updates.push(decision)
    }
  }

  let inserted = 0
  let updated = 0
  if (!dryRun) {
    for (const slice of chunk(inserts, WRITE_BATCH)) {
      await withRetry(`insert batch at ${inserted}`, async () => {
        // Upsert on id so a retry after a timed-out-but-landed batch is a no-op.
        const { error } = await admin
          .from('lead_contacts')
          .upsert(slice.map((item) => item.row), { onConflict: 'id' })
          .abortSignal(AbortSignal.timeout(60000))
        if (error) throw new Error(`insert failed: ${error.message}`)
      })
      inserted += slice.length
      if (inserted % 1000 === 0 || inserted === inserts.length) {
        console.log(`inserted ${inserted}/${inserts.length}`)
      }
    }
    // Bounded concurrency: 10k single-row updates in sequence is ~1h against
    // an ap-northeast-1 database; 8 in flight brings it under 10 minutes.
    const CONCURRENCY = 8
    let cursor = 0
    const worker = async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= updates.length) return
        const item = updates[index]
        await withRetry(`update ${item.id}`, async () => {
          const { error } = await admin
            .from('lead_contacts')
            .update(item.patch)
            .eq('id', item.id)
            .abortSignal(AbortSignal.timeout(30000))
          if (error) throw new Error(`update failed: ${error.message}`)
        })
        updated += 1
        if (updated % 500 === 0 || updated === updates.length) {
          console.log(`updated ${updated}/${updates.length}`)
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  } else {
    inserted = inserts.length
    updated = updates.length
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        sqlite: rows.length,
        inserted,
        updated,
        skipped: skipped.length,
        skipReasons: skipped.reduce((acc, row) => {
          const reason = row.reason || row.action
          acc[reason] = (acc[reason] || 0) + 1
          return acc
        }, {})
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
