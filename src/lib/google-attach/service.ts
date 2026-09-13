import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { nowIso, recordClientActivity } from '@/lib/client-data'
import {
  defaultDestinationUrl,
  ensurePlanGeoResolved,
  generateGoogleAttachPlan,
  resolveClientTrade
} from '@/lib/google-attach/plan'
import { inviteMccForAttach, refreshMccLinkForAttach } from '@/lib/google-attach/mcc'
import { pushPausedGoogleAttach } from '@/lib/google-attach/mutate'
import {
  googleAdsApiConfigured,
  loadGoogleAdsRefreshToken
} from '@/lib/google-attach/oauth'
import type { GoogleAttachPlan, GoogleAttachRow, GoogleAttachStatus } from '@/lib/google-attach/types'
import { getDeliveryEngagement } from '@/lib/offer-revisions'

export function newGoogleAttachId(): string {
  return `gattach-${crypto.randomUUID()}`
}

export async function getGoogleAttachRows(
  supabase: SupabaseClient,
  clientId: string
): Promise<GoogleAttachRow[]> {
  const { data, error } = await supabase
    .from('compass_google_attach')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as GoogleAttachRow[]
}

export async function createGoogleAttachDraft(
  supabase: SupabaseClient,
  input: {
    clientId: string
    customerId?: string
    destinationUrl?: string
  }
): Promise<GoogleAttachRow> {
  const engagement = await getDeliveryEngagement(supabase, input.clientId)
  const clientRes = await supabase
    .from('compass_clients')
    .select('id,name,industry,website,voice,deal_terms')
    .eq('id', input.clientId)
    .maybeSingle()
  if (!clientRes.data) throw new Error('client_not_found')

  const voice = (clientRes.data.voice ?? {}) as Record<string, unknown>
  const onboarding = engagement.onboarding_snapshot.answers ?? {}
  const delivery = {
    ...onboarding,
    services_offered: onboarding.installation_services,
    service_suburbs: onboarding.service_areas
  }
  const trade = resolveClientTrade({ delivery }, clientRes.data.industry)
  const destination =
    input.destinationUrl?.trim() ||
    defaultDestinationUrl({
      clientSlug: input.clientId.replace(/^client-/, ''),
      website: clientRes.data.website,
      voiceNumber: String(voice.published_number || voice.twilio_number || '')
    })

  if (!destination) throw new Error('destination_required')

  const refreshToken = googleAdsApiConfigured().configured
    ? await loadGoogleAdsRefreshToken(supabase)
    : null

  const { plan } = await generateGoogleAttachPlan({
    trade,
    clientName: clientRes.data.name,
    destinationUrl: destination,
    delivery,
    voice,
    refreshToken
  })

  const stamp = nowIso()
  const row = {
    id: newGoogleAttachId(),
    client_id: input.clientId,
    offer_revision_id: engagement.offer_revision_id,
    engagement_id: engagement.id,
    source_snapshot: {
      engagement_id: engagement.id,
      offer_revision_id: engagement.offer_revision_id,
      accepted_terms: engagement.accepted_terms,
      onboarding: engagement.onboarding_snapshot
    },
    status: 'draft' as GoogleAttachStatus,
    customer_id: input.customerId?.replace(/-/g, '') || null,
    link_status: null,
    destination_url: destination,
    plan,
    google_ids: {},
    created_at: stamp,
    updated_at: stamp
  }

  const { data, error } = await supabase.from('compass_google_attach').insert(row).select('*').single()
  if (error) throw new Error(error.message)

  await recordClientActivity(supabase, {
    clientId: input.clientId,
    action: 'google_attach_draft_created',
    body: `Google Ads attach draft: ${plan.campaign_name}`
  })

  return data as GoogleAttachRow
}

export async function runGoogleAttachAction(
  supabase: SupabaseClient,
  input: {
    clientId: string
    attachId: string
    action: 'invite_mcc' | 'push_paused' | 'archive'
  }
): Promise<GoogleAttachRow> {
  const { data: row, error } = await supabase
    .from('compass_google_attach')
    .select('*')
    .eq('id', input.attachId)
    .eq('client_id', input.clientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('attach_not_found')

  const stamp = nowIso()

  if (input.action === 'archive') {
    const { data: archived, error: archiveError } = await supabase
      .from('compass_google_attach')
      .update({ status: 'archived', updated_at: stamp })
      .eq('id', input.attachId)
      .select('*')
      .single()
    if (archiveError) throw new Error(archiveError.message)
    return archived as GoogleAttachRow
  }

  const config = googleAdsApiConfigured()
  if (!config.configured) {
    throw new Error(`google_ads_not_configured:${config.missing.join(',')}`)
  }

  const refreshToken = await loadGoogleAdsRefreshToken(supabase)
  if (!refreshToken) throw new Error('google_ads_refresh_token_missing')

  const customerId = String(row.customer_id || '').replace(/-/g, '')
  if (!customerId) throw new Error('customer_id_required')

  if (input.action === 'invite_mcc') {
    const invite = await inviteMccForAttach(supabase, {
      clientId: input.clientId,
      attachId: input.attachId,
      refreshToken,
      customerId
    })
    const google_ids = { ...(row.google_ids as Record<string, unknown>), ...invite.googleIdsPatch }
    const { data: updated, error: updateError } = await supabase
      .from('compass_google_attach')
      .update({
        link_status: invite.linkStatus,
        google_ids,
        updated_at: stamp
      })
      .eq('id', input.attachId)
      .select('*')
      .single()
    if (updateError) throw new Error(updateError.message)
    return updated as GoogleAttachRow
  }

  if (input.action === 'push_paused') {
    const link = await refreshMccLinkForAttach(supabase, {
      clientId: input.clientId,
      refreshToken,
      customerId
    })
    if (link.status !== 'ACTIVE') {
      throw new Error(`mcc_link_not_active:${link.status}`)
    }

    const sourceSnapshot = (row.source_snapshot ?? {}) as Record<string, unknown>
    const onboardingSnapshot = sourceSnapshot.onboarding as Record<string, unknown> | undefined
    const onboardingAnswers = onboardingSnapshot?.answers as Record<string, unknown> | undefined
    const serviceSuburbs = onboardingAnswers?.service_areas

    let plan = row.plan as GoogleAttachPlan
    if (plan.geo?.pending) {
      plan = await ensurePlanGeoResolved(plan, {
        serviceSuburbs,
        refreshToken
      })
      if (plan.geo?.pending) {
        throw new Error('geo_resolution_pending')
      }
    }

    const push = await pushPausedGoogleAttach({
      supabase,
      clientId: input.clientId,
      attachId: input.attachId,
      refreshToken,
      customerId,
      plan,
      googleIds: (row.google_ids ?? {}) as GoogleAttachRow['google_ids']
    })

    const { data: updated, error: updateError } = await supabase
      .from('compass_google_attach')
      .update({
        status: 'created_paused',
        link_status: link.status,
        plan: push.plan,
        google_ids: push.googleIds,
        updated_at: stamp
      })
      .eq('id', input.attachId)
      .select('*')
      .single()
    if (updateError) throw new Error(updateError.message)

    await recordClientActivity(supabase, {
      clientId: input.clientId,
      action: 'google_attach_pushed_paused',
      body: `Pushed paused Google Ads campaign (${push.completedSteps.length} steps)`
    })

    return updated as GoogleAttachRow
  }

  throw new Error('action_not_supported')
}

export async function enrichGoogleAttachList(
  supabase: SupabaseClient,
  clientId: string,
  rows: GoogleAttachRow[]
): Promise<
  Array<
    GoogleAttachRow & {
      config: ReturnType<typeof googleAdsApiConfigured>
      adsConsoleUrl?: string
    }
  >
> {
  const config = googleAdsApiConfigured()
  let linkStatusByCustomer: Record<string, string> = {}

  if (config.configured && rows.some((r) => r.customer_id)) {
    const refreshToken = await loadGoogleAdsRefreshToken(supabase)
    if (refreshToken) {
      for (const row of rows) {
        if (!row.customer_id) continue
        try {
          const poll = await refreshMccLinkForAttach(supabase, {
            clientId,
            refreshToken,
            customerId: row.customer_id
          })
          linkStatusByCustomer[row.customer_id] = poll.status
        } catch {
          linkStatusByCustomer[row.customer_id] = row.link_status || 'UNKNOWN'
        }
      }
    }
  }

  return rows.map((row) => {
    const campaignId = row.google_ids?.campaign_resource?.split('/').pop()
    return {
      ...row,
      link_status: row.customer_id
        ? linkStatusByCustomer[row.customer_id] || row.link_status
        : row.link_status,
      config,
      adsConsoleUrl: row.customer_id
        ? `https://ads.google.com/aw/overview?__u=${row.customer_id.replace(/-/g, '')}${
            campaignId ? `&campaignId=${campaignId}` : ''
          }`
        : undefined
    }
  })
}
