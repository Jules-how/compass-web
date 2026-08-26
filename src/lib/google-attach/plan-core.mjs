/** Pure Google attach plan helpers. Safe for node:test. */

export const GOOGLE_RSA_LIMITS = {
  headline: 30,
  description: 90,
  path: 15
}

export const GOOGLE_ATTACH_STATUSES = ['draft', 'created_paused', 'live', 'archived']

export const TRADE_PACK_MAP = {
  plumbing: 'plumbing_gas',
  plumbing_gas: 'plumbing_gas',
  gas: 'plumbing_gas',
  plumber: 'plumbing_gas',
  hvac: 'hvac_refrig',
  hvac_refrig: 'hvac_refrig',
  refrigeration: 'hvac_refrig',
  aircon: 'hvac_refrig',
  electrical: 'electrical_av',
  electrical_av: 'electrical_av',
  electrician: 'electrical_av',
  av: 'electrical_av',
  roofing: 'roofing',
  roofer: 'roofing'
}

/** @param {string} text @param {number} max */
export function truncateToLimit(text, max) {
  const trimmed = String(text || '').trim()
  if (trimmed.length <= max) return trimmed
  if (max <= 3) return trimmed.slice(0, max)
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/** @param {string} template @param {Record<string, string>} fields */
export function resolveMergeFields(template, fields) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => fields[key] ?? '')
}

/** @param {unknown} trade */
export function resolveTradePackId(trade) {
  const raw = String(trade || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_ -]/g, '')
  if (!raw) return null
  if (TRADE_PACK_MAP[raw]) return TRADE_PACK_MAP[raw]
  const normalized = raw.replace(/[\s-]+/g, '_')
  if (TRADE_PACK_MAP[normalized]) return TRADE_PACK_MAP[normalized]
  if (normalized.includes('plumb') || normalized.includes('gas')) return 'plumbing_gas'
  if (normalized.includes('hvac') || normalized.includes('air') || normalized.includes('refrig')) {
    return 'hvac_refrig'
  }
  if (normalized.includes('electric') || normalized.includes('av')) return 'electrical_av'
  if (normalized.includes('roof')) return 'roofing'
  return null
}

/** @param {string} customerId */
export function normalizeCustomerId(customerId) {
  return String(customerId || '')
    .replace(/-/g, '')
    .trim()
}

/** @param {string} phone */
export function normalizeAuPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('61') && digits.length >= 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length >= 10) return `+61${digits.slice(1)}`
  if (digits.length >= 9) return `+61${digits.replace(/^0/, '')}`
  return ''
}

/** @param {string | string[]} suburbs */
export function primarySuburb(suburbs) {
  if (Array.isArray(suburbs)) {
    return suburbs.map((s) => s.trim()).find(Boolean) || 'your area'
  }
  const first = String(suburbs || '')
    .split(/[,;/|]/)
    .map((s) => s.trim())
    .find(Boolean)
  return first || 'your area'
}

/** @param {string} text @param {'headline'|'description'} kind */
export function enforceRsaLimit(text, kind) {
  const max = kind === 'headline' ? GOOGLE_RSA_LIMITS.headline : GOOGLE_RSA_LIMITS.description
  return truncateToLimit(text, max)
}

/** @param {string[]} lines @param {'headline'|'description'} kind @param {number} maxCount */
export function normalizeRsaLines(lines, kind, maxCount) {
  const maxLen = kind === 'headline' ? GOOGLE_RSA_LIMITS.headline : GOOGLE_RSA_LIMITS.description
  const out = []
  for (const line of lines || []) {
    const resolved = enforceRsaLimit(line, kind)
    if (!resolved) continue
    if (resolved.length > maxLen) {
      throw new Error(`rsa_${kind}_too_long:${resolved.length}`)
    }
    out.push(resolved)
    if (out.length >= maxCount) break
  }
  return out
}

/** @param {{ headlines: string[], descriptions: string[] }} rsa */
export function validateRsaLimits(rsa) {
  for (const headline of rsa.headlines || []) {
    if (headline.length > GOOGLE_RSA_LIMITS.headline) {
      return { ok: false, field: 'headline', value: headline, length: headline.length }
    }
  }
  for (const description of rsa.descriptions || []) {
    if (description.length > GOOGLE_RSA_LIMITS.description) {
      return { ok: false, field: 'description', value: description, length: description.length }
    }
  }
  return { ok: true }
}

/** @param {import('./types').GooglePack} pack @param {import('./types').GooglePackCluster} cluster */
export function buildKeywordsFromCluster(pack, cluster) {
  const matches = pack.default_match_types?.length ? pack.default_match_types : ['PHRASE', 'EXACT']
  const keywords = []
  for (const text of cluster.keywords || []) {
    for (const match of matches) {
      keywords.push({ text: String(text).trim(), match })
    }
  }
  return keywords
}

/** @param {import('./types').GooglePack} pack @param {Record<string, string>} fields @param {string} destination */
export function generatePlanFromPack(pack, fields, destination) {
  const negatives = [...(pack.shared_negatives || [])]
  const ad_groups = []

  for (const cluster of pack.clusters || []) {
    const keywords = buildKeywordsFromCluster(pack, cluster)
    const rsas = []
    for (const template of cluster.rsa_templates || []) {
      const headlines = normalizeRsaLines(
        (template.headlines || []).map((h) => resolveMergeFields(h, fields)),
        'headline',
        15
      )
      const descriptions = normalizeRsaLines(
        (template.descriptions || []).map((d) => resolveMergeFields(d, fields)),
        'description',
        4
      )
      if (headlines.length < 3 || descriptions.length < 2) {
        throw new Error(`rsa_min_assets:${cluster.id}`)
      }
      const check = validateRsaLimits({ headlines, descriptions })
      if (!check.ok) throw new Error(`rsa_invalid:${check.field}`)
      rsas.push({ headlines, descriptions })
    }
    if (rsas.length < 2) throw new Error(`rsa_template_count:${cluster.id}`)
    ad_groups.push({
      name: cluster.name,
      cluster_id: cluster.id,
      keywords,
      rsas
    })
  }

  const sitelinks = (pack.assets?.sitelinks || []).map((link) => ({
    text: enforceRsaLimit(resolveMergeFields(link.text, fields), 'headline'),
    url: resolveMergeFields(link.url, { ...fields, destination }),
    description1: link.description1
      ? enforceRsaLimit(resolveMergeFields(link.description1, fields), 'description')
      : undefined,
    description2: link.description2
      ? enforceRsaLimit(resolveMergeFields(link.description2, fields), 'description')
      : undefined
  }))

  const callouts = (pack.assets?.callouts || []).map((c) =>
    enforceRsaLimit(resolveMergeFields(c, fields), 'headline')
  )

  return {
    campaign_name: `${fields.business} — Search Leads`,
    daily_budget_aud: 50,
    ad_groups,
    negatives,
    assets: {
      sitelinks,
      callouts,
      call: {
        phone_number: fields.phone,
        country_code: 'AU'
      }
    },
    conversion_action: {
      ...pack.conversion_action,
      name: resolveMergeFields(pack.conversion_action?.name || 'Switchflow Lead', fields)
    },
    destination_url: destination
  }
}

export {
  MUTATE_STEPS,
  isMutateStepComplete,
  pendingMutateSteps,
  mergeGoogleIds,
  parseServiceSuburbs,
  buildPendingGeo,
  shapeGeoPlan,
  shouldUseProximityFallback,
  buildGeoCampaignCriterionOps,
  buildSharedNegativeMutateOps
} from './geo-core.mjs'
