import { requireAgentAuth } from '@/lib/agent-auth'
import { InstantlyApiError, resolveInstantlyApiKey } from '@/lib/instantly'
import { loadPipelineCampaign, pushLeadsToInstantly } from '@/lib/instantly-push'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: {
    campaignId?: string
    leadIds?: string[]
    dryRun?: boolean
    skipIfInWorkspace?: boolean
    verifyOnImport?: boolean
    requireOpener?: boolean
  } = {}
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : ''
  if (!campaignId) return portalJson({ error: 'campaignId_required' }, { status: 400 })

  try {
    const admin = getPortalAdminClient()
    const campaign = await loadPipelineCampaign(admin, campaignId)
    if (!campaign) return portalJson({ error: 'not_found' }, { status: 404 })
    const apiKey = await resolveInstantlyApiKey(admin)
    if (!apiKey) return portalJson({ error: 'instantly_not_configured' }, { status: 503 })
    const result = await pushLeadsToInstantly({
      supabase: admin,
      campaign,
      apiKey,
      leadIds: Array.isArray(body.leadIds) ? body.leadIds.filter((v) => typeof v === 'string') : undefined,
      dryRun: body.dryRun === true,
      skipIfInWorkspace: body.skipIfInWorkspace,
      verifyOnImport: body.verifyOnImport,
      requireOpener: body.requireOpener
    })
    return portalJson({ ok: true, ...result })
  } catch (err) {
    if (err instanceof InstantlyApiError) {
      return portalJson({ error: 'instantly_failed', detail: err.message }, { status: err.status })
    }
    console.error('[agent/instantly/push-leads]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'push_failed' }, { status: 500 })
  }
}
