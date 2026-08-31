import 'server-only'

/**
 * MCC linking helpers.
 * Docs: https://developers.google.com/google-ads/api/docs/account-management/linking-manager-accounts
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { appendEvidence } from '@/lib/events'
import { GoogleAdsApiClient, customerResource } from '@/lib/google-attach/api'
import { googleAdsLoginCustomerId } from '@/lib/google-attach/oauth'
import { normalizeCustomerId } from '@/lib/google-attach/plan'

export type MccLinkStatus = 'PENDING' | 'ACTIVE' | 'REFUSED' | 'CANCELED' | 'INACTIVE' | 'UNKNOWN' | 'NOT_LINKED'

export type MccLinkPollResult = {
  status: MccLinkStatus
  managerLinkId?: string
  resourceName?: string
}

function managerClient(): { mccId: string } {
  const mccId = googleAdsLoginCustomerId()
  if (!mccId) throw new Error('google_ads_login_customer_id_missing')
  return { mccId }
}

/**
 * Send CustomerClientLink invite (manager context).
 * Step 1 of linking-manager-accounts guide.
 */
export async function sendMccInvite(input: {
  refreshToken: string
  clientCustomerId: string
}): Promise<{ resourceName: string; status: MccLinkStatus }> {
  const { mccId } = managerClient()
  const clientId = normalizeCustomerId(input.clientCustomerId)
  if (!clientId) throw new Error('customer_id_required')

  const api = new GoogleAdsApiClient({
    refreshToken: input.refreshToken,
    customerId: mccId,
    loginCustomerId: mccId
  })

  const clientLinkResource = `customers/${mccId}/customerClientLinks/~${Date.now()}`
  const response = await api.mutate([
    {
      customerClientLinkOperation: {
        create: {
          clientCustomer: customerResource(clientId),
          status: 'PENDING'
        }
      }
    }
  ])

  const created = response.mutateOperationResponses[0]?.customerClientLinkResult as
    | { resourceName?: string }
    | undefined
  const resourceName = created?.resourceName || clientLinkResource

  return { resourceName, status: 'PENDING' }
}

/**
 * Poll link status from manager context via GAQL on customer_client_link.
 */
export async function pollMccLinkStatus(input: {
  refreshToken: string
  clientCustomerId: string
}): Promise<MccLinkPollResult> {
  const { mccId } = managerClient()
  const clientId = normalizeCustomerId(input.clientCustomerId)
  if (!clientId) return { status: 'NOT_LINKED' }

  const api = new GoogleAdsApiClient({
    refreshToken: input.refreshToken,
    customerId: mccId,
    loginCustomerId: mccId
  })

  const query = `
    SELECT
      customer_client_link.resource_name,
      customer_client_link.status,
      customer_client_link.manager_link_id,
      customer_client_link.client_customer
    FROM customer_client_link
    WHERE customer_client_link.client_customer = 'customers/${clientId}'
    ORDER BY customer_client_link.id DESC
    LIMIT 1
  `

  const rows = await api.searchStream<{
    customerClientLink?: {
      resourceName?: string
      status?: string
      managerLinkId?: string
    }
  }>(query)

  const link = rows[0]?.customerClientLink
  if (!link?.status) return { status: 'NOT_LINKED' }

  const status = String(link.status).toUpperCase() as MccLinkStatus
  return {
    status,
    managerLinkId: link.managerLinkId ? String(link.managerLinkId) : undefined,
    resourceName: link.resourceName
  }
}

export async function emitMccLinkEvent(
  supabase: SupabaseClient,
  input: {
    clientId: string
    status: MccLinkStatus
    clientCustomerId: string
    managerLinkId?: string
  }
): Promise<void> {
  const typeByStatus: Partial<Record<MccLinkStatus, string>> = {
    PENDING: 'google.mcc.invite_sent',
    ACTIVE: 'google.mcc.link_active',
    REFUSED: 'google.mcc.link_refused',
    CANCELED: 'google.mcc.invite_canceled',
    INACTIVE: 'google.mcc.link_inactive'
  }
  const type = typeByStatus[input.status]
  if (!type) return

  await appendEvidence(supabase, {
    client_id: input.clientId,
    source: 'google_attach',
    type,
    native_id: `${input.clientCustomerId}:${input.status}`,
    payload: {
      client_customer_id: input.clientCustomerId,
      manager_link_id: input.managerLinkId ?? null,
      link_status: input.status
    }
  })
}

export async function inviteMccForAttach(
  supabase: SupabaseClient,
  input: {
    clientId: string
    attachId: string
    refreshToken: string
    customerId: string
  }
): Promise<{ linkStatus: MccLinkStatus; googleIdsPatch: Record<string, unknown> }> {
  const invite = await sendMccInvite({
    refreshToken: input.refreshToken,
    clientCustomerId: input.customerId
  })

  await emitMccLinkEvent(supabase, {
    clientId: input.clientId,
    status: invite.status,
    clientCustomerId: input.customerId
  })

  return {
    linkStatus: invite.status,
    googleIdsPatch: {
      customer_client_link: invite.resourceName
    }
  }
}

export async function refreshMccLinkForAttach(
  supabase: SupabaseClient,
  input: {
    clientId: string
    refreshToken: string
    customerId: string
  }
): Promise<MccLinkPollResult> {
  const result = await pollMccLinkStatus({
    refreshToken: input.refreshToken,
    clientCustomerId: input.customerId
  })
  if (result.status !== 'NOT_LINKED' && result.status !== 'UNKNOWN') {
    await emitMccLinkEvent(supabase, {
      clientId: input.clientId,
      status: result.status,
      clientCustomerId: input.customerId,
      managerLinkId: result.managerLinkId
    })
  }
  return result
}
