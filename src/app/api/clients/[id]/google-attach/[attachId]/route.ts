import type { NextRequest } from 'next/server'

import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { runGoogleAttachAction } from '@/lib/google-attach/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string; attachId: string }>
}

const ACTIONS = new Set(['invite_mcc', 'push_paused', 'archive'])

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId, attachId } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action.trim() : ''
  if (!ACTIONS.has(action)) {
    return portalJson({ error: 'action_required' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const attach = await runGoogleAttachAction(supabase, {
      clientId,
      attachId,
      action: action as 'invite_mcc' | 'push_paused' | 'archive'
    })
    return portalJson(attach)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'action_failed'
    if (message === 'attach_not_found') return portalJson({ error: message }, { status: 404 })
    if (
      message.startsWith('google_ads_not_configured') ||
      message === 'google_ads_refresh_token_missing' ||
      message === 'customer_id_required' ||
      message.startsWith('mcc_link_not_active')
    ) {
      return portalJson({ error: message }, { status: 400 })
    }
    return portalAccessResponse(err) ?? portalJson({ error: message }, { status: 500 })
  }
}
