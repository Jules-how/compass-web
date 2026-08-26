/** Pure geo + negative mutate helpers. Safe for node:test. */

export const DEFAULT_GEO_RADIUS_KM = 25

/** @param {unknown} raw */
export function parseServiceSuburbs(raw) {
  return String(raw || '')
    .split(/[\n,;/|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** @param {number} resolvedCount @param {number} totalCount */
export function shouldUseProximityFallback(resolvedCount, totalCount) {
  if (totalCount <= 0) return false
  return resolvedCount < totalCount / 2
}

/**
 * Pick best AU geo suggestion for a suburb search term.
 * @param {string} suburb
 * @param {Array<{ searchTerm?: string, geoTargetConstant?: { resourceName?: string, name?: string, targetType?: string, countryCode?: string } }>} suggestions
 */
export function pickGeoSuggestion(suburb, suggestions) {
  const needle = suburb.trim().toLowerCase()
  const au = suggestions.filter(
    (s) => String(s.geoTargetConstant?.countryCode || 'AU').toUpperCase() === 'AU'
  )
  const ranked = au
    .map((s) => {
      const term = String(s.searchTerm || s.geoTargetConstant?.name || '').toLowerCase()
      const type = String(s.geoTargetConstant?.targetType || '')
      let score = 0
      if (term === needle) score += 100
      else if (term.includes(needle) || needle.includes(term)) score += 50
      if (type === 'City' || type === 'Suburb' || type === 'Neighborhood' || type === 'Municipality') {
        score += 20
      }
      return { s, score }
    })
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < 20) return null
  const g = best.s.geoTargetConstant
  if (!g?.resourceName) return null
  return {
    input: suburb,
    name: String(g.name || suburb),
    resource_name: g.resourceName,
    target_type: g.targetType || null,
    country_code: g.countryCode || 'AU'
  }
}

/**
 * Shape plan.geo from suburb list + GeoTargetConstant suggest rows.
 * @param {string[]} suburbs
 * @param {Array<{ searchTerm?: string, geoTargetConstant?: Record<string, unknown> }>} suggestions
 * @param {{ radiusKm?: number }} [options]
 */
export function shapeGeoPlan(suburbs, suggestions, options = {}) {
  const radiusKm = options.radiusKm ?? DEFAULT_GEO_RADIUS_KM
  const locations = []
  const unresolved = []

  for (const suburb of suburbs) {
    const needle = suburb.trim().toLowerCase()
    const perSuburb = suggestions.filter(
      (s) => String(s.searchTerm || '').trim().toLowerCase() === needle
    )
    const resolved = pickGeoSuggestion(suburb, perSuburb)
    if (resolved) locations.push(resolved)
    else unresolved.push(suburb)
  }

  const useProximity = shouldUseProximityFallback(locations.length, suburbs.length)
  const proximity_fallback =
    useProximity && locations.length > 0
      ? {
          enabled: true,
          radius_km: radiusKm,
          anchor: locations[0],
          address: {
            city_name: locations[0].name,
            country_code: 'AU'
          }
        }
      : null

  return {
    pending: false,
    suburbs,
    locations,
    unresolved,
    proximity_fallback,
    locale: 'en',
    country_code: 'AU'
  }
}

/** @param {string[]} suburbs */
export function buildPendingGeo(suburbs) {
  return {
    pending: true,
    suburbs,
    locations: [],
    unresolved: suburbs,
    proximity_fallback: null,
    locale: 'en',
    country_code: 'AU'
  }
}

/**
 * Build campaign location + optional proximity criterion ops.
 * @param {string} campaignResource
 * @param {import('./types').GoogleAttachPlanGeo} geo
 * @param {Record<string, unknown>} ids
 */
export function buildGeoCampaignCriterionOps(campaignResource, geo, ids) {
  if (isMutateStepComplete(ids, 'geo_targeting', geo)) return []
  const created = new Set(ids.geo_criteria || [])
  const ops = []
  let idx = 600

  for (const loc of geo?.locations || []) {
    const key = `loc:${loc.resource_name}`
    if (created.has(key)) continue
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResource,
          status: 'ENABLED',
          location: {
            geoTargetConstant: loc.resource_name
          }
        }
      },
      _meta: { step: 'geo_targeting', geoKey: key, idx: idx++ }
    })
  }

  if (geo?.proximity_fallback?.enabled) {
    const key = `prox:${geo.proximity_fallback.anchor.resource_name}:${geo.proximity_fallback.radius_km}`
    if (!created.has(key)) {
      const address = geo.proximity_fallback.address
      ops.push({
        campaignCriterionOperation: {
          create: {
            campaign: campaignResource,
            status: 'ENABLED',
            proximity: {
              address: {
                cityName: address.city_name,
                countryCode: address.country_code || 'AU'
              },
              radius: geo.proximity_fallback.radius_km,
              radiusUnits: 'KILOMETERS'
            }
          }
        },
        _meta: { step: 'geo_targeting', geoKey: key, idx: idx++ }
      })
    }
  }

  return ops
}

/**
 * Shared negative set + criteria + campaign link ops.
 * @param {string} customerId
 * @param {string} campaignResource
 * @param {import('./types').GoogleAttachPlan} plan
 * @param {Record<string, unknown>} ids
 */
export function buildSharedNegativeMutateOps(customerId, campaignResource, plan, ids) {
  const ops = []
  const negatives = plan.negatives || []
  const existingCriteria = new Set(ids.shared_negative_criteria || [])

  if (!ids.shared_negative_set) {
    const sharedSetResource = `customers/${customerId}/sharedSets/-400`
    ops.push({
      sharedSetOperation: {
        create: {
          resourceName: sharedSetResource,
          name: 'Switchflow Universal Negatives',
          type: 'NEGATIVE_KEYWORDS'
        }
      },
      _meta: { step: 'shared_negatives', kind: 'set', sharedSetResource }
    })
  }

  const sharedSetResource =
    ids.shared_negative_set || `customers/${customerId}/sharedSets/-400`

  let critIdx = 700
  for (const text of negatives) {
    const critKey = `neg:${text}`
    if (existingCriteria.has(critKey)) continue
    ops.push({
      sharedCriterionOperation: {
        create: {
          sharedSet: sharedSetResource,
          keyword: {
            text,
            matchType: 'PHRASE'
          }
        }
      },
      _meta: { step: 'shared_negatives', kind: 'criterion', critKey, critIdx: critIdx++ }
    })
  }

  if (!ids.campaign_shared_set && negatives.length > 0) {
    ops.push({
      campaignSharedSetOperation: {
        create: {
          campaign: campaignResource,
          sharedSet: sharedSetResource
        }
      },
      _meta: { step: 'shared_negatives', kind: 'link' }
    })
  }

  return ops
}

/** @param {Record<string, unknown>} googleIds @param {string} step @param {import('./types').GoogleAttachPlanGeo} [geo] */
export function isMutateStepComplete(googleIds, step, geo) {
  const ids = googleIds || {}
  switch (step) {
    case 'budget':
      return Boolean(ids.budget_resource)
    case 'campaign':
      return Boolean(ids.campaign_resource)
    case 'geo_targeting': {
      if (!geo || geo.pending) return false
      const expected =
        (geo.locations?.length || 0) + (geo.proximity_fallback?.enabled ? 1 : 0)
      if (expected === 0) return true
      return (ids.geo_criteria?.length || 0) >= expected
    }
    case 'ad_groups':
      return Boolean(ids.ad_groups && Object.keys(ids.ad_groups).length > 0)
    case 'keywords':
      return Boolean(ids.keywords && ids.keywords.length > 0)
    case 'rsas':
      return Boolean(ids.rsas && ids.rsas.length > 0)
    case 'sitelinks':
      return Boolean(ids.sitelink_assets && ids.sitelink_assets.length > 0)
    case 'callouts':
      return Boolean(ids.callout_assets && ids.callout_assets.length > 0)
    case 'call_asset':
      return Boolean(ids.call_asset)
    case 'shared_negatives': {
      const negCount = ids.shared_negative_keywords_count ?? 0
      const expected = ids.shared_negative_keywords_expected ?? negCount
      return Boolean(
        ids.shared_negative_set &&
          ids.campaign_shared_set &&
          (ids.shared_negative_criteria?.length || 0) >= expected &&
          expected > 0
      )
    }
    case 'conversion_action':
      return Boolean(ids.conversion_action)
    default:
      return false
  }
}

/** Mutate pipeline steps in dependency order. */
export const MUTATE_STEPS = [
  'budget',
  'campaign',
  'geo_targeting',
  'ad_groups',
  'keywords',
  'rsas',
  'sitelinks',
  'callouts',
  'call_asset',
  'shared_negatives',
  'conversion_action'
]

/** @param {Record<string, unknown>} googleIds @param {import('./types').GoogleAttachPlanGeo} [geo] */
export function pendingMutateSteps(googleIds, geo) {
  return MUTATE_STEPS.filter((step) => !isMutateStepComplete(googleIds, step, geo))
}

/** @param {Record<string, unknown>} prev @param {Record<string, unknown>} patch */
export function mergeGoogleIds(prev, patch) {
  const next = { ...(prev || {}) }
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined) continue
    if (key === 'ad_groups' && value && typeof value === 'object') {
      next.ad_groups = { ...(next.ad_groups || {}), ...value }
      continue
    }
    if (Array.isArray(value) && Array.isArray(next[key])) {
      next[key] = [...new Set([...next[key], ...value])]
      continue
    }
    next[key] = value
  }
  return next
}
