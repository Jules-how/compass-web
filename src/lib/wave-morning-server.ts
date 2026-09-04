import type { SupabaseClient } from '@supabase/supabase-js'

import { listPipelineCampaigns } from '@/lib/campaigns-server'
import type { CompassCampaign } from '@/lib/campaigns'
import {
  InstantlyApiError,
  loadOutboundBoardFromInstantly,
  resolveInstantlyApiKey,
  type OutboundBoard
} from '@/lib/instantly'
import { buildLiveDesk, sydneyDateOnly } from '@/lib/wave-desk'
import {
  clipNextIds,
  remainingIsLow,
  resolveHomeNext,
  type MorningNextCard,
  type MorningSendingCard,
  type MorningWavePayload,
  type WaveBriefRecord
} from '@/lib/wave-morning'
import type { PathwayRunStatus } from '@/lib/pathway'

const EMPTY_BOARD: OutboundBoard = { live: [], history: [], liveCount: 0 }

function asBrief(row: {
  id: string
  next_campaign_ids?: string[] | null
  next_status?: string | null
  recommendation?: string | null
  generated_at?: string | null
} | null): WaveBriefRecord | null {
  if (!row) return null
  return {
    id: row.id,
    next_campaign_ids: clipNextIds(row.next_campaign_ids),
    next_status: row.next_status || 'proposed',
    recommendation: row.recommendation ?? null,
    generated_at: row.generated_at ?? null
  }
}

function campaignCard(campaign: CompassCampaign | undefined, fallbackId: string): MorningNextCard {
  return {
    campaignId: campaign?.id || fallbackId,
    name: campaign?.name || fallbackId,
    trade: (campaign?.vertical_tags ?? []).filter(Boolean)[0] || null,
    city: (campaign?.location_tags ?? []).filter(Boolean)[0] || null,
    buildStatus: 'none',
    runDetail: null
  }
}

export async function loadMorningWavePayload(
  supabase: SupabaseClient,
  instantlyRepliesWaiting = 0,
  options: { instantlyBoard?: boolean } = {}
): Promise<MorningWavePayload> {
  const day = sydneyDateOnly()
  const liveInstantly = options.instantlyBoard !== false
  const instantlyBoardPromise = liveInstantly
    ? resolveInstantlyApiKey(supabase).then(async (apiKey) => {
        if (!apiKey) return EMPTY_BOARD
        try {
          return await loadOutboundBoardFromInstantly(apiKey)
        } catch (err) {
          if (!(err instanceof InstantlyApiError)) throw err
          return EMPTY_BOARD
        }
      })
    : Promise.resolve(EMPTY_BOARD)

  const [board, campaigns, todayRes, acceptedRes, runsRes] = await Promise.all([
    instantlyBoardPromise,
    listPipelineCampaigns(supabase),
    supabase
      .from('compass_wave_briefs')
      .select('id,next_campaign_ids,next_status,recommendation,generated_at')
      .eq('id', day)
      .maybeSingle(),
    supabase
      .from('compass_wave_briefs')
      .select('id,next_campaign_ids,next_status,recommendation,generated_at')
      .eq('next_status', 'accepted')
      .neq('id', day)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('compass_pathway_runs')
      .select('id,campaign_id,status,detail,created_at')
      .order('created_at', { ascending: false })
      .limit(40)
  ])

  const byId = new Map(campaigns.map((row) => [row.id, row]))
  const instantlyById = new Map([...board.live, ...(board.history ?? [])].map((row) => [row.id, row]))
  const liveLane = campaigns.filter((row) => (row.wave_lane || '') === 'live' || row.status === 'active')
  const { sending } = buildLiveDesk({
    liveCampaigns: liveLane,
    allCampaigns: campaigns,
    instantlyById,
    instantlyRows: board.live
  })

  const resolved = resolveHomeNext({
    today: asBrief(todayRes.data),
    lastAccepted: asBrief(acceptedRes.data)
  })

  const latestRun = new Map<string, { status: PathwayRunStatus; detail: string | null }>()
  for (const run of runsRes.data ?? []) {
    const campaignId = String(run.campaign_id || '')
    if (!campaignId || latestRun.has(campaignId)) continue
    latestRun.set(campaignId, {
      status: (run.status as PathwayRunStatus) || 'queued',
      detail: run.detail ?? null
    })
  }

  function decorateNext(ids: string[]): MorningNextCard[] {
    return ids.map((id) => {
      const card = campaignCard(byId.get(id), id)
      const run = latestRun.get(id)
      if (run) {
        card.buildStatus = run.status
        card.runDetail = run.detail
      }
      return card
    })
  }

  const sendingCards: MorningSendingCard[] = sending.map((item) => {
    const campaign = item.campaign
    const instantly = item.instantly
    const remaining = Math.max(0, instantly?.remaining || 0)
    const instantlyId = instantly?.id || campaign?.instantly_campaign_id || null
    const bound = Boolean(instantlyId)
    const copyConfirmed = Boolean(campaign?.copy_confirmed_at)
    return {
      key: item.key,
      campaignId: campaign?.id ?? null,
      instantlyId,
      name: campaign?.name || instantly?.name || 'Sending',
      remaining,
      lowRemaining: remainingIsLow(remaining),
      copyConfirmed,
      openerReviewed: Boolean(campaign?.opener_reviewed_at),
      copyBlocked: bound && !copyConfirmed,
      instantlyHref: instantlyId
        ? `https://app.instantly.ai/app/campaign/${encodeURIComponent(instantlyId)}`
        : null,
      deskHref: campaign?.id
        ? `/sales/outbound?campaign=${encodeURIComponent(campaign.id)}`
        : '/sales/outbound'
    }
  })

  return {
    sydneyDate: day,
    briefStatus: resolved.briefStatus,
    landUnlocked: resolved.landUnlocked,
    recommendation: todayRes.data?.recommendation ?? acceptedRes.data?.recommendation ?? null,
    instantlyRepliesWaiting,
    sending: sendingCards,
    activeNext: decorateNext(resolved.activeNextIds),
    proposedNext: decorateNext(resolved.proposedNextIds)
  }
}
