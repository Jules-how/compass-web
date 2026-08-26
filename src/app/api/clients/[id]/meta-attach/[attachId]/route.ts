import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { adsManagerDeepLink, orchestratePausedCreate } from '@/lib/meta-attach/create-paused'
import { emitMetaAttachEvent } from '@/lib/meta-attach/draft'
import { resolveMetaAttachDriver } from '@/lib/meta-attach/graph'
import { loadMetaPack, resolveTradePackId } from '@/lib/meta-attach/pack'
import type { MetaAttachCopy, MetaAttachReview, MetaAttachRow } from '@/lib/meta-attach/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string; attachId: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId, attachId } = await context.params

  let body: {
    action?: string
    confirm?: boolean
    copy?: MetaAttachCopy
    destination_url?: string
    canva_design_ids?: Record<string, string>
    review?: MetaAttachReview
    creative_brief?: Record<string, unknown>
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const action = body.action?.trim()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const { data: attach, error: fetchError } = await supabase
      .from('compass_meta_attach')
      .select('*')
      .eq('id', attachId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (fetchError) return portalJson({ error: 'fetch_failed', detail: fetchError.message }, { status: 500 })
    if (!attach) return portalJson({ error: 'not_found' }, { status: 404 })

    const row = attach as MetaAttachRow
    const stamp = new Date().toISOString()

    if (!action || action === 'save') {
      if (row.status === 'live') {
        return portalJson({ error: 'live_attach_read_only' }, { status: 403 })
      }
      const patch: Record<string, unknown> = { updated_at: stamp }
      if (body.copy) patch.copy = body.copy
      if (body.destination_url != null) patch.destination_url = body.destination_url.trim()
      if (body.canva_design_ids) patch.canva_design_ids = body.canva_design_ids
      if (body.review) patch.review = { ...row.review, ...body.review }
      if (body.creative_brief) patch.creative_brief = { ...row.creative_brief, ...body.creative_brief }

      const { data: updated, error } = await supabase
        .from('compass_meta_attach')
        .update(patch)
        .eq('id', attachId)
        .select('*')
        .single()
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      return portalJson({ ok: true, attach: updated })
    }

    if (action === 'archive') {
      const { error } = await supabase
        .from('compass_meta_attach')
        .update({ status: 'archived', updated_at: stamp })
        .eq('id', attachId)
      if (error) return portalJson({ error: 'archive_failed', detail: error.message }, { status: 400 })
      await emitMetaAttachEvent(supabase, {
        clientId,
        type: 'meta.attach.archived',
        nativeId: attachId,
        offer: row.offer_cell
      })
      return portalJson({ ok: true, status: 'archived' })
    }

    if (action === 'push_paused') {
      if (!body.confirm) {
        return portalJson({ error: 'confirm_required' }, { status: 400 })
      }
      if (row.status === 'live') {
        return portalJson({ error: 'live_attach_read_only' }, { status: 403 })
      }

      const merged: MetaAttachRow = {
        ...row,
        copy: body.copy ?? row.copy,
        destination_url: body.destination_url?.trim() ?? row.destination_url,
        canva_design_ids: body.canva_design_ids ?? row.canva_design_ids,
        review: { ...row.review, ...(body.review ?? {}) }
      }

      const driver = resolveMetaAttachDriver()
      if (!driver.ok) {
        return portalJson({ error: 'driver_not_configured', detail: driver.error }, { status: 503 })
      }

      const clientRes = await supabase
        .from('compass_clients')
        .select('id,name,industry,deal_terms,voice')
        .eq('id', clientId)
        .maybeSingle()
      if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

      const packId = resolveTradePackId(clientRes.data)
      const pack = loadMetaPack(packId)
      const offerCell = pack.offer_cells[merged.offer_cell]
      if (!offerCell) return portalJson({ error: 'offer_cell_not_found' }, { status: 400 })

      const suburbs = String(clientRes.data.deal_terms?.delivery?.service_suburbs ?? '')
        .split(/[\n,]/)
        .map((s: string) => s.trim())
        .filter(Boolean)

      const result = await orchestratePausedCreate({
        row: merged,
        clientName: clientRes.data.name,
        vertical: pack.vertical,
        offerCell,
        serviceSuburbs: suburbs,
        adapter: driver.adapter
      })

      const { data: updated, error: updateError } = await supabase
        .from('compass_meta_attach')
        .update({
          copy: merged.copy,
          destination_url: merged.destination_url,
          canva_design_ids: merged.canva_design_ids,
          review: merged.review,
          meta_ids: result.meta_ids,
          status: 'created_paused',
          updated_at: stamp
        })
        .eq('id', attachId)
        .select('*')
        .single()

      if (updateError) {
        return portalJson({ error: 'persist_failed', detail: updateError.message }, { status: 500 })
      }

      await emitMetaAttachEvent(supabase, {
        clientId,
        type: 'meta.campaign.created_paused',
        nativeId: attachId,
        vertical: pack.vertical,
        offer: merged.offer_cell,
        payload: {
          driver: driver.driver,
          meta_ids: result.meta_ids,
          created: result.created,
          destination: offerCell.destination_type,
          objective: 'OUTCOME_LEADS'
        }
      })

      return portalJson({
        ok: true,
        status: 'created_paused',
        attach: updated,
        ads_manager_url: adsManagerDeepLink(result.meta_ids, merged.review.meta_ad_account_id),
        created: result.created
      })
    }

    return portalJson({ error: 'invalid_action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('required') ||
      message.includes('refused') ||
      message.includes('incomplete') ||
      message.includes('archived') ||
      message.includes('already_live')
    ) {
      return portalJson({ error: message }, { status: 400 })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'patch_failed', detail: message }, { status: 500 })
  }
}
