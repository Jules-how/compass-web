/** Atomic engager facts stored on lead_contacts.lead_facts (jsonb array).
 *  Hiring from Hook stores as kind `update`. `lead_contacts.opener_kind` carries `hiring`.
 */

export const LEAD_FACT_KINDS = [
  'specialty',
  'policy',
  'tenure',
  'review',
  'about',
  'milestone',
  'content',
  'update',
  'location'
] as const

export type LeadFactKind = (typeof LEAD_FACT_KINDS)[number]

export type LeadFact = {
  kind: LeadFactKind
  claim: string
  url: string | null
}

const KIND_SET = new Set<string>(LEAD_FACT_KINDS)
const MAX_FACTS = 8
const MAX_CLAIM = 280
const MAX_URL = 500

export function isLeadFactKind(value: string): value is LeadFactKind {
  return KIND_SET.has(value)
}

export function parseLeadFacts(
  input: unknown
): { ok: true; facts: LeadFact[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, facts: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'lead_facts_not_array' }
  if (input.length > MAX_FACTS) return { ok: false, error: 'lead_facts_too_many' }

  const facts: LeadFact[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'lead_fact_invalid' }
    const row = item as Record<string, unknown>
    const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
    if (!isLeadFactKind(kind)) return { ok: false, error: 'lead_fact_kind_invalid' }
    const claim = typeof row.claim === 'string' ? row.claim.trim() : ''
    if (!claim) return { ok: false, error: 'lead_fact_claim_required' }
    if (claim.length > MAX_CLAIM) return { ok: false, error: 'lead_fact_claim_too_long' }
    if (claim.includes('—')) return { ok: false, error: 'lead_fact_em_dash' }
    let url: string | null = null
    if (row.url != null && row.url !== '') {
      if (typeof row.url !== 'string') return { ok: false, error: 'lead_fact_url_invalid' }
      url = row.url.trim()
      if (!url) {
        url = null
      } else {
        if (url.length > MAX_URL) return { ok: false, error: 'lead_fact_url_too_long' }
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'lead_fact_url_invalid' }
      }
    }
    facts.push({ kind, claim, url })
  }
  return { ok: true, facts }
}

export function formatLeadFactsPreview(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (
          item &&
          typeof item === 'object' &&
          'claim' in item &&
          typeof (item as { claim: unknown }).claim === 'string'
        ) {
          return (item as { claim: string }).claim.trim()
        }
        return ''
      })
      .filter(Boolean)
      .join(' · ')
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

export function formatLeadFactsDetail(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value || null
  if (Array.isArray(value)) {
    const lines = value
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const row = item as { kind?: unknown; claim?: unknown }
        const claim = typeof row.claim === 'string' ? row.claim.trim() : ''
        if (!claim) return ''
        const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
        return kind ? `${kind}: ${claim}` : claim
      })
      .filter(Boolean)
    return lines.length ? lines.join('\n') : null
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return null
  }
}
