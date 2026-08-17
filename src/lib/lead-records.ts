import type { LeadContact } from '@/lib/types'
import {
  formatLeadFactsPreview,
  parseLeadFacts
} from '@/lib/lead-facts'
import { formatRelativeLeadDate, type LeadColumnId } from '@/lib/lead-columns'
import { computeRecontactEligibility } from '@/lib/recontact-eligibility'
import { humanizeStatus, humanizeVertical } from '@/lib/leads-meta'
import { splitPersonName } from '@/lib/sequence-preview'

export type Strength = 'strong' | 'weak' | 'veryweak' | 'none'

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

export function leadLocation(lead: LeadContact): string {
  return [lead.city, lead.state].filter(Boolean).join(', ')
}

export function leadLinkedinHref(lead: LeadContact): string | undefined {
  const linkedin = lead.linkedin?.trim()
  if (!linkedin) return undefined
  return linkedin.startsWith('http') ? linkedin : `https://${linkedin}`
}

export function leadLinkedinLabel(lead: LeadContact): string {
  const linkedin = lead.linkedin?.trim()
  if (!linkedin) return ''
  return linkedin.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

export type LeadCell = {
  text: string
  href?: string
  tags?: string[]
  strength?: Strength
  muted?: boolean
}

export function leadColumnValue(lead: LeadContact, column: LeadColumnId, now = new Date()): LeadCell {
  const { firstName, lastName } = splitPersonName(lead.name)
  switch (column) {
    case 'first_name':
      return { text: firstName }
    case 'last_name':
      return { text: lastName }
    case 'email':
      return { text: lead.email?.trim() || '' }
    case 'job_title':
      return { text: lead.role?.trim() || '' }
    case 'company':
      return { text: lead.company?.trim() || '' }
    case 'location':
      return { text: leadLocation(lead) }
    case 'website': {
      const href = lead.website?.trim() || (lead.company_domain ? `https://${lead.company_domain}` : '')
      return { text: href.replace(/^https?:\/\//i, ''), href: href || undefined }
    }
    case 'linkedin': {
      const href = leadLinkedinHref(lead)
      return { text: leadLinkedinLabel(lead), href }
    }
    case 'phone':
      return { text: lead.phone?.trim() || '' }
    case 'opener':
      return { text: lead.opener?.trim() || '' }
    case 'lead_facts':
      return { text: formatLeadFactsPreview(lead.lead_facts) }
    case 'status':
      return { text: humanizeStatus(lead.outbound_status) }
    case 'categories':
      return { text: '', tags: leadCategoryTags(lead) }
    case 'last_touch': {
      const text = formatRelativeLeadDate(lead.last_outbound_at, now)
      return { text, muted: text === 'No contact' }
    }
    case 'strength':
      return { text: '', strength: leadConnectionStrength(lead) }
    case 'source':
      return { text: lead.source?.trim() || '' }
    case 'campaign':
      return {
        text:
          lead.instantly_campaign_name?.trim() ||
          lead.instantly_campaign?.trim() ||
          lead.pipeline_campaign_id?.trim() ||
          ''
      }
    case 'vertical': {
      const label = humanizeVertical(lead.vertical)
      return { text: label === '—' ? '' : label }
    }
    default:
      return { text: '' }
  }
}

export function leadColumnOccupied(lead: LeadContact, column: LeadColumnId): boolean {
  if (column === 'website') {
    return Boolean(lead.website?.trim() || lead.company_domain?.trim())
  }
  if (column === 'lead_facts') {
    const parsed = parseLeadFacts(lead.lead_facts)
    return parsed.ok && parsed.facts.length > 0
  }
  if (column === 'categories') return leadCategoryTags(lead).length > 0
  if (column === 'last_touch') return Boolean(lead.last_outbound_at)
  if (column === 'strength') return leadConnectionStrength(lead) !== 'none'
  if (column === 'status') return Boolean(lead.outbound_status?.trim())
  const cell = leadColumnValue(lead, column)
  if (cell.tags?.length) return true
  if (cell.strength && cell.strength !== 'none') return true
  return Boolean(cell.text.trim())
}

export function occupiedLeadColumns(leads: LeadContact[]): LeadColumnId[] {
  const ids: LeadColumnId[] = [
    'first_name',
    'last_name',
    'email',
    'job_title',
    'company',
    'location',
    'website',
    'linkedin',
    'phone',
    'opener',
    'lead_facts',
    'status',
    'categories',
    'last_touch',
    'strength',
    'source',
    'campaign',
    'vertical'
  ]
  return ids.filter((id) => leads.some((lead) => leadColumnOccupied(lead, id)))
}
