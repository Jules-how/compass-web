import { getPortalAdminClient } from '@/lib/portal-admin'
import { isOptOut, normalizeMobile } from '@/lib/delivery-engine/config'
import { DeliveryHttpError, verifiedTwilioForm } from '@/lib/delivery-engine/http'
import { deliveryError, serverStore } from '@/lib/delivery-engine/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const form = await verifiedTwilioForm(request)
    const { data: account, error } = await getPortalAdminClient().from('delivery_accounts').select('id,mode,enabled,twilio_account_sid').eq('twilio_number', form.get('To')).maybeSingle()
    if (error) throw error
    if (!account || account.mode !== 'live' || !account.enabled || account.twilio_account_sid !== form.get('AccountSid')) throw new DeliveryHttpError(404, 'Messaging account not found')
    let phone: string
    try { phone = normalizeMobile(form.get('From') ?? '') } catch { throw new DeliveryHttpError(400, 'An Australian mobile number is required') }
    const body = (form.get('Body') ?? '').trim()
    if (body.length > 1600) throw new DeliveryHttpError(400, 'Message is too long')
    // An attachment-only reply is retained and handed to the office by the bounded interpreter.
    await serverStore().receive({ accountId: account.id, providerId: form.get('MessageSid')!, phone, body,
      stop: form.get('OptOutType') === 'STOP' || isOptOut(body) }, new Date().toISOString())
    return new Response('<Response/>', { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' } })
  } catch (error) { return deliveryError(error) }
}
