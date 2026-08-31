import 'server-only'

/**
 * Geo resolution for attach plans via GeoTargetConstantService.suggest.
 * Docs: https://developers.google.com/google-ads/api/docs/targeting/location-targeting
 */

import { GoogleAdsApiClient } from '@/lib/google-attach/api'
import {
  buildPendingGeo,
  parseServiceSuburbs,
  shapeGeoPlan
} from '@/lib/google-attach/geo-core.mjs'
import { googleAdsApiConfigured } from '@/lib/google-attach/oauth'
import type { GoogleAttachPlanGeo } from '@/lib/google-attach/types'

export { parseServiceSuburbs, buildPendingGeo, shapeGeoPlan } from '@/lib/google-attach/geo-core.mjs'

export function geoCredentialsReady(): boolean {
  return googleAdsApiConfigured().configured
}

export async function resolvePlanGeo(input: {
  serviceSuburbs: unknown
  refreshToken: string
  radiusKm?: number
}): Promise<GoogleAttachPlanGeo> {
  const suburbs = parseServiceSuburbs(input.serviceSuburbs)
  if (suburbs.length === 0) {
    return {
      pending: false,
      suburbs: [],
      locations: [],
      unresolved: [],
      proximity_fallback: null,
      locale: 'en',
      country_code: 'AU'
    }
  }

  const suggestions = await GoogleAdsApiClient.suggestGeoTargets({
    refreshToken: input.refreshToken,
    locationNames: suburbs,
    locale: 'en',
    countryCode: 'AU'
  })

  return shapeGeoPlan(suburbs, suggestions, { radiusKm: input.radiusKm }) as GoogleAttachPlanGeo
}

export async function resolvePlanGeoIfReady(input: {
  serviceSuburbs: unknown
  refreshToken?: string | null
}): Promise<GoogleAttachPlanGeo> {
  const suburbs = parseServiceSuburbs(input.serviceSuburbs)
  if (!geoCredentialsReady() || !input.refreshToken) {
    return buildPendingGeo(suburbs) as GoogleAttachPlanGeo
  }
  try {
    return await resolvePlanGeo({
      serviceSuburbs: suburbs,
      refreshToken: input.refreshToken
    })
  } catch {
    return buildPendingGeo(suburbs) as GoogleAttachPlanGeo
  }
}
