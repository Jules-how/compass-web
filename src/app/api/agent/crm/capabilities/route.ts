import { handleCrmRead } from '@/lib/crm-research-api'
import { crmErrorResponse } from '@/lib/crm-research-http'
import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const auth = requireAgentAuth(request)
  if (auth) return auth
  try {
    return await handleCrmRead(getPortalAdminClient(), 'capabilities', request)
  } catch (error) { return crmErrorResponse(error) }
}
