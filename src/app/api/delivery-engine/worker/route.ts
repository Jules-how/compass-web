import { portalJson } from '@/lib/portal-http'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { validSecret } from '@/lib/delivery-engine/http'
import { deliveryError, serverStore } from '@/lib/delivery-engine/server'
import { createDeliveryProviders } from '@/lib/delivery-engine/providers'
import { runDeliveryWorker } from '@/lib/delivery-engine/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const expected = process.env.COMPASS_DELIVERY_WORKER_SECRET
  if (!expected || expected.length < 24) return portalJson({ error: 'Worker is not configured' }, { status: 503 })
  if (!validSecret(request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null, expected)) return portalJson({ error: 'Unauthorized' }, { status: 401 })
  try {
    const store = serverStore()
    const { data: accounts, error } = await getPortalAdminClient().from('delivery_accounts').select('id').eq('enabled', true).eq('mode', 'live')
    if (error) throw error
    // Do not advance demo timelines from a real-time scheduler.
    const results = []
    const deadline = Date.now() + 40_000
    for (const account of accounts ?? []) {
      if (Date.now() >= deadline) break
      results.push({ accountId: account.id, ...await runDeliveryWorker({ store, providers: createDeliveryProviders({ busy: ctx => store.busy(ctx), deadline }), accountId: account.id, limit: 10, liveEnabled: process.env.COMPASS_DELIVERY_LIVE === '1', deadline }) })
    }
    return portalJson({ results })
  } catch (error) { return deliveryError(error) }
}
