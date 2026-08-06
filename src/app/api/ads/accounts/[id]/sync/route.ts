import type { NextRequest } from 'next/server'

import {
  AD_ACCOUNT_LIST_COLUMNS,
  type AdAccountRow
} from '@/lib/ad-accounts'
import { rebuildHomeGlance, syncAdAccount } from '@/lib/ad-sync'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id } = await context.params
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_ad_accounts')
      .select(AD_ACCOUNT_LIST_COLUMNS)
      .eq('id', id)
      .maybeSingle()

    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })

    const account = data as AdAccountRow
    try {
      const result = await syncAdAccount(supabase, account)
      const glance = await rebuildHomeGlance(supabase)
      return portalJson({
        ok: true,
        creativeCount: result.creatives.length,
        glance
      })
    } catch (syncErr) {
      const message = syncErr instanceof Error ? syncErr.message : 'sync_failed'
      await supabase
        .from('compass_ad_accounts')
        .update({
          status: 'error',
          last_error: message,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      return portalJson({ error: 'sync_failed', detail: message }, { status: 400 })
    }
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'sync_failed' }, { status: 500 })
  }
}
