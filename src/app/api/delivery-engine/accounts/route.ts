import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { requirePortalAccess } from '@/lib/portal-access'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, requireSameOrigin } from '@/lib/portal-http'
import { configSchema } from '@/lib/delivery-engine/config'
import { boundedJson, DeliveryHttpError, secretHash } from '@/lib/delivery-engine/http'
import { deliveryError } from '@/lib/delivery-engine/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const provisioningSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  config: configSchema.strict(),
  twilioNumber: z.string().regex(/^\+614\d{8}$/),
  twilioAccountSid: z.string().regex(/^AC[a-fA-F0-9]{32}$/),
  calendarId: z.string().trim().min(1).max(300)
}).strict()

/** Prepare one repeatable client account. This endpoint cannot activate delivery or buy a phone number. */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    await requirePortalAccess({ operator: true })
    const input = provisioningSchema.parse(await boundedJson(request))
    if (input.twilioAccountSid !== process.env.TWILIO_ACCOUNT_SID) throw new DeliveryHttpError(400, 'Twilio account must match the configured transport account')
    const admin = getPortalAdminClient()
    const { data: client, error: clientError } = await admin.from('compass_clients').select('id').eq('id', input.clientId).maybeSingle()
    if (clientError) throw clientError
    if (!client) throw new DeliveryHttpError(404, 'Create the Compass client before provisioning delivery')
    const ingestKey = randomBytes(32).toString('base64url')
    const { data, error } = await admin.from('delivery_accounts').insert({
      client_id: input.clientId, mode: 'live', enabled: false, config: input.config,
      twilio_number: input.twilioNumber, twilio_account_sid: input.twilioAccountSid,
      calendar_id: input.calendarId, crm_kind: 'manual', ingest_key_hash: secretHash(ingestKey)
    }).select('id,enabled,mode').single()
    if (error?.code === '23505') throw new DeliveryHttpError(409, 'This client or phone number already has a delivery account')
    if (error) throw error
    return portalJson({ ...data, ingestKey, instruction: 'Save the intake credential in the landing-page server secret store. The account is paused.' }, { status: 201 })
  } catch (error) { return deliveryError(error) }
}
