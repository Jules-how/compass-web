import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const compassWebDir = path.resolve(__dirname, '..')
const dbPath = path.join(compassWebDir, 'data', 'compass.db')

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA synchronous = NORMAL;')

// Ensure tables exist
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
    vertical_tags TEXT DEFAULT '[]',
    location_tags TEXT DEFAULT '[]',
    copy_status TEXT DEFAULT 'draft',
    copy_cold_expression TEXT,
    copy_sequence_json TEXT,
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

  CREATE TABLE IF NOT EXISTS compass_settings (
    id TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );
`)

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

function deriveCleanName(rawName, rawFirstName, rawCompany, email) {
  const companyClean = cleanTradeCompanyName(rawCompany)
  const candidate = (rawFirstName || rawName || '').trim()

  if (candidate.toLowerCase().endsWith('team')) {
    return candidate
  }

  if (candidate && !isEmailHandleOrCorrupted(candidate, email)) {
    const firstWord = candidate.split(/\s+/)[0]
    if (firstWord && /^[A-Z][a-z'-]+$/i.test(firstWord) && !firstWord.toLowerCase().endsWith("'s")) {
      return firstWord
    }
  }

  if (companyClean) {
    const shortCompany = companyClean.split(/\s+/).slice(0, 2).join(' ')
    return `${shortCompany} team`
  }
  return 'team'
}

console.log('--- Seeding Clean Australian Trade Lead Lists ---')

const openersOutDir = path.join(rootDir, 'cold-email', 'openers', 'out')
const files = fs.readdirSync(openersOutDir).filter(f => f.endsWith('.csv'))

const insertLead = db.prepare(`
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
    name = excluded.name,
    phone = excluded.phone,
    company = excluded.company,
    vertical = excluded.vertical,
    city = excluded.city,
    state = excluded.state,
    website = excluded.website,
    review_count = excluded.review_count,
    opener = excluded.opener,
    email_verify_status = excluded.email_verify_status,
    cohort_tag = excluded.cohort_tag,
    outbound_status = excluded.outbound_status,
    instantly_campaign_id = excluded.instantly_campaign_id,
    instantly_campaign_name = excluded.instantly_campaign_name,
    is_archived = excluded.is_archived,
    updated_at = excluded.updated_at
`)

// Live Instantly Sydney plumber campaign
const sydneyCampaignId = 'd9f95f4b-ba35-4200-9fb3-a923f051876b'
const sydneyCampaignName = 'Plumbers | Greater Sydney | 150 | capture 22 aug'

let leadCount = 0

for (const filename of files) {
  const filePath = path.join(openersOutDir, filename)
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: 'greedy' })

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

  const isSydneyCampaignFile = filename === 'plumber-sydney.csv'
  const cohortTag = filename.replace(/\.csv$/i, '')
  const now = new Date().toISOString()

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

    const id = `lead-${email.replace(/[^a-zA-Z0-9]/g, '_')}`
    const outboundStatus = isSydneyCampaignFile ? 'in_instantly' : 'uncontacted'
    const instantlyCampaignId = isSydneyCampaignFile ? sydneyCampaignId : null
    const instantlyCampaignName = isSydneyCampaignFile ? sydneyCampaignName : null

    insertLead.run(
      id,
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
      outboundStatus,
      instantlyCampaignName,
      instantlyCampaignId,
      instantlyCampaignName,
      null, // instantly_lead_id
      isSydneyCampaignFile ? '2026-08-21T11:10:29.704Z' : null,
      isSydneyCampaignFile ? '2026-08-21T11:10:29.704Z' : null,
      'local_file',
      null,
      1,
      null,
      isSydneyCampaignFile ? '2026-08-21T23:30:00.000Z' : null,
      null,
      null,
      now,
      now,
      now,
      null,
      isSydneyCampaignFile ? 'campaign-plumbers-sydney-aug' : null,
      cohortTag,
      'ready',
      opener,
      null,
      website,
      null,
      emailVerifyStatus,
      now,
      null,
      null,
      'qualified',
      reviewCount,
      null,
      opener && opener.toLowerCase().includes('24 hours') ? 1 : null,
      null,
      'gmaps',
      0 // is_archived = 0 for active trade leads
    )
    leadCount++
  }
}

console.log(`Seeded ${leadCount} clean trade leads into local SQLite database.`);

// Seed core pipeline campaigns matching trade ICP
const insertCampaign = db.prepare(`
  INSERT INTO compass_pipeline_campaigns (
    id, name, status, priority, health, start_date, end_date, go_live_at, color, summary,
    labels, owner_label, instantly_campaign_id, offer_key, structure_id, opener_mode,
    vertical_tags, location_tags, copy_status, copy_cold_expression, copy_sequence_json,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    status = excluded.status,
    go_live_at = excluded.go_live_at,
    instantly_campaign_id = excluded.instantly_campaign_id,
    vertical_tags = excluded.vertical_tags,
    location_tags = excluded.location_tags,
    copy_status = excluded.copy_status,
    updated_at = excluded.updated_at
`)

const campaigns = [
  {
    id: 'campaign-plumbers-sydney-aug',
    name: 'Plumbers | Greater Sydney | 150 | capture 22 aug',
    status: 'active',
    priority: 1,
    health: 'on_track',
    start_date: '2026-08-21',
    go_live_at: '2026-08-21T11:00:00.000Z',
    instantly_campaign_id: 'd9f95f4b-ba35-4200-9fb3-a923f051876b',
    vertical_tags: ['plumber', 'trades'],
    location_tags: ['Sydney', 'NSW'],
    copy_status: 'ready'
  },
  {
    id: 'campaign-hvac-au-aug24',
    name: 'HVAC | AU | 50 | capture 24 aug',
    status: 'planned',
    priority: 2,
    health: 'on_track',
    start_date: '2026-08-24',
    go_live_at: '2026-08-24T08:00:00.000Z',
    instantly_campaign_id: 'b3f7d35d-22cd-4be1-bf2a-a48b021ec83d',
    vertical_tags: ['hvac', 'trades'],
    location_tags: ['Darwin', 'Melbourne', 'Adelaide'],
    copy_status: 'ready'
  },
  {
    id: 'campaign-plumbers-brisbane-aug',
    name: 'Plumbers Missed Call Booking Brisbane | 150 | Aug',
    status: 'planned',
    priority: 3,
    health: 'on_track',
    start_date: '2026-08-25',
    go_live_at: '2026-08-25T08:00:00.000Z',
    instantly_campaign_id: 'b40eaeea-eb5d-4d9f-b55b-94d0f3ce009c',
    vertical_tags: ['plumber', 'trades'],
    location_tags: ['Brisbane', 'QLD'],
    copy_status: 'ready'
  },
  {
    id: 'campaign-electricians-aug2026',
    name: 'Electricians | Aug 2026',
    status: 'planned',
    priority: 4,
    health: 'no_updates',
    start_date: '2026-08-26',
    go_live_at: '2026-08-26T09:00:00.000Z',
    instantly_campaign_id: null,
    vertical_tags: ['electricians', 'trades'],
    location_tags: ['AU'],
    copy_status: 'draft'
  }
]

for (const c of campaigns) {
  insertCampaign.run(
    c.id,
    c.name,
    c.status,
    c.priority,
    c.health,
    c.start_date,
    null,
    c.go_live_at,
    '#ea580c',
    null,
    '[]',
    'Jules',
    c.instantly_campaign_id,
    'booked-jobs-system',
    null,
    'waterfall',
    JSON.stringify(c.vertical_tags),
    JSON.stringify(c.location_tags),
    c.copy_status,
    null,
    null,
    new Date().toISOString(),
    new Date().toISOString()
  )
}

console.log('Seeded pipeline campaigns.')
console.log('--- Done ---')
