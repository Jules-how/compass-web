import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { getPreparationState } from '@/lib/outbound-preparation-server'
import { executePreparationCommand } from '@/lib/outbound-preparation-command'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const error = requireAgentAuth(request)
  if (error) return error
  const campaign = new URL(request.url).searchParams.get('campaign_id')
  if (!campaign)
    return portalJson({ error: 'campaign_id_required' }, { status: 400 })
  try {
    return portalJson(
      await getPreparationState(getPortalAdminClient(), campaign)
    )
  } catch (err) {
    return portalJson(
      { error: err instanceof Error ? err.message : 'preparation_failed' },
      { status: 409 }
    )
  }
}
export async function POST(request: Request) {
  const error = requireAgentAuth(request)
  if (error) return error
  const campaign = new URL(request.url).searchParams.get('campaign_id')
  if (!campaign)
    return portalJson({ error: 'campaign_id_required' }, { status: 400 })
  try {
    const body = await readBoundedJson(request, 8 * 1024 * 1024)
    // Never pass an operator session to the secret-authenticated worker bridge.
    return portalJson(
      await executePreparationCommand(getPortalAdminClient(), campaign, body)
    )
  } catch (err) {
    return portalJson(
      { error: err instanceof Error ? err.message : 'preparation_failed' },
      { status: 409 }
    )
  }
}
