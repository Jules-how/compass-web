/** Capture-first ICP fields on lead_contacts. Separate from enrich_status. */

export const ICP_STATUSES = ['none', 'pass', 'thin', 'skip'] as const
export type IcpStatus = (typeof ICP_STATUSES)[number]

export const EMAIL_ORIGINS = ['unknown', 'published', 'guessed'] as const
export type EmailOrigin = (typeof EMAIL_ORIGINS)[number]

export const LIVE_OUTBOUND_OFFER_KEY = 'installation-booking'
export const LIVE_OUTBOUND_OFFER_KEYS = [LIVE_OUTBOUND_OFFER_KEY] as const

export const MAX_CAPTURE_CRACK = 280
export const MAX_HOURS_LABEL = 120

const ICP_SET = new Set<string>(ICP_STATUSES)
const ORIGIN_SET = new Set<string>(EMAIL_ORIGINS)

export function isIcpStatus(value: string): value is IcpStatus {
  return ICP_SET.has(value)
}

export function isEmailOrigin(value: string): value is EmailOrigin {
  return ORIGIN_SET.has(value)
}

export function isIcpSkip(status: string | null | undefined): boolean {
  return (status || '').trim() === 'skip'
}

export function parseIcpStatus(
  value: unknown
): { ok: true; status: IcpStatus } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, status: 'none' }
  if (typeof value !== 'string') return { ok: false, error: 'icp_status_invalid' }
  const status = value.trim()
  if (!isIcpStatus(status)) return { ok: false, error: 'icp_status_invalid' }
  return { ok: true, status }
}

export function parseEmailOrigin(
  value: unknown
): { ok: true; origin: EmailOrigin } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, origin: 'unknown' }
  if (typeof value !== 'string') return { ok: false, error: 'email_origin_invalid' }
  const origin = value.trim()
  if (!isEmailOrigin(origin)) return { ok: false, error: 'email_origin_invalid' }
  return { ok: true, origin }
}

export function parseReviewCount(
  value: unknown
): { ok: true; count: number | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, count: null }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100000) {
    return { ok: false, error: 'review_count_invalid' }
  }
  return { ok: true, count: n }
}

export function parseHoursLabel(
  value: unknown
): { ok: true; label: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, label: null }
  if (typeof value !== 'string') return { ok: false, error: 'hours_label_invalid' }
  const label = value.trim()
  if (!label) return { ok: true, label: null }
  if (label.length > MAX_HOURS_LABEL) return { ok: false, error: 'hours_label_too_long' }
  if (label.includes('—')) return { ok: false, error: 'hours_label_em_dash' }
  return { ok: true, label }
}

export function parseAfterHours(
  value: unknown
): { ok: true; afterHours: boolean | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, afterHours: null }
  if (typeof value === 'boolean') return { ok: true, afterHours: value }
  if (value === '1' || value === 'true') return { ok: true, afterHours: true }
  if (value === '0' || value === 'false') return { ok: true, afterHours: false }
  return { ok: false, error: 'after_hours_invalid' }
}

export function parseCaptureCrack(
  value: unknown
): { ok: true; crack: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, crack: null }
  if (typeof value !== 'string') return { ok: false, error: 'capture_crack_invalid' }
  const crack = value.trim()
  if (!crack) return { ok: true, crack: null }
  if (crack.length > MAX_CAPTURE_CRACK) return { ok: false, error: 'capture_crack_too_long' }
  if (crack.includes('—')) return { ok: false, error: 'capture_crack_em_dash' }
  return { ok: true, crack }
}

export type LeadIcpPatch = {
  icp_status?: IcpStatus
  review_count?: number | null
  hours_label?: string | null
  after_hours?: boolean | null
  capture_crack?: string | null
  email_origin?: EmailOrigin
}

export function applyLeadIcpFields(
  body: Record<string, unknown>,
  patch: Record<string, unknown>
): { ok: true } | { ok: false; error: string } {
  if (body.icp_status !== undefined) {
    const parsed = parseIcpStatus(body.icp_status)
    if (!parsed.ok) return parsed
    patch.icp_status = parsed.status
  }
  if (body.review_count !== undefined) {
    const parsed = parseReviewCount(body.review_count)
    if (!parsed.ok) return parsed
    patch.review_count = parsed.count
  }
  if (body.hours_label !== undefined) {
    const parsed = parseHoursLabel(body.hours_label)
    if (!parsed.ok) return parsed
    patch.hours_label = parsed.label
  }
  if (body.after_hours !== undefined) {
    const parsed = parseAfterHours(body.after_hours)
    if (!parsed.ok) return parsed
    patch.after_hours = parsed.afterHours
  }
  if (body.capture_crack !== undefined) {
    const parsed = parseCaptureCrack(body.capture_crack)
    if (!parsed.ok) return parsed
    patch.capture_crack = parsed.crack
  }
  if (body.email_origin !== undefined) {
    const parsed = parseEmailOrigin(body.email_origin)
    if (!parsed.ok) return parsed
    patch.email_origin = parsed.origin
  }
  return { ok: true }
}

export function offerKeysForPicker(current?: string | null): string[] {
  const keys: string[] = [...LIVE_OUTBOUND_OFFER_KEYS]
  const cur = (current || '').trim()
  if (cur && !keys.includes(cur)) keys.push(cur)
  return keys
}

export function humanizeIcpStatus(status: string | null | undefined): string {
  const s = (status || '').trim()
  if (s === 'pass') return 'Pass'
  if (s === 'thin') return 'Thin'
  if (s === 'skip') return 'Skip'
  if (s === 'none' || !s) return ''
  return s
}

export function humanizeEmailOrigin(origin: string | null | undefined): string {
  const s = (origin || '').trim()
  if (s === 'published') return 'Published'
  if (s === 'guessed') return 'Guessed'
  if (s === 'unknown' || !s) return ''
  return s
}
