import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'
import { loadSopTemplate, saveSopTemplate } from '@/lib/delivery-dept/sop-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    return portalJson({ plan: await loadSopTemplate(supabase) })
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    return portalJson({ error: 'load_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const body = (await request.json().catch(() => ({}))) as { plan?: unknown }
    const plan = await saveSopTemplate(supabase, body.plan)
    return portalJson({ ok: true, plan })
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    const message = err instanceof Error ? err.message : 'save_failed'
    return portalJson({ error: message }, { status: 400 })
  }
}
