import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { boundedJson, DeliveryHttpError, secretHash } from '@/lib/delivery-engine/http'
import { deliveryError, serverStore } from '@/lib/delivery-engine/server'
import { intakeSchema } from '@/lib/delivery-engine/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Server-to-server form submission. Never expose the account credential in a landing page. */
export async function POST(request: Request) {
  try {
    const key = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
    if (!key || key.length < 32 || key.length > 300) throw new DeliveryHttpError(401, 'Invalid intake credential')
    const { data: account, error } = await getPortalAdminClient().from('delivery_accounts').select('id,mode,enabled').eq('ingest_key_hash', secretHash(key)).maybeSingle()
    if (error) throw error
    if (!account || account.mode !== 'live' || !account.enabled) throw new DeliveryHttpError(401, 'Invalid intake credential')
    const value = intakeSchema.omit({ accountId: true }).parse(await boundedJson(request))
    const result = await serverStore().intake({ ...value, accountId: account.id })
    return portalJson(result, { status: result.duplicate ? 200 : 201 })
  } catch (error) { return deliveryError(error) }
}
