import 'server-only'
import { z } from 'zod'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'
import { DeliveryStore } from './store'
import { DeliveryHttpError } from './http'
import type { DeliveryAccount } from './types'

// Call only after operator authentication, account ingest authentication, or verified provider signature.
export const serverStore = () => new DeliveryStore(getPortalAdminClient())

export async function deliveryAccount(id: string): Promise<DeliveryAccount> {
  const { data, error } = await getPortalAdminClient().from('delivery_accounts').select('id,client_id,mode,enabled,config,twilio_number,twilio_account_sid,calendar_id,crm_kind,demo_now').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new DeliveryHttpError(404, 'Account not found')
  return data as DeliveryAccount
}

export function deliveryError(error: unknown): Response {
  const access = portalAccessResponse(error)
  if (access) return access
  if (error instanceof DeliveryHttpError) return portalJson({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return portalJson({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 })
  const message = error instanceof Error ? error.message : ''
  if (message === 'provider_reconciliation_required') return portalJson({ error: 'Reconcile the uncertain result in Twilio or the calendar before resuming. Keep the enquiry under office handling.' }, { status: 409 })
  if (/contact_opted_out|sms_permission_missing|enquiry_not_found|account_unavailable|demo_only|invalid_command|invalid_demo_advance/.test(message)) return portalJson({ error: message }, { status: 409 })
  // No customer text, credentials, provider payloads, or database internals in logs/responses.
  console.error('[delivery-engine] request failed', error instanceof Error ? error.name : 'UnknownError')
  return portalJson({ error: 'Delivery workspace is unavailable. Check the database migration and server configuration.' }, { status: 503 })
}
