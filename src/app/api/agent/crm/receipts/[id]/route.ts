import { handleCrmRead } from '@/lib/crm-research-api'
import { crmErrorResponse } from '@/lib/crm-research-http'
import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(request: Request, context: {params: Promise<{id:string;kind?:string}>}) {
  const auth = requireAgentAuth(request)
  if (auth) return auth
  try {
    const params = await context.params
    return await handleCrmRead(getPortalAdminClient(), 'receipt', request, params.id, params.kind)
  } catch (error) { return crmErrorResponse(error) }
}
