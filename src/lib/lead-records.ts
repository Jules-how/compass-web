import type { LeadContact } from '@/lib/types'
import { formatRelativeLeadDate } from '@/lib/lead-columns'
import { computeRecontactEligibility } from '@/lib/recontact-eligibility'
import { humanizeVertical } from '@/lib/leads-meta'
import type { RecordsTableRow, Strength } from '@/components/ui/records-table'

function parseTagList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    }
  } catch {
    // comma / pipe lists from CSV imports
  }
  return raw
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function leadConnectionStrength(lead: LeadContact): Strength {
  const eligibility = computeRecontactEligibility(lead)
  if (eligibility.lane === 'hot') return 'strong'
  if (eligibility.lane === 'never_contacted') return 'none'
  if (eligibility.lane === 'blocked' || eligibility.lane === 'ready') return 'veryweak'
  if (eligibility.daysSinceContact != null && eligibility.daysSinceContact <= 21) {
    return 'strong'
  }
  return 'weak'
}

export function leadCategoryTags(lead: LeadContact): string[] {
  const tags: string[] = []
  const vertical = humanizeVertical(lead.vertical)
  if (vertical && vertical !== '—') tags.push(vertical)
  for (const tag of parseTagList(lead.tags)) {
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (lead.cohort_tag?.trim() && !tags.includes(lead.cohort_tag.trim())) {
    tags.push(lead.cohort_tag.trim())
  }
  if (lead.source?.trim() && !tags.includes(lead.source.trim())) {
    tags.push(lead.source.trim())
  }
  return tags
}

function displayName(lead: LeadContact): string {
  const person = lead.name?.trim()
  const company = lead.company?.trim()
  if (person && company && person !== company) return `${person} — ${company}`
  return person || company || lead.email?.trim() || 'Untitled'
}

function linkHref(lead: LeadContact): string | undefined {
  const linkedin = lead.linkedin?.trim()
  if (linkedin) {
    return linkedin.startsWith('http') ? linkedin : `https://${linkedin}`
  }
  return undefined
}

function linkLabel(lead: LeadContact): string | undefined {
  const linkedin = lead.linkedin?.trim()
  if (!linkedin) return undefined
  return linkedin.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

export function leadToRecordsRow(lead: LeadContact, now = new Date()): RecordsTableRow {
  const lastMs = lead.last_outbound_at ? Date.parse(lead.last_outbound_at) : NaN
  return {
    id: lead.id,
    name: displayName(lead),
    tags: leadCategoryTags(lead),
    last: formatRelativeLeadDate(lead.last_outbound_at, now),
    lastSort: Number.isNaN(lastMs) ? 0 : lastMs,
    strength: leadConnectionStrength(lead),
    website: linkLabel(lead),
    href: linkHref(lead)
  }
}
