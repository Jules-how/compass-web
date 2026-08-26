import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { activateReactivationList, emitReactivationEvent } from '@/lib/reactivation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string; listId: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId, listId } = await context.params

  let body: { action?: string; confirm?: boolean; licensee_signoff?: boolean }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const action = body.action?.trim()
  if (action !== 'activate' && action !== 'pause') {
    return portalJson({ error: 'invalid_action' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    if (action === 'pause') {
      const stamp = new Date().toISOString()
      const { error } = await supabase
        .from('compass_reactivation_lists')
        .update({ status: 'paused', updated_at: stamp })
        .eq('id', listId)
        .eq('client_id', clientId)
      if (error) return portalJson({ error: 'pause_failed' }, { status: 400 })
      return portalJson({ ok: true, status: 'paused' })
    }

    if (!body.confirm) {
      return portalJson({ error: 'confirm_required' }, { status: 400 })
    }

    const result = await activateReactivationList(supabase, {
      listId,
      clientId,
      licenseeSignoff: Boolean(body.licensee_signoff)
    })

    if (!result.ok) {
      const status =
        result.error === 'licensee_signoff_required'
          ? 403
          : result.error === 'not_found'
            ? 404
            : 400
      return portalJson({ error: result.error }, { status })
    }

    await emitReactivationEvent(supabase, {
      clientId,
      type: 'sequence.activated',
      nativeId: `activate-${listId}`,
      payload: { list_id: listId, enrolled: result.enrolled }
    })

    return portalJson({ ok: true, status: 'active', enrolled: result.enrolled })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'activate_failed' }, { status: 500 })
  }
}
