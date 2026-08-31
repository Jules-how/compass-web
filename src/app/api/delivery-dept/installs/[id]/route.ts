import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'
import { getInstall, mutateInstall } from '@/lib/delivery-dept/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { id } = await context.params
    const payload = await getInstall(supabase, id)
    return portalJson(payload)
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    if (err instanceof Error && err.message === 'not_found') {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }
    console.error('[delivery-dept/id]', err)
    return portalJson({ error: 'load_failed' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { id } = await context.params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '')
    const payload = await mutateInstall(supabase, id, action, body)
    return portalJson(payload)
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    const message = err instanceof Error ? err.message : 'mutate_failed'
    console.error('[delivery-dept/id]', err)
    return portalJson({ error: message }, { status: 400 })
  }
}
