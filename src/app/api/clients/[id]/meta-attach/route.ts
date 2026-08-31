import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { adsManagerDeepLink } from '@/lib/meta-attach/create-paused'
import { createMetaAttachDraft } from '@/lib/meta-attach/draft'
import { listMetaPackIds, loadMetaPack, resolveTradePackId } from '@/lib/meta-attach/pack'
import type { MetaAttachRow } from '@/lib/meta-attach/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

function enrichRow(row: MetaAttachRow, packId: string) {
  const review = row.review ?? {}
  return {
    ...row,
    pack_id: packId,
    ads_manager_url: adsManagerDeepLink(row.meta_ids ?? {}, review.meta_ad_account_id)
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const clientRes = await supabase
      .from('compass_clients')
      .select('id,name,industry,deal_terms,voice')
      .eq('id', clientId)
      .maybeSingle()
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const { data: rows, error } = await supabase
      .from('compass_meta_attach')
      .select('*')
      .eq('client_id', clientId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })

    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })

    const packId = resolveTradePackId(clientRes.data)
    let packOffers: string[] = []
    try {
      const pack = loadMetaPack(packId)
      packOffers = Object.keys(pack.offer_cells)
    } catch {
      packOffers = []
    }

    const attaches = (rows ?? []).map((row) =>
      enrichRow(row as MetaAttachRow, packId)
    )

    return portalJsonCached({
      clientId,
      clientName: clientRes.data.name,
      packId,
      packs: listMetaPackIds(),
      offerCells: packOffers,
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

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const clientRes = await supabase
      .from('compass_clients')
      .select('id,name,industry,deal_terms,voice')
      .eq('id', clientId)
      .maybeSingle()
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const body = (await readBoundedJson(request)) as {
      offer_cell?: string
      pack_id?: string
      destination_url?: string
    }

    const row = await createMetaAttachDraft(supabase, {
      client: clientRes.data,
      offerCell: body.offer_cell,
      packId: body.pack_id,
      destinationUrl: body.destination_url
    })

    const packId = body.pack_id?.trim() || resolveTradePackId(clientRes.data)
    return portalJson({ ok: true, attach: enrichRow(row, packId) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('meta_pack_not_found') || message.startsWith('meta_offer_cell_not_found')) {
      return portalJson({ error: message }, { status: 400 })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
