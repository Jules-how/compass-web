import type { NextRequest } from 'next/server'

import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const offer = await supabase
      .from('compass_outbound_offers')
      .select('id,active_revision_id')
      .eq('id', id)
      .maybeSingle()
    if (offer.error) return portalJson({ error: 'fetch_failed', detail: offer.error.message }, { status: 500 })
    if (!offer.data) return portalJson({ error: 'not_found' }, { status: 404 })
    const revisions = await supabase
      .from('compass_offer_revisions')
      .select('*')
      .eq('offer_id', id)
      .order('version_no', { ascending: false })
    if (revisions.error) {
      return portalJson({ error: 'fetch_failed', detail: revisions.error.message }, { status: 500 })
    }
    return portalJsonCached({
      activeRevisionId: offer.data.active_revision_id,
      revisions: revisions.data ?? []
    })
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
