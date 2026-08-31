import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { createQboClient, verifyQboWebhookSignature } from '@/lib/qbo'
import { syncQboLedger } from '@/lib/qbo-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('intuit-signature')
  if (!verifyQboWebhookSignature(raw, signature)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let body: {
    eventNotifications?: Array<{
      dataChangeEvent?: { entities?: Array<{ name?: string; id?: string; operation?: string }> }
    }>
  }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const entities =
    body.eventNotifications?.flatMap((note) => note.dataChangeEvent?.entities ?? []) ?? []
  const interesting = entities.filter(
    (entity) => entity.name === 'Invoice' || entity.name === 'Payment' || entity.name === 'CreditMemo'
  )
  if (interesting.length === 0) return portalJson({ ok: true, ignored: true })

  try {
    const admin = getPortalAdminClient()
    const qbo = createQboClient({ supabase: admin })
    for (const entity of interesting) {
      if (entity.name === 'Invoice' && entity.id) {
        try {
          await qbo.fetchInvoice(entity.id)
        } catch {
          // Customer may not be linked in Compass yet.
        }
      }
    }
    const result = await syncQboLedger(admin)
    return portalJson(result)
  } catch (err) {
    console.error('[qbo/webhook]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'webhook_apply_failed' }, { status: 500 })
  }
}

export async function GET() {
  return portalJson({ ok: true, service: 'qbo-webhook' })
}
