import { requirePortalAccess } from '@/lib/portal-access'
import { requireSameOrigin } from '@/lib/portal-http'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { handleCrmWrite } from '@/lib/crm-research-api'
import { crmErrorResponse } from '@/lib/crm-research-http'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const origin = requireSameOrigin(request)
  if (origin) return origin
  try {
    const { user } = await requirePortalAccess({operator:true})
    return await handleCrmWrite(getPortalAdminClient(), request, 'operator:'+user.id)
  } catch (error) { return crmErrorResponse(error) }
}
