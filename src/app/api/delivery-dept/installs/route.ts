import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'
import { listInstallBoard, resetDemoInstalls } from '@/lib/delivery-dept/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const source = new URL(request.url).searchParams.get('source') || 'all'
    const board = await listInstallBoard(supabase, source)
    return portalJson(board)
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    console.error('[delivery-dept]', err)
    return portalJson({ error: 'load_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requirePortalAccess({ operator: true })
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action === 'reset_demo') {
      resetDemoInstalls()
      return portalJson({ ok: true })
    }
    return portalJson({ error: 'unknown_action' }, { status: 400 })
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    return portalJson({ error: 'mutate_failed' }, { status: 500 })
  }
}
