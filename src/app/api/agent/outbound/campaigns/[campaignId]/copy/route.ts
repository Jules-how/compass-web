import { requireAgentAuth } from '@/lib/agent-auth'
import {
  buildCampaignCopyPatch,
  CAMPAIGN_COPY_BODY_MAX_BYTES,
  campaignCopyCompact,
  wantsMinimalReturn
} from '@/lib/agent-outbound'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ campaignId: string }>
}

const COPY_SELECT =
  'id,name,offer_key,structure_id,opener_mode,vertical_tags,location_tags,cold_expression,copy_status,sequence_draft,hypothesis,experiment_factor,experiment_role,parent_campaign_id,experiment_status,sample_size_target,experiment_decision,expression_key,cta_type,instantly_campaign_id,opener_reviewed_at,copy_confirmed_at,updated_at'

export async function GET(request: Request, context: Ctx) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const { campaignId } = await context.params
  const full = new URL(request.url).searchParams.get('full') === '1'

  try {
    const admin = getPortalAdminClient()
    const { data, error } = await admin
      .from('compass_pipeline_campaigns')
      .select(COPY_SELECT)
      .eq('id', campaignId)
      .maybeSingle()
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({
      ok: true,
      full,
      campaign: campaignCopyCompact(data as Record<string, unknown>, full)
    })
  } catch (err) {
    console.error('[agent/outbound/campaign-copy/get]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const { campaignId } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, CAMPAIGN_COPY_BODY_MAX_BYTES)) as Record<string, unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('too large')) {
      return portalJson({ error: 'body_too_large' }, { status: 413 })
    }
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const existing = await admin
      .from('compass_pipeline_campaigns')
      .select('id,copy_confirmed_at')
      .eq('id', campaignId)
      .maybeSingle()
    if (existing.error) {
      return portalJson({ error: 'fetch_failed', detail: existing.error.message }, { status: 500 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const stamp = new Date().toISOString()
    const built = buildCampaignCopyPatch(body, stamp, {
      copy_confirmed_at: existing.data.copy_confirmed_at ?? null
    })
    if (!built.ok) return portalJson({ error: built.error }, { status: 400 })

    const { data, error } = await admin
      .from('compass_pipeline_campaigns')
      .update(built.row)
      .eq('id', campaignId)
      .select(COPY_SELECT)
      .single()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })

    if (wantsMinimalReturn(request)) {
      return portalJson({
        ok: true,
        id: data.id,
        updated_at: data.updated_at,
        copy_status: data.copy_status
      })
    }
    return portalJson({
      ok: true,
      campaign: campaignCopyCompact(data as Record<string, unknown>, true)
    })
  } catch (err) {
    console.error('[agent/outbound/campaign-copy/patch]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
