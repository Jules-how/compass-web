import {
  generatePlanFromPack,
  normalizeAuPhone,
  parseServiceSuburbs,
  primarySuburb,
  resolveMergeFields,
  resolveTradePackId,
  validateRsaLimits
} from '@/lib/google-attach/plan-core.mjs'
import { loadGooglePack } from '@/lib/google-attach/pack'
import { buildPendingGeo, resolvePlanGeoIfReady } from '@/lib/google-attach/geo'
import type { GoogleAttachMergeContext, GoogleAttachPlan, GoogleAttachPlanGeo } from '@/lib/google-attach/types'

export {
  GOOGLE_RSA_LIMITS,
  generatePlanFromPack,
  resolveTradePackId,
  validateRsaLimits,
  pendingMutateSteps,
  isMutateStepComplete,
  mergeGoogleIds,
  normalizeCustomerId,
  parseServiceSuburbs,
  buildPendingGeo,
  shapeGeoPlan,
  buildGeoCampaignCriterionOps,
  buildSharedNegativeMutateOps
} from '@/lib/google-attach/plan-core.mjs'

export function buildMergeContext(input: {
  clientName: string
  delivery?: Record<string, unknown> | null
  destinationUrl: string
  voice?: Record<string, unknown> | null
  yearsInBusiness?: string
}): GoogleAttachMergeContext {
  const delivery = input.delivery ?? {}
  const voice = input.voice ?? {}
  const business =
    String(delivery.spoken_business_name || delivery.trading_name || input.clientName || '').trim() ||
    'Local Trade Business'
  const suburb = primarySuburb(parseServiceSuburbs(delivery.service_suburbs))
  const years = String(input.yearsInBusiness || delivery.years_in_business || '10+').trim()
  const phone =
    normalizeAuPhone(
      String(
        voice.published_number ||
          voice.twilio_number ||
          delivery.public_number ||
          delivery.owner_mobile ||
          ''
      )
    ) || ''

  return {
    business,
    suburb,
    years,
    phone,
    destination: input.destinationUrl
  }
}

export async function generateGoogleAttachPlan(input: {
  trade: string
  clientName: string
  destinationUrl: string
  delivery?: Record<string, unknown> | null
  voice?: Record<string, unknown> | null
  refreshToken?: string | null
}): Promise<{ packId: string; plan: GoogleAttachPlan }> {
  const packId = resolveTradePackId(input.trade)
  if (!packId) throw new Error('trade_pack_not_found')

  const pack = loadGooglePack(packId)
  const fields = buildMergeContext({
    clientName: input.clientName,
    delivery: input.delivery,
    destinationUrl: input.destinationUrl,
    voice: input.voice
  })

  const plan = generatePlanFromPack(pack, fields, input.destinationUrl) as GoogleAttachPlan
  for (const group of plan.ad_groups) {
    for (const rsa of group.rsas) {
      const check = validateRsaLimits(rsa)
      if (!check.ok) {
        throw new Error(`plan_rsa_invalid:${group.cluster_id}:${check.field}`)
      }
    }
  }

  if (!fields.phone) {
    plan.assets.call.phone_number = ''
  }

  plan.geo = await resolvePlanGeoIfReady({
    serviceSuburbs: input.delivery?.service_suburbs,
    refreshToken: input.refreshToken
  })

  return { packId, plan }
}

export async function ensurePlanGeoResolved(
  plan: GoogleAttachPlan,
  input: { serviceSuburbs: unknown; refreshToken: string }
): Promise<GoogleAttachPlan> {
  if (plan.geo && !plan.geo.pending) return plan
  const { resolvePlanGeo } = await import('@/lib/google-attach/geo')
  const geo = await resolvePlanGeo({
    serviceSuburbs: input.serviceSuburbs,
    refreshToken: input.refreshToken
  })
  return { ...plan, geo }
}

export function defaultDestinationUrl(input: {
  clientSlug?: string
  website?: string | null
  voiceNumber?: string
}): string {
  const slug = String(input.clientSlug || '').trim()
  if (slug) return `https://switchflow.agency/lp/${slug}`
  const website = String(input.website || '').trim()
  if (website) return website.startsWith('http') ? website : `https://${website}`
  if (input.voiceNumber) return `tel:${input.voiceNumber}`
  return ''
}

export function resolveClientTrade(dealTerms: unknown, industry?: string | null): string {
  const delivery = (dealTerms as Record<string, unknown> | null)?.delivery as
    | Record<string, unknown>
    | undefined
  const fromDelivery = String(delivery?.trade || '').trim()
  if (fromDelivery) return fromDelivery
  return String(industry || '').trim()
}

export { resolveMergeFields }
