import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import {
  dateOnlyInZone,
  defaultGoLiveAt,
  normalizeWaveLane,
  parseGoLiveAt
} from '@/lib/campaigns'
import { insertPipelineCampaign, listPipelineCampaigns } from '@/lib/campaigns-server'
import { mergeWaveBriefPayload } from '@/lib/wave-desk-persist'
import {
  InstantlyApiError,
  loadOutboundBoardFromInstantly,
  resolveInstantlyApiKey,
  type OutboundBoard
} from '@/lib/instantly'
import { loadLeadSummaryCounts } from '@/lib/lead-search'
import {
  groupCampaignsByWave,
  mondayOfSydneyWeek,
  normalizeWaveActionKind,
  normalizeWaveActionSource,
  normalizeWaveActionStatus,
  suggestWaveMoves,
  sydneyDateOnly,
  upcomingSendForecast,
  type WaveAction,
  type WaveBrief
} from '@/lib/wave-desk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY_BOARD: OutboundBoard = { live: [], history: [], liveCount: 0 }

export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  try {
    const admin = getPortalAdminClient()
    const apiKey = await resolveInstantlyApiKey(admin)
    let board = EMPTY_BOARD
    if (apiKey) {
      try {
        board = await loadOutboundBoardFromInstantly(apiKey)
      } catch (err) {
        if (!(err instanceof InstantlyApiError)) throw err
      }
    }

    const [campaigns, summary, actionsRes, briefsRes] = await Promise.all([
      listPipelineCampaigns(admin),
      loadLeadSummaryCounts(admin),
      admin
        .from('compass_wave_actions')
        .select('id,title,kind,detail,source,status,week_start,campaign_id,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(80),
      admin
        .from('compass_wave_briefs')
        .select('id,generated_at,recommendation,scan,created_at')
        .order('generated_at', { ascending: false })
        .limit(14)
    ])

    const instantlyById = new Map(
      [...board.live, ...(board.history ?? [])].map((row) => [row.id, row])
    )
    const grouped = groupCampaignsByWave(campaigns, instantlyById)
    const forecast = upcomingSendForecast(board)
    const suggestions = suggestWaveMoves({
      campaigns,
      instantly: [...board.live, ...(board.history ?? [])]
    })

    return portalJson({
      ok: true,
      generatedAt: new Date().toISOString(),
      sydneyDate: sydneyDateOnly(),
      columns: {
        recommended: grouped.recommended.map(compactCampaign),
        next: grouped.next.map(compactCampaign),
        live: grouped.live.map(compactCampaign)
      },
      outlook: {
        recontactReady: summary.recontact_ready ?? 0,
        emailsRemaining: forecast.remaining,
        liveCampaigns: forecast.liveCampaigns
      },
      instantly: {
        liveCount: board.liveCount,
        live: board.live.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          sent: row.sendCount,
          replies: row.replyCount,
          replyRate: row.replyRate,
          remaining: row.remaining
        }))
      },
      suggestions,
      actions: (actionsRes.data ?? []) as WaveAction[],
      briefs: (briefsRes.data ?? []) as WaveBrief[]
    })
  } catch (err) {
    console.error('[agent/outbound/waves]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'waves_failed' }, { status: 500 })
  }
}

function compactCampaign(row: {
  id: string
  name: string
  status: string
  offer_key?: string | null
  go_live_at?: string | null
  wave_rationale?: string | null
  wave_list_size?: number | null
  wave_copy_strategy?: string | null
  wave_approach?: string | null
  testing_variable?: string | null
  instantly_campaign_id?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
}) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    offerKey: row.offer_key ?? null,
    goLiveAt: row.go_live_at ?? null,
    rationale: row.wave_rationale ?? null,
    listSize: row.wave_list_size ?? null,
    copyStrategy: row.wave_copy_strategy ?? null,
    approach: row.wave_approach ?? null,
    testingVariable: row.testing_variable ?? null,
    instantlyCampaignId: row.instantly_campaign_id ?? null,
    trade: (row.vertical_tags ?? [])[0] ?? null,
    city: (row.location_tags ?? [])[0] ?? null
  }
}

export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: {
    recommendation?: string
    scan?: Record<string, unknown>
    actions?: Array<{
      title?: string
      kind?: string
      detail?: string
      source?: string
      status?: string
      week_start?: string | null
      campaign_id?: string | null
    }>
    recommend?: Array<{
      name?: string
      rationale?: string
      list_size?: number
      offer_key?: string
      copy_strategy?: string
      approach?: string
      testing_variable?: string
      vertical_tags?: string[]
      location_tags?: string[]
      go_live_at?: string | null
      wave_lane?: string
      instantly_campaign_id?: string | null
    }>
  } = {}
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const stamp = new Date().toISOString()
    const day = sydneyDateOnly()
    const createdCampaigns: Array<{ id: string; name: string }> = []
    const createdActions: Array<{ id: string; title: string }> = []

    if (body.recommendation?.trim() || body.scan) {
      const { data: existing } = await admin
        .from('compass_wave_briefs')
        .select('recommendation,scan,created_at')
        .eq('id', day)
        .maybeSingle()
      const merged = mergeWaveBriefPayload(existing, {
        recommendation: body.recommendation,
        scan: body.scan
      })
      const { error } = await admin.from('compass_wave_briefs').upsert({
        id: day,
        generated_at: stamp,
        recommendation: merged.recommendation,
        scan: merged.scan,
        created_at: merged.created_at ?? stamp
      })
      if (error) throw new Error(error.message)
    }

    for (const action of body.actions ?? []) {
      const title = action.title?.trim()
      if (!title) continue
      const row = {
        id: `wave-act-${crypto.randomUUID()}`,
        title,
        kind: normalizeWaveActionKind(action.kind),
        detail: action.detail?.trim() || null,
        source: normalizeWaveActionSource(action.source),
        status: normalizeWaveActionStatus(action.status),
        week_start: action.week_start || mondayOfSydneyWeek(),
        campaign_id: action.campaign_id?.trim() || null,
        created_at: stamp,
        updated_at: stamp
      }
      const { error } = await admin.from('compass_wave_actions').insert(row)
      if (error) throw new Error(error.message)
      createdActions.push({ id: row.id, title: row.title })
    }

    const existingCampaigns = await listPipelineCampaigns(admin)
    for (const rec of body.recommend ?? []) {
      const name = rec.name?.trim()
      if (!name) continue
      const instantlyId = rec.instantly_campaign_id?.trim() || null
      if (instantlyId) {
        const bound = existingCampaigns.find((row) => row.instantly_campaign_id === instantlyId)
        if (bound) {
          createdCampaigns.push({ id: bound.id, name: bound.name })
          continue
        }
      }
      const lane = normalizeWaveLane(rec.wave_lane) || 'recommended'
      const parsed = parseGoLiveAt(rec.go_live_at || defaultGoLiveAt())
      const goLive = parsed.ok && parsed.iso ? parsed.iso : defaultGoLiveAt()
      const created = await insertPipelineCampaign(admin, {
        name,
        status: lane === 'live' ? 'active' : 'planned',
        go_live_at: goLive,
        start_date: dateOnlyInZone(goLive),
        offer_key: rec.offer_key === undefined ? 'booked-jobs-system' : rec.offer_key.trim() || null,
        instantly_campaign_id: instantlyId,
        vertical_tags: rec.vertical_tags,
        location_tags: rec.location_tags,
        wave_lane: lane,
        wave_rationale: rec.rationale,
        wave_list_size: rec.list_size ?? 150,
        wave_copy_strategy: rec.copy_strategy,
        wave_approach: rec.approach,
        testing_variable: rec.testing_variable,
        summary: rec.rationale || null
      })
      createdCampaigns.push({ id: created.id, name: created.name })
      existingCampaigns.push(created)
    }

    return portalJson({
      ok: true,
      briefId: body.recommendation?.trim() || body.scan ? day : null,
      campaigns: createdCampaigns,
      actions: createdActions
    })
  } catch (err) {
    console.error('[agent/outbound/waves POST]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'waves_write_failed' }, { status: 500 })
  }
}
