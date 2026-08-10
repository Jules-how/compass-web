/**
 * CRM lead table column registry + operator-visible column prefs.
 * Defaults stay lean; optional columns can be toggled (Attio-style).
 */

export const LEAD_COLUMN_STORAGE_KEY = 'compass.leadColumns.v2'

export type LeadColumnId =
  | 'name'
  | 'email'
  | 'phone'
  | 'company'
  | 'location'
  | 'vertical'
  | 'campaign'
  | 'stage'
  | 'cooldown'
  | 'last_touch'
  | 'date_added'
  | 'source'
  | 'role'
  | 'linkedin'

export type LeadColumnDef = {
  id: LeadColumnId
  label: string
  /** Always shown — cannot be hidden via the column picker. */
  required?: boolean
  /** Default visibility for new operators. */
  defaultVisible: boolean
}

export const LEAD_COLUMN_DEFS: LeadColumnDef[] = [
  { id: 'name', label: 'Name', required: true, defaultVisible: true },
  { id: 'email', label: 'Email', defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: false },
  { id: 'company', label: 'Company', defaultVisible: true },
  { id: 'location', label: 'Location', defaultVisible: false },
  { id: 'vertical', label: 'Vertical', defaultVisible: true },
  { id: 'campaign', label: 'Campaign', defaultVisible: false },
  { id: 'stage', label: 'Stage', defaultVisible: true },
  { id: 'cooldown', label: 'Recontact', defaultVisible: true },
  { id: 'last_touch', label: 'Last interaction', defaultVisible: true },
  { id: 'date_added', label: 'Date added', defaultVisible: true },
  { id: 'source', label: 'Source', defaultVisible: false },
  { id: 'role', label: 'Role', defaultVisible: false },
  { id: 'linkedin', label: 'LinkedIn', defaultVisible: false }
]

export const DEFAULT_VISIBLE_LEAD_COLUMNS: LeadColumnId[] = LEAD_COLUMN_DEFS.filter(
  (c) => c.defaultVisible
).map((c) => c.id)

export function isLeadColumnId(value: string): value is LeadColumnId {
  return LEAD_COLUMN_DEFS.some((c) => c.id === value)
}

export function loadVisibleLeadColumns(): LeadColumnId[] {
  if (typeof window === 'undefined') return [...DEFAULT_VISIBLE_LEAD_COLUMNS]
  try {
    const raw = window.localStorage.getItem(LEAD_COLUMN_STORAGE_KEY)
    if (!raw) return [...DEFAULT_VISIBLE_LEAD_COLUMNS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_LEAD_COLUMNS]
    const ids = parsed.filter((v): v is LeadColumnId => typeof v === 'string' && isLeadColumnId(v))
    // Always keep required columns.
    for (const def of LEAD_COLUMN_DEFS) {
      if (def.required && !ids.includes(def.id)) ids.unshift(def.id)
    }
    return ids.length ? ids : [...DEFAULT_VISIBLE_LEAD_COLUMNS]
  } catch {
    return [...DEFAULT_VISIBLE_LEAD_COLUMNS]
  }
}

export function persistVisibleLeadColumns(ids: LeadColumnId[]) {
  if (typeof window === 'undefined') return
  const next = [...ids]
  for (const def of LEAD_COLUMN_DEFS) {
    if (def.required && !next.includes(def.id)) next.unshift(def.id)
  }
  window.localStorage.setItem(LEAD_COLUMN_STORAGE_KEY, JSON.stringify(next))
}

/** Relative / compact timestamps for dense CRM rows (Attio-style phrasing). */
export function formatRelativeLeadDate(
  value: string | null | undefined,
  now = new Date(),
  emptyLabel = 'No contact'
): string {
  if (!value) return emptyLabel
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return value
  const diff = now.getTime() - ms
  const abs = Math.abs(diff)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day
  if (abs < minute) return 'just now'
  if (abs < hour) {
    const n = Math.floor(abs / minute)
    return diff >= 0
      ? `${n} minute${n === 1 ? '' : 's'} ago`
      : `in ${n} minute${n === 1 ? '' : 's'}`
  }
  if (abs < day) {
    const n = Math.floor(abs / hour)
    return diff >= 0
      ? `about ${n} hour${n === 1 ? '' : 's'} ago`
      : `in about ${n} hour${n === 1 ? '' : 's'}`
  }
  if (abs < month) {
    const n = Math.floor(abs / day)
    return diff >= 0 ? `${n} day${n === 1 ? '' : 's'} ago` : `in ${n} day${n === 1 ? '' : 's'}`
  }
  const n = Math.max(1, Math.floor(abs / month))
  if (n < 12) {
    return diff >= 0
      ? `about ${n} month${n === 1 ? '' : 's'} ago`
      : `in about ${n} month${n === 1 ? '' : 's'}`
  }
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatShortLeadDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
