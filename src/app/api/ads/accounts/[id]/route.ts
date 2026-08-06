import type { NextRequest } from 'next/server'

import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id } = await context.params
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { error } = await supabase.from('compass_ad_accounts').delete().eq('id', id)
    if (error) {
      return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    }
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
