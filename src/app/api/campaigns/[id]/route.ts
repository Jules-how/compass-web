import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { projectCampaignCopy, type CompassCampaign } from '@/lib/campaigns'
import {
  coldExpressionFromSequence,
  isValidSequence,
  type OutboundSequence
} from '@/lib/outbound-copy'
import {
  buildWaveSnapshot,
  summarizeWaveLeads,
  type WaveSnapshot
} from '@/lib/campaign-wave'
import {
  getPipelineCampaignRow,
  listCampaignActivity,
  updatePipelineCampaignRow
} from '@/lib/campaigns-server'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadWaveForCampaign(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  campaign: CompassCampaign
): Promise<WaveSnapshot> {
  const { data } = await supabase
    .from('lead_contacts')
    .select('enrich_status,opener,email,company,outbound_status,opener_track,opener_kind,icp_status')
    .eq('pipeline_campaign_id', campaign.id)
    .limit(5000)
  const leads = summarizeWaveLeads(data ?? [])
  return buildWaveSnapshot({ campaign, leads, instantly: null, includeCopyMatch: true })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const campaign = await getPipelineCampaignRow(supabase, id)
    if (!campaign) return portalJson({ error: 'not_found' }, { status: 404 })
    const [activity, wave] = await Promise.all([
      listCampaignActivity(supabase, id),
      loadWaveForCampaign(supabase, campaign)
    ])
    return portalJsonCached(
      {
        campaign: projectCampaignCopy(campaign),
        milestones: [],
        activity,
        wave
      },
      {},
      5
    )
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'fetch_failed'
    return portalJson({ error: 'fetch_failed', detail: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  if (body.sequence_draft != null && !isValidSequence(body.sequence_draft as OutboundSequence)) {
    return portalJson({ error: 'invalid_sequence' }, { status: 400 })
  }

  if (body.sequence_draft && body.cold_expression === undefined) {
    const locked = coldExpressionFromSequence(body.sequence_draft as OutboundSequence)
    if (locked) body.cold_expression = locked
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await getPipelineCampaignRow(supabase, id)
    if (!existing) return portalJson({ error: 'not_found' }, { status: 404 })
    const updated = await updatePipelineCampaignRow(supabase, id, body)
    await supabase.from('compass_pipeline_activity').insert({
      id: `act-${crypto.randomUUID()}`,
      campaign_id: id,
      actor: 'operator',
      action: 'campaign_updated',
      body: `Campaign "${updated.name}" updated`
    })
    return portalJson({ campaign: updated })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'update_failed'
    if (message === 'not_found') return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ error: 'update_failed', detail: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { error } = await supabase.from('compass_pipeline_campaigns').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return portalJson({ ok: true })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'delete_failed'
    return portalJson({ error: 'delete_failed', detail: message }, { status: 500 })
  }
}
