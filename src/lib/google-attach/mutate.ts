import 'server-only'

/**
 * Push a paused Search campaign graph via GoogleAdsService.Mutate.
 * Docs: https://developers.google.com/google-ads/api/docs/campaigns/search-campaigns/getting-started
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidence } from '@/lib/events'
import { GoogleAdsApiClient, microsFromAud, tempResourceName } from '@/lib/google-attach/api'
import {
  buildGeoCampaignCriterionOps,
  buildSharedNegativeMutateOps,
  isMutateStepComplete,
  mergeGoogleIds,
  pendingMutateSteps
} from '@/lib/google-attach/plan'
import type {
  GoogleAttachGoogleIds,
  GoogleAttachPlan
} from '@/lib/google-attach/types'

export type PushPausedResult = {
  googleIds: GoogleAttachGoogleIds
  plan: GoogleAttachPlan
  completedSteps: string[]
  skippedSteps: string[]
}

function extractResourceName(
  response: Array<Record<string, unknown>>,
  key: string
): string | undefined {
  for (const item of response) {
    const result = item[`${key}Result`] as { resourceName?: string } | undefined
    if (result?.resourceName) return result.resourceName
  }
  return undefined
}

function buildBudgetOp(customerId: string, plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds) {
  if (isMutateStepComplete(ids, 'budget', plan.geo)) return null
  const resourceName = tempResourceName(customerId, 'campaignBudgets', 1)
  return {
    campaignBudgetOperation: {
      create: {
        resourceName,
        name: `${plan.campaign_name} Budget`,
        amountMicros: microsFromAud(plan.daily_budget_aud || 50),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      }
    },
    _meta: { step: 'budget', resourceName }
  }
}

function buildCampaignOp(customerId: string, plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds) {
  if (isMutateStepComplete(ids, 'campaign', plan.geo)) return null
  const budgetResource =
    ids.budget_resource || tempResourceName(customerId, 'campaignBudgets', 1)
  const resourceName = tempResourceName(customerId, 'campaigns', 2)
  return {
    campaignOperation: {
      create: {
        resourceName,
        name: plan.campaign_name,
        advertisingChannelType: 'SEARCH',
        status: 'PAUSED',
        campaignBudget: budgetResource,
        manualCpc: {},
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false
        }
      }
    },
    _meta: { step: 'campaign', resourceName, budgetResource }
  }
}

function buildAdGroupOps(customerId: string, plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds) {
  if (isMutateStepComplete(ids, 'ad_groups', plan.geo)) return []
  const campaignResource =
    ids.campaign_resource || tempResourceName(customerId, 'campaigns', 2)
  const ops = []
  let idx = 10
  for (const group of plan.ad_groups) {
    const resourceName = tempResourceName(customerId, 'adGroups', idx++)
    ops.push({
      adGroupOperation: {
        create: {
          resourceName,
          name: group.name,
          campaign: campaignResource,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: microsFromAud(5)
        }
      },
      _meta: { step: 'ad_groups', clusterId: group.cluster_id, resourceName }
    })
  }
  return ops
}

function buildKeywordOps(customerId: string, plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds) {
  if (isMutateStepComplete(ids, 'keywords', plan.geo)) return []
  const adGroupMap = ids.ad_groups || {}
  const ops = []
  let idx = 100
  for (const group of plan.ad_groups) {
    const adGroupResource = adGroupMap[group.cluster_id]
    if (!adGroupResource) continue
    for (const keyword of group.keywords) {
      ops.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: adGroupResource,
            status: 'ENABLED',
            keyword: {
              text: keyword.text,
              matchType: keyword.match
            }
          }
        },
        _meta: { step: 'keywords', resourceKey: `kw-${idx++}` }
      })
    }
  }
  return ops
}

function buildRsaOps(customerId: string, plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds) {
  if (isMutateStepComplete(ids, 'rsas', plan.geo)) return []
  const adGroupMap = ids.ad_groups || {}
  const destination = plan.destination_url
  const ops = []
  let idx = 200
  for (const group of plan.ad_groups) {
    const adGroupResource = adGroupMap[group.cluster_id]
    if (!adGroupResource) continue
    for (const rsa of group.rsas) {
      ops.push({
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResource,
            status: 'ENABLED',
            ad: {
              finalUrls: [destination],
              responsiveSearchAd: {
                headlines: rsa.headlines.map((text) => ({ text })),
                descriptions: rsa.descriptions.map((text) => ({ text }))
              }
            }
          }
        },
        _meta: { step: 'rsas', resourceKey: `rsa-${idx++}` }
      })
    }
  }
  return ops
}

function buildAssetOps(plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds, customerId: string) {
  const ops = []
  let assetIdx = 300

  if (!isMutateStepComplete(ids, 'sitelinks', plan.geo)) {
    for (const link of plan.assets.sitelinks) {
      const resourceName = tempResourceName(customerId, 'assets', assetIdx++)
      ops.push({
        assetOperation: {
          create: {
            resourceName,
            sitelinkAsset: {
              linkText: link.text,
              description1: link.description1,
              description2: link.description2
            },
            finalUrls: [link.url]
          }
        },
        _meta: { step: 'sitelinks', resourceName }
      })
    }
  }

  if (!isMutateStepComplete(ids, 'callouts', plan.geo)) {
    for (const text of plan.assets.callouts) {
      const resourceName = tempResourceName(customerId, 'assets', assetIdx++)
      ops.push({
        assetOperation: {
          create: {
            resourceName,
            calloutAsset: { calloutText: text }
          }
        },
        _meta: { step: 'callouts', resourceName }
      })
    }
  }

  if (!isMutateStepComplete(ids, 'call_asset', plan.geo) && plan.assets.call.phone_number) {
    const resourceName = tempResourceName(customerId, 'assets', assetIdx++)
    ops.push({
      assetOperation: {
        create: {
          resourceName,
          callAsset: {
            countryCode: plan.assets.call.country_code || 'AU',
            phoneNumber: plan.assets.call.phone_number
          }
        }
      },
      _meta: { step: 'call_asset', resourceName }
    })
  }

  return ops
}

function buildConversionOp(customerId: string, plan: GoogleAttachPlan, ids: GoogleAttachGoogleIds) {
  if (isMutateStepComplete(ids, 'conversion_action', plan.geo)) return null
  const resourceName = tempResourceName(customerId, 'conversionActions', 500)
  return {
    conversionActionOperation: {
      create: {
        resourceName,
        name: plan.conversion_action.name,
        type: plan.conversion_action.type,
        category: plan.conversion_action.category,
        status: 'ENABLED',
        primaryForGoal: true
      }
    },
    _meta: { step: 'conversion_action', resourceName }
  }
}

function applyOpResults(
  ids: GoogleAttachGoogleIds,
  ops: Array<Record<string, unknown>>,
  responses: Array<Record<string, unknown>>
): GoogleAttachGoogleIds {
  let next = { ...ids }
  const adGroups = { ...(next.ad_groups || {}) }
  const keywords: string[] = [...(next.keywords || [])]
  const rsas: string[] = [...(next.rsas || [])]
  const sitelink_assets: string[] = [...(next.sitelink_assets || [])]
  const callout_assets: string[] = [...(next.callout_assets || [])]
  const geo_criteria: string[] = [...(next.geo_criteria || [])]
  const shared_negative_criteria: string[] = [...(next.shared_negative_criteria || [])]

  for (let i = 0; i < ops.length; i++) {
    const meta = ops[i]._meta as Record<string, unknown> | undefined
    const response = responses[i]
    if (!meta || !response) continue

    const step = String(meta.step)
    if (step === 'budget') {
      const name = extractResourceName([response], 'campaignBudget')
      if (name) next.budget_resource = name
    }
    if (step === 'campaign') {
      const name = extractResourceName([response], 'campaign')
      if (name) next.campaign_resource = name
      if (meta.budgetResource && !next.budget_resource) next.budget_resource = String(meta.budgetResource)
    }
    if (step === 'geo_targeting' && meta.geoKey) {
      const name = extractResourceName([response], 'campaignCriterion')
      if (name) geo_criteria.push(String(meta.geoKey))
    }
    if (step === 'ad_groups' && meta.clusterId && meta.resourceName) {
      adGroups[String(meta.clusterId)] = extractResourceName([response], 'adGroup') || String(meta.resourceName)
    }
    if (step === 'keywords' && meta.resourceKey) {
      const name = extractResourceName([response], 'adGroupCriterion')
      if (name) keywords.push(name)
    }
    if (step === 'rsas' && meta.resourceKey) {
      const name = extractResourceName([response], 'adGroupAd')
      if (name) rsas.push(name)
    }
    if (step === 'sitelinks' && meta.resourceName) {
      const name = extractResourceName([response], 'asset')
      if (name) sitelink_assets.push(name)
    }
    if (step === 'callouts' && meta.resourceName) {
      const name = extractResourceName([response], 'asset')
      if (name) callout_assets.push(name)
    }
    if (step === 'call_asset' && meta.resourceName) {
      const name = extractResourceName([response], 'asset')
      if (name) next.call_asset = name
    }
    if (step === 'shared_negatives') {
      const kind = String(meta.kind || '')
      if (kind === 'set') {
        const name = extractResourceName([response], 'sharedSet')
        if (name) next.shared_negative_set = name
        else if (meta.sharedSetResource) next.shared_negative_set = String(meta.sharedSetResource)
      }
      if (kind === 'criterion' && meta.critKey) {
        const name = extractResourceName([response], 'sharedCriterion')
        if (name) shared_negative_criteria.push(String(meta.critKey))
      }
      if (kind === 'link') {
        const name = extractResourceName([response], 'campaignSharedSet')
        if (name) next.campaign_shared_set = name
      }
    }
    if (step === 'conversion_action' && meta.resourceName) {
      const name = extractResourceName([response], 'conversionAction')
      if (name) next.conversion_action = name
    }
  }

  next = mergeGoogleIds(next, {
    ad_groups: adGroups,
    keywords,
    rsas,
    sitelink_assets,
    callout_assets,
    geo_criteria,
    shared_negative_criteria
  })
  return next
}

export async function pushPausedGoogleAttach(input: {
  supabase: SupabaseClient
  clientId: string
  attachId: string
  refreshToken: string
  customerId: string
  plan: GoogleAttachPlan
  googleIds: GoogleAttachGoogleIds
}): Promise<PushPausedResult> {
  const customerId = input.customerId.replace(/-/g, '')
  const api = new GoogleAdsApiClient({
    refreshToken: input.refreshToken,
    customerId,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  })

  const plan = input.plan
  const geo = plan.geo

  let googleIds: GoogleAttachGoogleIds = {
    ...input.googleIds,
    shared_negative_keywords_expected:
      input.googleIds.shared_negative_keywords_expected ?? plan.negatives.length
  }

  const skippedSteps = [...pendingMutateSteps(googleIds, geo)].filter((step) =>
    isMutateStepComplete(googleIds, step, geo)
  )
  const completedSteps: string[] = []

  await appendEvidence(input.supabase, {
    client_id: input.clientId,
    source: 'google_attach',
    type: 'google.campaign.draft_started',
    native_id: input.attachId,
    payload: {
      customer_id: customerId,
      pending_steps: pendingMutateSteps(googleIds, geo),
      geo_pending: geo?.pending ?? false
    }
  })

  const batches: Array<Array<Record<string, unknown>>> = []

  const budgetOp = buildBudgetOp(customerId, plan, googleIds)
  if (budgetOp) batches.push([budgetOp])

  const campaignOp = buildCampaignOp(customerId, plan, googleIds)
  if (campaignOp) batches.push([campaignOp])

  for (const batch of batches) {
    const cleanOps = batch.map(({ _meta, ...op }) => op)
    const response = await api.mutate(cleanOps)
    googleIds = applyOpResults(googleIds, batch, response.mutateOperationResponses)
    for (const op of batch) {
      const step = String((op._meta as Record<string, unknown>)?.step || '')
      if (step) completedSteps.push(step)
    }
  }

  const campaignResource =
    googleIds.campaign_resource || tempResourceName(customerId, 'campaigns', 2)

  const postCampaignBatches: Array<Array<Record<string, unknown>>> = []

  if (geo && !geo.pending) {
    const geoOps = buildGeoCampaignCriterionOps(campaignResource, geo, googleIds)
    if (geoOps.length) postCampaignBatches.push(geoOps)
  }

  const adGroupOps = buildAdGroupOps(customerId, plan, googleIds)
  if (adGroupOps.length) postCampaignBatches.push(adGroupOps)

  const keywordOps = buildKeywordOps(customerId, plan, googleIds)
  if (keywordOps.length) postCampaignBatches.push(keywordOps)

  const rsaOps = buildRsaOps(customerId, plan, googleIds)
  if (rsaOps.length) postCampaignBatches.push(rsaOps)

  const assetOps = buildAssetOps(plan, googleIds, customerId)
  if (assetOps.length) postCampaignBatches.push(assetOps)

  const negativeOps = buildSharedNegativeMutateOps(
    customerId,
    campaignResource,
    plan,
    googleIds
  )
  if (negativeOps.length) postCampaignBatches.push(negativeOps)

  const conversionOp = buildConversionOp(customerId, plan, googleIds)
  if (conversionOp) postCampaignBatches.push([conversionOp])

  for (const batch of postCampaignBatches) {
    const cleanOps = batch.map(({ _meta, ...op }) => op)
    const response = await api.mutate(cleanOps)
    googleIds = applyOpResults(googleIds, batch, response.mutateOperationResponses)
    for (const op of batch) {
      const step = String((op._meta as Record<string, unknown>)?.step || '')
      if (step) completedSteps.push(step)
    }
  }

  if (googleIds.campaign_resource) {
    await appendEvidence(input.supabase, {
      client_id: input.clientId,
      source: 'google_attach',
      type: 'google.campaign.created_paused',
      native_id: `${input.attachId}:campaign`,
      payload: {
        campaign_resource: googleIds.campaign_resource,
        customer_id: customerId,
        geo_locations: geo?.locations?.length ?? 0,
        negative_keywords: plan.negatives.length
      }
    })
    await appendEvidence(input.supabase, {
      client_id: input.clientId,
      source: 'google_attach',
      type: 'google.attach.ready_for_review',
      native_id: `${input.attachId}:ready`,
      payload: { status: 'created_paused' }
    })
  }

  return { googleIds, plan, completedSteps, skippedSteps }
}
