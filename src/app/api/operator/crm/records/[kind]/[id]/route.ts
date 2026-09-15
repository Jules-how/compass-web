import { handleCrmRead } from '@/lib/crm-research-api'
import { crmErrorResponse } from '@/lib/crm-research-http'
import { requirePortalAccess } from '@/lib/portal-access'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(request: Request, context: {params: Promise<{id:string;kind?:string}>}) {
  try {
    const { supabase } = await requirePortalAccess({operator:true})
    const params = await context.params
    return await handleCrmRead(supabase, 'record', request, params.id, params.kind)
  } catch (error) { return crmErrorResponse(error) }
}
