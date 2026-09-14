/** Explicit source-backed corrections; ordinary import never changes identity. */
export type IdentityReview = {
  kind: 'replace_invalid_email' | 'distinct_branch'
  existing_id: string
  expected_email: string
  source_url: string
  reason: string
  reviewed_at: string
  email_verified_at: string
  prior_contact_checked: true
  prior_contact_found: false
}

export function parseIdentityReview(input: unknown, now: string): IdentityReview | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const r = input as Record<string, unknown>
  if (!['replace_invalid_email', 'distinct_branch'].includes(String(r.kind))) return null
  for (const key of ['existing_id', 'expected_email', 'source_url', 'reason', 'reviewed_at', 'email_verified_at']) {
    if (typeof r[key] !== 'string' || !String(r[key]).trim()) return null
  }
  if (r.prior_contact_checked !== true || r.prior_contact_found !== false) return null
  try { if (!['https:', 'http:'].includes(new URL(String(r.source_url)).protocol)) return null } catch { return null }
  for (const key of ['reviewed_at', 'email_verified_at']) {
    const date = Date.parse(String(r[key]))
    if (!Number.isFinite(date) || date > Date.parse(now) || date < Date.parse(now) - 30 * 86400000) return null
  }
  return r as IdentityReview
}
