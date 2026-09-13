import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  dateOnlyInZone,
  defaultGoLiveAt,
  parseGoLiveAt
} from '@/lib/campaigns'
import {
  coldExpressionFromSequence,
  isValidSequence,
  type OutboundSequence
} from '@/lib/outbound-copy'
import {
  insertPipelineCampaign,
  listPipelineCampaigns
} from '@/lib/campaigns-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const campaigns = await listPipelineCampaigns(supabase)
    return portalJsonCached({ campaigns }, {}, 5)
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
    name?: string
    status?: string
    priority?: number
    health?: string
    start_date?: string | null
    end_date?: string | null
    go_live_at?: string | null
    color?: string
    summary?: string | null
    labels?: string[]
    owner_label?: string | null
    instantly_campaign_id?: string | null
    offer_key?: string | null
    structure_id?: string | null
    opener_mode?: string | null
    vertical_tags?: string[]
    location_tags?: string[]
    cold_expression?: string | null
    sequence_draft?: OutboundSequence | null
    copy_status?: string
    experiment_factor?: string
    experiment_role?: string
    experiment_status?: string
    parent_campaign_id?: string | null
    hypothesis?: string | null
    wave_lane?: string | null
    wave_rationale?: string | null
    wave_list_size?: number | null
    wave_copy_strategy?: string | null
    wave_approach?: string | null
    testing_variable?: string | null
    sample_size_target?: number | null
    expression_key?: string | null
    cta_type?: string | null
  }
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })

  if (body.sequence_draft != null && !isValidSequence(body.sequence_draft)) {
    return portalJson({ error: 'invalid_sequence' }, { status: 400 })
  }

  const parsedGoLiveRes = parseGoLiveAt(
    body.go_live_at === undefined ? defaultGoLiveAt() : body.go_live_at
  )
  const parsedGoLive = parsedGoLiveRes.ok ? parsedGoLiveRes.iso : null
  const inferredStartDate = parsedGoLive ? dateOnlyInZone(parsedGoLive) : null
  const startDate = body.start_date !== undefined ? body.start_date : inferredStartDate
  const inferredColdExpression =
    body.cold_expression !== undefined
      ? body.cold_expression
      : body.sequence_draft
        ? coldExpressionFromSequence(body.sequence_draft)
        : null

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const created = await insertPipelineCampaign(supabase, {
      name,
      status: body.status,
      priority: body.priority,
      health: body.health,
      start_date: startDate,
      end_date: body.end_date ?? null,
      go_live_at: parsedGoLive,
      color: body.color,
      summary: body.summary ?? null,
      labels: body.labels,
      owner_label: body.owner_label ?? null,
      instantly_campaign_id: body.instantly_campaign_id,
      offer_key: body.offer_key,
      structure_id: body.structure_id,
      opener_mode: body.opener_mode,
      vertical_tags: body.vertical_tags,
      location_tags: body.location_tags,
      cold_expression: inferredColdExpression,
      sequence_draft: body.sequence_draft ?? null,
      copy_status: body.copy_status,
      hypothesis: body.hypothesis,
      experiment_factor: body.experiment_factor,
      experiment_role: body.experiment_role,
      experiment_status: body.experiment_status,
      parent_campaign_id: body.parent_campaign_id,
      wave_lane: body.wave_lane ?? 'next',
      wave_rationale: body.wave_rationale,
      wave_list_size: body.wave_list_size,
      wave_copy_strategy: body.wave_copy_strategy,
      wave_approach: body.wave_approach,
      testing_variable: body.testing_variable,
      sample_size_target: body.sample_size_target ?? null,
      expression_key: body.expression_key,
      cta_type: body.cta_type
    })
    return portalJson({ campaign: created })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'create_failed'
    return portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
