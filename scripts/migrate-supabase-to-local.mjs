import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const compassWebDir = path.resolve(__dirname, '..')
const dbPath = path.join(compassWebDir, 'data', 'compass.db')

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA synchronous = NORMAL;')

// Ensure is_archived column exists
try {
  db.exec('ALTER TABLE lead_contacts ADD COLUMN is_archived INTEGER DEFAULT 0;')
} catch {
  // column already exists
}
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_is_archived ON lead_contacts (is_archived);')

const env = fs.readFileSync(path.join(compassWebDir, '.env.local'), 'utf8')
let url = ''
let key = ''
env.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    url = line.split('=')[1].replace(/["']/g, '').trim()
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    key = line.split('=')[1].replace(/["']/g, '').trim()
  } else if (!key && line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
    key = line.split('=')[1].replace(/["']/g, '').trim()
  }
})

const supabase = createClient(url, key)

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase()
}

function normalizePhone(raw) {
  const trimmed = String(raw || '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (trimmed.startsWith('+')) return '+' + digits
  if (digits.startsWith('61')) return '+' + digits
  if (digits.startsWith('0')) return '+61' + digits.slice(1)
  return '+61' + digits
}

function cleanTradeCompanyName(raw) {
  let cleaned = (raw || '').trim()
  if (!cleaned) return ''
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim()
  cleaned = cleaned
    .replace(/\s+(Pty\s*Ltd|Pty\s*Limited|Proprietary\s*Limited|Services|Group|Pty|Ltd|LLC|Co\b)\.?$/i, '')
    .replace(/\s+(Pty\s*Ltd|Pty\s*Limited|Proprietary\s*Limited|Services|Group|Pty|Ltd|LLC)\b/gi, '')
    .trim()
  return cleaned
}

function isEmailHandleOrCorrupted(name, email) {
  if (!name || !name.trim()) return true
  const n = name.trim().toLowerCase()
  const emailLocal = (email || '').split('@')[0]?.toLowerCase() || ''
  if (emailLocal && n === emailLocal) return true
  if (/\d/.test(n) && !n.includes(' ')) return true
  if (['cpm', 'jobs', 'team', 'service', 'admin', 'info', 'reception', 'sales', 'none', 'unknown'].includes(n)) return true
  return false
}

function deriveCleanName(rawName, rawCompany, email) {
  const companyClean = cleanTradeCompanyName(rawCompany)
  const candidate = (rawName || '').trim()

  if (candidate.toLowerCase().endsWith('team')) {
    return candidate
  }

  if (candidate && !isEmailHandleOrCorrupted(candidate, email)) {
    const firstWord = candidate.split(/\s+/)[0]
    if (firstWord && /^[A-Z][a-z'-]+$/i.test(firstWord) && !firstWord.toLowerCase().endsWith("'s")) {
      return candidate.includes(' ') ? candidate : firstWord
    }
  }

  if (companyClean) {
    const shortCompany = companyClean.split(/\s+/).slice(0, 2).join(' ')
    return `${shortCompany} team`
  }
  return 'team'
}

console.log('--- Migrating Supabase Leads into Local SQLite Ledger ---')

// 1. First mark all existing local trade leads with is_archived = 0
const localTradeEmails = new Set()
const localTradeRows = db.prepare('SELECT email FROM lead_contacts').all()
for (const r of localTradeRows) {
  if (r.email) localTradeEmails.add(r.email.toLowerCase())
}
console.log(`Current active local leads: ${localTradeEmails.size}`)

// Active trade verticals
const ACTIVE_TRADE_VERTICALS = new Set(['plumber', 'hvac', 'electricians', 'locksmith', 'roofing'])

const upsertStmt = db.prepare(`
  INSERT INTO lead_contacts (
    id, name, email, phone, company, role, vertical, source, tags, city, state,
    linkedin, list_ids, import_batch_id, outbound_status, instantly_campaign,
    instantly_campaign_id, instantly_campaign_name, instantly_lead_id, instantly_uploaded_at,
    instantly_synced_at, lead_status_source, interest_label, recontact_ok, suppression_reason,
    last_outbound_at, lead_context_status, lead_context_updated_at, created_at, updated_at,
    mirrored_at, instantly_campaign_ids, pipeline_campaign_id, cohort_tag, enrich_status,
    opener, lead_facts, website, company_domain, email_verify_status, email_verified_at,
    opener_track, opener_kind, icp_status, review_count, hours_label, after_hours,
    capture_crack, email_origin, is_archived
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    name = CASE WHEN excluded.is_archived = 0 THEN excluded.name ELSE lead_contacts.name END,
    is_archived = CASE WHEN excluded.is_archived = 0 THEN 0 ELSE lead_contacts.is_archived END
`)

const BATCH_SIZE = 1000
let offset = 0
let totalMigrated = 0
let archivedCount = 0
let activeCount = 0

while (true) {
  console.log(`Fetching rows ${offset} to ${offset + BATCH_SIZE}...`)
  const { data, error } = await supabase
    .from('lead_contacts')
    .select('*')
    .order('mirrored_at', { ascending: false })
    .range(offset, offset + BATCH_SIZE - 1)

  if (error) {
    console.error('Supabase fetch error:', error)
    break
  }

  if (!data || data.length === 0) break

  for (const row of data) {
    const email = normalizeEmail(row.email)
    const phone = normalizePhone(row.phone)
    const company = cleanTradeCompanyName(row.company || '')
    const name = deriveCleanName(row.name || '', company, email)
    const vertical = (row.vertical || 'other').trim().toLowerCase()

    // Active if it's already in our local trade list OR if it's an active trade campaign
    const isLocalActive = email && localTradeEmails.has(email)
    const isArchived = isLocalActive ? 0 : 1

    if (isArchived === 1) archivedCount++
    else activeCount++

    upsertStmt.run(
      row.id,
      name,
      email || null,
      phone || null,
      company || null,
      row.role || null,
      vertical || 'other',
      row.source || null,
      row.tags || null,
      row.city || null,
      row.state || null,
      row.linkedin || null,
      row.list_ids || null,
      row.import_batch_id || null,
      row.outbound_status || 'uncontacted',
      row.instantly_campaign || null,
      row.instantly_campaign_id || null,
      row.instantly_campaign_name || null,
      row.instantly_lead_id || null,
      row.instantly_uploaded_at || null,
      row.instantly_synced_at || null,
      row.lead_status_source || null,
      row.interest_label || null,
      row.recontact_ok ?? 1,
      row.suppression_reason || null,
      row.last_outbound_at || null,
      row.lead_context_status || null,
      row.lead_context_updated_at || null,
      row.created_at || new Date().toISOString(),
      row.updated_at || new Date().toISOString(),
      row.mirrored_at || new Date().toISOString(),
      row.instantly_campaign_ids || null,
      row.pipeline_campaign_id || null,
      row.cohort_tag || null,
      row.enrich_status || null,
      row.opener || null,
      row.lead_facts ? JSON.stringify(row.lead_facts) : null,
      row.website || null,
      row.company_domain || null,
      row.email_verify_status || null,
      row.email_verified_at || null,
      row.opener_track || null,
      row.opener_kind || null,
      row.icp_status || null,
      row.review_count || null,
      row.hours_label || null,
      row.after_hours ? 1 : 0,
      row.capture_crack || null,
      row.email_origin || null,
      isArchived
    )
    totalMigrated++
  }

  if (data.length < BATCH_SIZE) break
  offset += BATCH_SIZE
}

console.log(`\n=== Migration Complete ===`)
console.log(`Total Leads in SQLite: ${totalMigrated}`)
console.log(`Active Leads: ${activeCount}`)
console.log(`Archived Leads: ${archivedCount}`)
