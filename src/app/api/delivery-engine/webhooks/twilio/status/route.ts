import { z } from 'zod'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { DeliveryHttpError, verifiedTwilioForm } from '@/lib/delivery-engine/http'
import { deliveryAccount, deliveryError, serverStore } from '@/lib/delivery-engine/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const form = await verifiedTwilioForm(request)
    const jobId = z.string().uuid().parse(new URL(request.url).searchParams.get('job'))
    const { data: job, error } = await getPortalAdminClient().from('delivery_jobs').select('account_id,enquiry_id,kind').eq('id', jobId).maybeSingle()
    if (error) throw error
    if (!job || job.kind !== 'sms') throw new DeliveryHttpError(404, 'Message job not found')
    const account = await deliveryAccount(job.account_id)
    const { data: enquiry, error: enquiryError } = await getPortalAdminClient().from('delivery_enquiries').select('phone').eq('id', job.enquiry_id).eq('account_id', account.id).maybeSingle()
    if (enquiryError) throw enquiryError
    if (account.mode !== 'live' || account.twilio_account_sid !== form.get('AccountSid') || account.twilio_number !== form.get('From') || enquiry?.phone !== form.get('To')) throw new DeliveryHttpError(403, 'Message account mismatch')
    // A valid delivery receipt is accepted even if the account has since been paused.
    await serverStore().rpc('delivery_message_status', { p_account_id: account.id, p_provider_id: form.get('MessageSid'), p_status: form.get('MessageStatus'), p_now: new Date().toISOString() })
    return portalJson({ received: true })
  } catch (error) { return deliveryError(error) }
}
