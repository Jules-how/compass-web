import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { handleCrmWrite } from '@/lib/crm-research-api'
import { crmErrorResponse } from '@/lib/crm-research-http'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const auth = requireAgentAuth(request)
  if (auth) return auth
  try {
    return await handleCrmWrite(getPortalAdminClient(), request, 'agent')
  } catch (error) { return crmErrorResponse(error) }
}
