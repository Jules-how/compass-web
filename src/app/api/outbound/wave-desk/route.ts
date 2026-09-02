import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { loadLeadSummaryCounts } from '@/lib/lead-search'
import {
  InstantlyApiError,
  loadOutboundBoardFromInstantly,
  resolveInstantlyApiKey,
  type OutboundBoard
} from '@/lib/instantly'
import {
  mondayOfSydneyWeek,
  normalizeWaveActionKind,
  normalizeWaveActionSource,
  normalizeWaveActionStatus,
  upcomingSendForecast,
  type WaveAction,
  type WaveBrief
} from '@/lib/wave-desk'

export const dynamic = 'force-dynamic'

const EMPTY_BOARD: OutboundBoard = { live: [], history: [], liveCount: 0 }

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const apiKey = await resolveInstantlyApiKey(supabase)
    let board = EMPTY_BOARD
    if (apiKey) {
      try {
        board = await loadOutboundBoardFromInstantly(apiKey)
      } catch (err) {
        if (!(err instanceof InstantlyApiError)) throw err
      }
    }

    const [summary, actionsRes, briefsRes] = await Promise.all([
      loadLeadSummaryCounts(supabase),
      supabase
        .from('compass_wave_actions')
        .select('id,title,kind,detail,source,status,week_start,campaign_id,created_at,updated_at')
        .order('week_start', { ascending: true, nullsFirst: false })
        .limit(80),
      supabase
        .from('compass_wave_briefs')
        .select('id,generated_at,recommendation,scan,created_at')
        .order('generated_at', { ascending: false })
        .limit(14)
    ])

    const forecast = upcomingSendForecast(board)
    return portalJsonCached({
      recontactReady: summary.recontact_ready ?? 0,
      emailsRemaining: forecast.remaining,
      liveCampaigns: forecast.liveCampaigns,
      thisWeekStart: mondayOfSydneyWeek(),
      actions: (actionsRes.data ?? []) as WaveAction[],
      briefs: (briefsRes.data ?? []) as WaveBrief[],
      actionsError: actionsRes.error?.message ?? null,
      briefsError: briefsRes.error?.message ?? null
    })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    title?: string
    kind?: string
    detail?: string
    source?: string
    status?: string
    week_start?: string | null
    campaign_id?: string | null
  }
  try {
    body = (await readBoundedJson(request, 8 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const title = body.title?.trim()
  if (!title) return portalJson({ error: 'title_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const stamp = new Date().toISOString()
    const row = {
      id: `wave-act-${crypto.randomUUID()}`,
      title,
      kind: normalizeWaveActionKind(body.kind),
      detail: body.detail?.trim() || null,
      source: normalizeWaveActionSource(body.source || 'jules'),
      status: normalizeWaveActionStatus(body.status),
      week_start: body.week_start || mondayOfSydneyWeek(),
      campaign_id: body.campaign_id?.trim() || null,
      created_at: stamp,
      updated_at: stamp
    }
    const { data, error } = await supabase
      .from('compass_wave_actions')
      .insert(row)
      .select('id,title,kind,detail,source,status,week_start,campaign_id,created_at,updated_at')
      .single()
    if (error) throw new Error(error.message)
    return portalJson({ action: data })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'create_failed'
    return portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
