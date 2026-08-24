// Shared helpers for the lead upload flow. Mirrors the normalization +
// column-mapping logic in apps/compass/src/main/leads/lead-import.ts so the
// web import writes the same normalized values the desktop would.

// Normalise to AU E164. Mirrors lead-import.ts normalizePhone so dedupe keys
// match the rest of the app. Empty input -> ''.
export function normalizePhone(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (trimmed.startsWith('+')) return '+' + digits
  if (digits.startsWith('61')) return '+' + digits
  if (digits.startsWith('0')) return '+61' + digits.slice(1)
  return '+61' + digits
}

export function normalizeEmail(raw: string): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function normalizeLinkedin(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '')
    .toLowerCase()
}

// CSV header -> lead_contacts field mapping. Accepts the column labels used by
// Prospeo / Origami / Vibe exports plus shorter aliases. The first matching
// header wins; unknown headers are ignored.
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['Full name', 'full name', 'Name', 'name', 'First name', 'first name', 'first_name', 'owner_first', 'owner first name'],
  email: ['Email', 'email', 'Email address', 'email address', 'Work email', 'work email', 'published_email', 'published email'],
  phone: ['Mobile', 'mobile', 'Phone', 'phone', 'Phone number', 'phone number', 'Mobile phone', 'mobile phone'],
  company: ['Company name', 'company name', 'Company', 'company', 'Company Name', 'Employer', 'trading_name', 'trading name'],
  role: ['Job title', 'job title', 'Role', 'role', 'Title', 'title', 'Position'],
  linkedin: ['Person LinkedIn URL', 'person linkedin url', 'LinkedIn', 'linkedin', 'Linkedin URL', 'linkedin url', 'LinkedIn URL'],
  city: ['Person city', 'person city', 'City', 'city', 'Location', 'location', 'suburb', 'Suburb'],
  state: ['Person state', 'person state', 'State', 'state', 'Region', 'region', 'Province'],
  vertical: ['Vertical', 'vertical', 'Industry', 'industry', 'Category', 'category'],
  website: ['Website', 'website', 'Company website', 'company website', 'URL', 'url', 'Domain', 'domain', 'Company domain'],
  cluster: ['cluster', 'Cluster', 'cohort', 'cohort_tag', 'Cohort']
}

export interface MappedLeadRow {
  name: string
  email: string
  phone: string
  company: string
  role: string
  linkedin: string
  city: string
  state: string
  vertical: string
  website: string
  cluster: string
}

function lookup(raw: Record<string, string | undefined>, aliases: string[]): string {
  // First pass: exact (case-insensitive) header match.
  for (const alias of aliases) {
    for (const key of Object.keys(raw)) {
      if (key.toLowerCase() === alias.toLowerCase()) {
        const val = raw[key]
        if (val != null && String(val).trim()) return String(val).trim()
      }
    }
  }
  // Second pass: substring match for aliases that include a distinctive token
  // (e.g. "linkedin" or "city"), so exports with extra prefix/suffix still map.
  for (const alias of aliases) {
    const lower = alias.toLowerCase()
    if (lower.length < 4) continue // avoid greedy matches on short labels
    for (const key of Object.keys(raw)) {
      if (key.toLowerCase().includes(lower)) {
        const val = raw[key]
        if (val != null && String(val).trim()) return String(val).trim()
      }
    }
  }
  return ''
}

export function mapCsvRow(raw: Record<string, string | undefined>): MappedLeadRow {
  return {
    name: lookup(raw, COLUMN_ALIASES.name),
    email: lookup(raw, COLUMN_ALIASES.email),
    phone: lookup(raw, COLUMN_ALIASES.phone),
    company: lookup(raw, COLUMN_ALIASES.company),
    role: lookup(raw, COLUMN_ALIASES.role),
    linkedin: lookup(raw, COLUMN_ALIASES.linkedin),
    city: lookup(raw, COLUMN_ALIASES.city),
    state: lookup(raw, COLUMN_ALIASES.state),
    vertical: lookup(raw, COLUMN_ALIASES.vertical),
    website: lookup(raw, COLUMN_ALIASES.website),
    cluster: lookup(raw, COLUMN_ALIASES.cluster)
  }
}

const TRADE_FILENAME_PREFIX =
  /^(plumber|hvac|electrician|locksmith|pest|towing|garage)-(.+)$/i

/** `{trade}-{cluster}.csv` → cluster slug. Empty if the name does not match. */
export function clusterFromFilename(filename: string | null | undefined): string {
  const base = String(filename ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.csv$/i, '')
    .trim()
  const match = base.match(TRADE_FILENAME_PREFIX)
  return match?.[2]?.trim() || ''
}

export function cohortTagForRow(
  mapped: Pick<MappedLeadRow, 'cluster'>,
  filename?: string | null
): string {
  return mapped.cluster.trim() || clusterFromFilename(filename)
}

export const LEAD_SOURCE_SERVICES = [
  'prospeo',
  'origami',
  'vibe',
  'manual',
  'other',
  'apify'
] as const

export type LeadSourceServiceTag = (typeof LEAD_SOURCE_SERVICES)[number]

export function isLeadSourceService(value: string): boolean {
  return (LEAD_SOURCE_SERVICES as readonly string[]).includes(value)
}

export type IngestSkipRow = { row: number; reason: string }

export function ingestSkipReason(mapped: MappedLeadRow): string | null {
  if (!normalizeEmail(mapped.email)) return 'missing email'
  if (!mapped.company.trim()) return 'missing company'
  return null
}
