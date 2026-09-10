import { requirePortalAccess } from '@/lib/portal-access'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalAccessResponse, portalJson, requireSameOrigin } from '@/lib/portal-http'
import { syncInstantlyGlance } from '@/lib/agent-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Refresh only provider analytics. Never send, activate or change lead/task state.
export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    await requirePortalAccess({ operator: true })
    const { result } = await syncInstantlyGlance(getPortalAdminClient())
    return portalJson(result, { status: result.ok ? 200 : 502 })
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'Unable to refresh Instantly. The previous snapshot has been retained.' }, { status: 502 })
  }
}
