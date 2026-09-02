import { requireAgentAuth } from '@/lib/agent-auth'
import { InstantlyApiError, resolveInstantlyApiKey } from '@/lib/instantly'
import { duplicateFillCaptureTemplate, loadPipelineCampaign } from '@/lib/instantly-push'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: { campaignId?: string; name?: string; templateId?: string } = {}
  try {
    body = (await readBoundedJson(request, 8 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : ''
  const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : ''
  if (!name && !campaignId) {
    return portalJson({ error: 'name_or_campaignId_required' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const campaign = campaignId ? await loadPipelineCampaign(admin, campaignId) : null
    if (campaignId && !campaign) return portalJson({ error: 'not_found' }, { status: 404 })
    const apiKey = await resolveInstantlyApiKey(admin)
    if (!apiKey) return portalJson({ error: 'instantly_not_configured' }, { status: 503 })
    const result = await duplicateFillCaptureTemplate({
      supabase: admin,
      apiKey,
      name: name || campaign?.name || '',
      campaign,
      templateId: templateId || undefined
    })
    return portalJson({
      ok: true,
      instantlyCampaignId: result.instantlyCampaignId,
      templateId: result.templateId,
      name: result.name,
      bound: result.bound,
      campaign: result.campaign
    })
  } catch (err) {
    if (err instanceof InstantlyApiError) {
      return portalJson({ error: 'instantly_failed', detail: err.message }, { status: err.status })
    }
    console.error('[agent/instantly/duplicate-template]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'duplicate_failed' }, { status: 500 })
  }
}
