/**
 * CRM / campaign lead grid columns.
 * Instantly-aligned fields, plus Compass research (opener, facts) and CRM extras.
 * Empty columns stay hidden unless the operator pins them in the picker.
 */

export const LEAD_COLUMN_STORAGE_KEY = 'compass.leadColumns.v4'
export const CAMPAIGN_LEAD_COLUMN_STORAGE_KEY = 'compass.campaignLeadColumns.v2'
export const LEAD_COLUMN_WIDTHS_KEY = 'compass.leadColumnWidths.v1'
export const LEAD_COLUMN_PINNED_KEY = 'compass.leadColumnsPinned.v1'
export const LEAD_COLUMN_HIDDEN_KEY = 'compass.leadColumnsHidden.v1'
export const LEAD_COLUMN_ORDER_KEY = 'compass.leadColumnOrder.v1'

export type LeadColumnPreset = 'crm' | 'campaign'

export type LeadColumnId =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'job_title'
  | 'company'
  | 'location'
  | 'website'
  | 'linkedin'
  | 'phone'
  | 'opener'
  | 'lead_facts'
  | 'status'
  | 'categories'
  | 'last_touch'
  | 'strength'
  | 'source'
  | 'campaign'
  | 'vertical'

export type LeadColumnDef = {
  id: LeadColumnId
  label: string
  defaultWidth: number
}

export const LEAD_COLUMN_DEFS: LeadColumnDef[] = [
  { id: 'first_name', label: 'First name', defaultWidth: 140 },
  { id: 'last_name', label: 'Last name', defaultWidth: 140 },
  { id: 'email', label: 'Email', defaultWidth: 220 },
  { id: 'job_title', label: 'Job title', defaultWidth: 160 },
  { id: 'company', label: 'Company', defaultWidth: 180 },
  { id: 'location', label: 'Location', defaultWidth: 140 },
  { id: 'website', label: 'Website', defaultWidth: 160 },
  { id: 'linkedin', label: 'LinkedIn', defaultWidth: 180 },
  { id: 'phone', label: 'Phone', defaultWidth: 140 },
  { id: 'opener', label: 'Opener', defaultWidth: 280 },
  { id: 'lead_facts', label: 'Facts', defaultWidth: 240 },
  { id: 'status', label: 'Status', defaultWidth: 140 },
  { id: 'categories', label: 'Categories', defaultWidth: 220 },
  { id: 'last_touch', label: 'Last interaction', defaultWidth: 160 },
  { id: 'strength', label: 'Connection strength', defaultWidth: 170 },
  { id: 'source', label: 'Source', defaultWidth: 120 },
  { id: 'campaign', label: 'Campaign', defaultWidth: 180 },
  { id: 'vertical', label: 'Vertical', defaultWidth: 140 }
]

export const CRM_REQUIRED_COLUMNS: LeadColumnId[] = ['first_name', 'last_name', 'company']
export const CAMPAIGN_REQUIRED_COLUMNS: LeadColumnId[] = [
  'first_name',
  'last_name',
  'opener',
  'lead_facts'
]

export const CRM_DEFAULT_COLUMNS: LeadColumnId[] = [
  'first_name',
  'last_name',
  'company',
  'categories',
  'last_touch',
  'strength'
]

export const CAMPAIGN_DEFAULT_COLUMNS: LeadColumnId[] = [
  'first_name',
  'last_name',
  'email',
  'website',
  'opener',
  'lead_facts'
]

export const DEFAULT_VISIBLE_LEAD_COLUMNS: LeadColumnId[] = [...CRM_DEFAULT_COLUMNS]

export const MIN_LEAD_COLUMN_WIDTH = 80
export const MAX_LEAD_COLUMN_WIDTH = 480

export function isLeadColumnId(value: string): value is LeadColumnId {
  return LEAD_COLUMN_DEFS.some((c) => c.id === value)
}

export function requiredColumnsFor(preset: LeadColumnPreset): LeadColumnId[] {
  return preset === 'campaign' ? CAMPAIGN_REQUIRED_COLUMNS : CRM_REQUIRED_COLUMNS
}

export function defaultColumnsFor(preset: LeadColumnPreset): LeadColumnId[] {
  return preset === 'campaign' ? [...CAMPAIGN_DEFAULT_COLUMNS] : [...CRM_DEFAULT_COLUMNS]
}

export function storageKeyFor(preset: LeadColumnPreset): string {
  return preset === 'campaign' ? CAMPAIGN_LEAD_COLUMN_STORAGE_KEY : LEAD_COLUMN_STORAGE_KEY
}

export function pinnedKeyFor(preset: LeadColumnPreset): string {
  return `${LEAD_COLUMN_PINNED_KEY}.${preset}`
}

export function hiddenKeyFor(preset: LeadColumnPreset): string {
  return `${LEAD_COLUMN_HIDDEN_KEY}.${preset}`
}

export function orderKeyFor(preset: LeadColumnPreset): string {
  return `${LEAD_COLUMN_ORDER_KEY}.${preset}`
}

function readIdList(key: string): LeadColumnId[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter((v): v is LeadColumnId => typeof v === 'string' && isLeadColumnId(v))
    return ids.length ? ids : null
  } catch {
    return null
  }
}

export function loadVisibleLeadColumns(preset: LeadColumnPreset = 'crm'): LeadColumnId[] {
  return readIdList(storageKeyFor(preset)) ?? defaultColumnsFor(preset)
}

export function loadPinnedLeadColumns(preset: LeadColumnPreset = 'crm'): LeadColumnId[] {
  return readIdList(pinnedKeyFor(preset)) ?? []
}

export function loadHiddenLeadColumns(preset: LeadColumnPreset = 'crm'): LeadColumnId[] {
  return readIdList(hiddenKeyFor(preset)) ?? []
}

export function persistVisibleLeadColumns(ids: LeadColumnId[], preset: LeadColumnPreset = 'crm') {
  if (typeof window === 'undefined') return
  const required = requiredColumnsFor(preset)
  const seen = new Set<LeadColumnId>()
  const next: LeadColumnId[] = []
  for (const id of ids) {
    if (!isLeadColumnId(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  for (const id of required) {
    if (!seen.has(id)) next.push(id)
  }
  window.localStorage.setItem(storageKeyFor(preset), JSON.stringify(next))
}

export function loadLeadColumnOrder(preset: LeadColumnPreset = 'crm'): LeadColumnId[] {
  return readIdList(orderKeyFor(preset)) ?? defaultColumnsFor(preset)
}

export function persistLeadColumnOrder(ids: LeadColumnId[], preset: LeadColumnPreset = 'crm') {
  if (typeof window === 'undefined') return
  const seen = new Set<LeadColumnId>()
  const next: LeadColumnId[] = []
  for (const id of ids) {
    if (!isLeadColumnId(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  window.localStorage.setItem(orderKeyFor(preset), JSON.stringify(next))
}

export function applyColumnOrder(visible: LeadColumnId[], order: LeadColumnId[]): LeadColumnId[] {
  const remaining = new Set(visible)
  const next: LeadColumnId[] = []
  for (const id of order) {
    if (!remaining.has(id)) continue
    remaining.delete(id)
    next.push(id)
  }
  for (const id of visible) {
    if (!remaining.has(id)) continue
    remaining.delete(id)
    next.push(id)
  }
  return next
}

export function persistPinnedLeadColumns(ids: LeadColumnId[], preset: LeadColumnPreset = 'crm') {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(pinnedKeyFor(preset), JSON.stringify(ids.filter(isLeadColumnId)))
}

export function persistHiddenLeadColumns(ids: LeadColumnId[], preset: LeadColumnPreset = 'crm') {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(hiddenKeyFor(preset), JSON.stringify(ids.filter(isLeadColumnId)))
}

export function resolveVisibleLeadColumns(opts: {
  preset: LeadColumnPreset
  occupied: LeadColumnId[]
  pinned: LeadColumnId[]
  hidden: LeadColumnId[]
  order?: LeadColumnId[]
}): LeadColumnId[] {
  const required = requiredColumnsFor(opts.preset)
  const occupied = new Set(opts.occupied)
  const pinned = new Set(opts.pinned)
  const hidden = new Set(opts.hidden)
  const visible = LEAD_COLUMN_DEFS.map((c) => c.id).filter((id) => {
    if (required.includes(id)) return true
    if (hidden.has(id)) return false
    return pinned.has(id) || occupied.has(id)
  })
  return applyColumnOrder(visible, opts.order ?? defaultColumnsFor(opts.preset))
}

export function loadLeadColumnWidths(): Partial<Record<LeadColumnId, number>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LEAD_COLUMN_WIDTHS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Partial<Record<LeadColumnId, number>> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isLeadColumnId(key) || typeof value !== 'number' || !Number.isFinite(value)) continue
      out[key] = Math.min(MAX_LEAD_COLUMN_WIDTH, Math.max(MIN_LEAD_COLUMN_WIDTH, Math.round(value)))
    }
    return out
  } catch {
    return {}
  }
}

export function persistLeadColumnWidths(widths: Partial<Record<LeadColumnId, number>>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LEAD_COLUMN_WIDTHS_KEY, JSON.stringify(widths))
}

export function columnWidth(
  id: LeadColumnId,
  widths: Partial<Record<LeadColumnId, number>>
): number {
  const def = LEAD_COLUMN_DEFS.find((c) => c.id === id)
  return widths[id] ?? def?.defaultWidth ?? 140
}

/** Relative / compact timestamps for dense CRM rows. */
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
