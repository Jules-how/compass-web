import { handleCrmRead } from '@/lib/crm-research-api'
import { crmErrorResponse } from '@/lib/crm-research-http'
import { requirePortalAccess } from '@/lib/portal-access'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePortalAccess({operator:true})
    return await handleCrmRead(supabase, 'collection', request)
  } catch (error) { return crmErrorResponse(error) }
}
