import type { LeadContact } from '@/lib/types'
import { parseLeadFacts, type LeadFact } from '@/lib/lead-facts'

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export type PreviewSegment =
  | { kind: 'text'; text: string }
  | { kind: 'value'; key: string; text: string }
  | { kind: 'missing'; key: string }

export function splitPersonName(name: string | null | undefined): {
  firstName: string
  lastName: string
} {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
}

export function leadPreviewValues(lead: LeadContact | null): Record<string, string> {
  if (!lead) return {}
  const { firstName, lastName } = splitPersonName(lead.name)
  const opener = (lead.opener || '').trim()
  const location = [lead.city, lead.state].filter(Boolean).join(', ')
  return {
    firstName,
    lastName,
    email: (lead.email || '').trim(),
    companyName: (lead.company || '').trim(),
    jobTitle: (lead.role || '').trim(),
    phone: (lead.phone || '').trim(),
    location,
    linkedIn: (lead.linkedin || '').trim(),
    opener,
    personalization: opener
  }
}

export function tokenizePreview(text: string, values: Record<string, string>): PreviewSegment[] {
  const segments: PreviewSegment[] = []
  let last = 0
  const re = new RegExp(TOKEN_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ kind: 'text', text: text.slice(last, match.index) })
    }
    const key = match[1] || ''
    const mapped = Object.prototype.hasOwnProperty.call(values, key)
    const value = mapped ? values[key] : undefined
    if (!mapped) {
      segments.push({ kind: 'missing', key })
    } else if (value) {
      segments.push({ kind: 'value', key, text: value })
    } else {
      segments.push({ kind: 'missing', key })
    }
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments
}

export function isOpenerPreviewKey(key: string): boolean {
  return key === 'opener' || key === 'personalization' || key === 'hook'
}

export function leadFactsForPreview(lead: LeadContact | null): LeadFact[] {
  if (!lead) return []
  const parsed = parseLeadFacts(lead.lead_facts)
  return parsed.ok ? parsed.facts : []
}
