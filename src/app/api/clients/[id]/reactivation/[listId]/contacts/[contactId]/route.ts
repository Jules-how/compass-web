import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { emitReactivationEvent } from '@/lib/reactivation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string; listId: string; contactId: string }>
}

const ALLOWED_STATES = new Set(['booked', 'showed'])

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId, listId, contactId } = await context.params

  let body: { state?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const state = body.state?.trim()
  if (!state || !ALLOWED_STATES.has(state)) {
    return portalJson({ error: 'invalid_state' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const { data: list } = await supabase
      .from('compass_reactivation_lists')
      .select('id,client_id')
      .eq('id', listId)
      .eq('client_id', clientId)
      .maybeSingle()
    if (!list) return portalJson({ error: 'not_found' }, { status: 404 })

    const stamp = new Date().toISOString()
    const { error } = await supabase
      .from('compass_reactivation_contacts')
      .update({ state, last_event_at: stamp, updated_at: stamp })
      .eq('id', contactId)
      .eq('list_id', listId)

    if (error) return portalJson({ error: 'update_failed' }, { status: 400 })

    await emitReactivationEvent(supabase, {
      clientId,
      type: state === 'showed' ? 'booking.showed' : 'booking.confirmed',
      nativeId: `${state}-${contactId}-${Date.now()}`,
      payload: { contact_id: contactId, list_id: listId }
    })

    return portalJson({ ok: true, state })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
