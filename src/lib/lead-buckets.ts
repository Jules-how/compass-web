/** Leads vs Prospects vs Archived segmentation for the operator lead list. */

export type LeadBucket = 'leads' | 'prospects' | 'archived'

/**
 * Prospects: replied and showed interest (plus further-along wins).
 * Everything else stays on the Leads tab — including Instantly membership,
 * unreplied outreach, and not-interested replies.
 */
export const PROSPECT_OUTBOUND_STATUSES = ['interested', 'booked', 'converted'] as const

export function isLeadBucket(value: string | null | undefined): value is LeadBucket {
  return value === 'leads' || value === 'prospects' || value === 'archived'
}

export function parseLeadBucket(value: string | null | undefined): LeadBucket | undefined {
  if (value === 'prospects' || value === 'archived' || value === 'leads') return value
  return undefined
}
