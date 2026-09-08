import { requirePortalAccess } from '@/lib/portal-access'
import { getPortalAdminClient } from '@/lib/portal-admin'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { getPreparationState } from '@/lib/outbound-preparation-server'
import { executePreparationCommand } from '@/lib/outbound-preparation-command'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type RouteContext = { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    return portalJson(
      await getPreparationState(supabase, (await context.params).id)
    )
  } catch (err) {
    return (
      portalAccessResponse(err) ??
      portalJson(
        { error: err instanceof Error ? err.message : 'preparation_failed' },
        { status: 409 }
      )
    )
  }
}
export async function POST(request: Request, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const body = await readBoundedJson(request, 8 * 1024 * 1024)
    // The service client writes worker-owned records only after operator access;
    // approval itself executes with the authenticated human's database session.
    return portalJson(
      await executePreparationCommand(
        getPortalAdminClient(),
        (await context.params).id,
        body,
        supabase
      )
    )
  } catch (err) {
    return (
      portalAccessResponse(err) ??
      portalJson(
        { error: err instanceof Error ? err.message : 'preparation_failed' },
        { status: 409 }
      )
    )
  }
}
