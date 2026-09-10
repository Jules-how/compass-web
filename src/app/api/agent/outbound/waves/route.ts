import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { listPipelineCampaigns } from '@/lib/campaigns-server'
import { parseHomeSetupScan, dailySetupNoteMarker, composeDailySetupNotes } from '@/lib/home-setup'
import { readWaveDecision, WAVE_PUBLISHER } from '@/lib/wave-publication'
import { z } from 'zod'
import {
  InstantlyApiError,
  loadOutboundBoardFromInstantly,
  resolveInstantlyApiKey,
  type OutboundBoard
} from '@/lib/instantly'
import { loadLeadSummaryCounts } from '@/lib/lead-search'
import {
  groupCampaignsByWave,
  normalizeWaveActionKind,
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
    let instantlySource = apiKey ? 'live' : 'unavailable'
    if (apiKey) {
      try {
        board = await loadOutboundBoardFromInstantly(apiKey)
      } catch (err) {
        if (!(err instanceof InstantlyApiError)) throw err
        instantlySource = 'unavailable'
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
        .select('id,generated_at,recommendation,scan,created_at,revision,reviewed_at,publisher,run_id,decision_revision,metrics,metrics_updated_at,next_campaign_ids,next_status,resolved_at')
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
      publication: { publisher: WAVE_PUBLISHER, decisionNoteId: 'planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0', decisionRevision: (await readWaveDecision()).revision },
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
        source: instantlySource,
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
      briefs: (briefsRes.data ?? []).map(row => ({ ...row, scan: { ...row.scan, ...row.metrics } })) as WaveBrief[]
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
  try {
    const body = publicationSchema.parse(await readBoundedJson(request, 64 * 1024))
    const day = sydneyDateOnly()
    if (body.day !== day) return portalJson({ error: 'Publish only for the current Sydney day.' }, { status: 409 })
    const source = await readWaveDecision()
    if (source.revision !== body.decisionRevision) {
      return portalJson({ error: 'Decisions changed. Read the current decision note before publishing.' }, { status: 409 })
    }
    const setup = parseHomeSetupScan(body.scan)
    const payload = {
      publisher: body.publisher, runId: body.runId, decisionRevision: body.decisionRevision,
      recommendation: body.recommendation,
      // Editorial fields are replaced together; never retain yesterday's writeup under new advice.
      scan: body.scan,
      next_campaign_ids: body.next_campaign_ids,
      actions: body.actions.map(action => ({
        title: action.title, kind: normalizeWaveActionKind(action.kind),
        detail: action.detail ?? null, campaign_id: action.campaign_id ?? null
      })),
      tasks: setup.julesLed.map(item => ({
        title: item.title, marker: dailySetupNoteMarker(day, item.title),
        notes: composeDailySetupNotes(day, item.title, item.detail), task_type: item.taskType ?? 'THINK'
      }))
    }
    const { data, error } = await getPortalAdminClient().rpc('compass_publish_wave_brief', {
      p_day: day, p_expected_revision: body.expectedRevision, p_decision_value: source.value, p_payload: payload
    })
    if (error) {
      if (['40001', 'PT409'].includes(error.code)) return portalJson({ error: error.message }, { status: 409 })
      throw new Error('Brief publication failed. No partial brief or actions were saved.')
    }
    console.info('[wave-publication]', JSON.stringify({ day, publisher: body.publisher, runId: body.runId, decisionRevision: source.revision, revision: data.revision, replayed: data.replayed }))
    return portalJson(data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.warn('[wave-publication rejected]', JSON.stringify({ reason: 'publication_contract_required' }))
      return portalJson({ error: 'A current decision revision, expected brief revision, publisher, day and unique runId are required. Campaign creation uses the campaign API.', issues: err.issues.map(x => ({ path: x.path.join('.'), message: x.message })) }, { status: 400 })
    }
    console.error('[wave-publication failed]', err instanceof Error ? err.message : 'unknown')
    return portalJson({ error: 'Brief publication is unavailable. Reload and retry.' }, { status: 503 })
  }
}

const publicationSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  publisher: z.literal(WAVE_PUBLISHER),
  runId: z.string().regex(/^[a-zA-Z0-9._:-]{8,160}$/),
  decisionRevision: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(),
  recommendation: z.string().trim().min(1).max(12000),
  scan: z.object({
    writeup: z.string().max(40000).optional(), homeBlurb: z.string().max(2000).optional(),
    julesLed: z.array(z.object({ title: z.string().trim().min(1).max(300), detail: z.string().max(3000).optional(), task_type: z.string().optional() })).max(20).optional()
  }).strict().default({}),
  next_campaign_ids: z.array(z.string().min(1)).max(2).default([]),
  actions: z.array(z.object({ title: z.string().trim().min(1).max(300), kind: z.string().optional(), detail: z.string().max(3000).optional(), campaign_id: z.string().min(1).optional() }).strict()).max(30).default([])
}).strict()
