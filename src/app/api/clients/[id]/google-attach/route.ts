import type { NextRequest } from 'next/server'

import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { googleAdsApiConfigured } from '@/lib/google-attach/oauth'
import {
  createGoogleAttachDraft,
  enrichGoogleAttachList,
  getGoogleAttachRows
} from '@/lib/google-attach/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const clientRes = await supabase
      .from('compass_clients')
      .select('id,name')
      .eq('id', clientId)
      .maybeSingle()
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const rows = await getGoogleAttachRows(supabase, clientId)
    const attaches = await enrichGoogleAttachList(supabase, clientId, rows)

    return portalJsonCached({
      clientId,
      clientName: clientRes.data.name,
      config: googleAdsApiConfigured(),
      attaches
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: Record<string, unknown> = {}
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const attach = await createGoogleAttachDraft(supabase, {
      clientId,
      customerId: typeof body.customer_id === 'string' ? body.customer_id : undefined,
      destinationUrl: typeof body.destination_url === 'string' ? body.destination_url : undefined
    })
    return portalJson(attach, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed'
    if (message === 'client_not_found') return portalJson({ error: message }, { status: 404 })
    if (message === 'destination_required' || message === 'trade_pack_not_found') {
      return portalJson({ error: message }, { status: 400 })
    }
    return portalAccessResponse(err) ?? portalJson({ error: message }, { status: 500 })
  }
}
