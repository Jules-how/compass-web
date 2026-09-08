import { reconcileCheckout, verifyStripeEvent } from '@/lib/agreement-server'
import { portalJson } from '@/lib/portal-http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const body = await request.text()
  if (body.length > 1000000)
    return portalJson({ error: 'Payload too large.' }, { status: 413 })
  let event
  try {
    event = verifyStripeEvent(
      body,
      request.headers.get('stripe-signature') || '',
    )
  } catch {
    return portalJson({ error: 'Invalid signature.' }, { status: 400 })
  }
  try {
    if (
      [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
      ].includes(event.type) &&
      event.data?.object?.metadata?.agreement_id
    )
      await reconcileCheckout(event.data.object)
    return portalJson({ received: true })
  } catch {
    return portalJson(
      { error: 'Payment confirmation will be retried.' },
      { status: 500 },
    )
  }
}
