import { requireAgentAuth } from '@/lib/agent-auth'
import {
  buildOutboundPatch,
  isOutboundKind,
  LIBRARY_BODY_MAX_BYTES,
  OUTBOUND_KIND_TABLE,
  wantsMinimalReturn,
  type OutboundKind
} from '@/lib/agent-outbound'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { hasOfferContentPatch, reviseOffer } from '@/lib/offer-revisions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ kind: string; id: string }>
}

function resolveKind(raw: string): OutboundKind | Response {
  if (!isOutboundKind(raw)) return portalJson({ error: 'invalid_kind' }, { status: 400 })
  return raw
}

export async function GET(_request: Request, context: Ctx) {
  const authError = requireAgentAuth(_request)
  if (authError) return authError

  const { kind: raw, id } = await context.params
  const kindOrErr = resolveKind(raw)
  if (kindOrErr instanceof Response) return kindOrErr
  const kind = kindOrErr
  const table = OUTBOUND_KIND_TABLE[kind]

  try {
    const admin = getPortalAdminClient()
    const { data, error } = await admin.from(table).select('*').eq('id', id).maybeSingle()
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ ok: true, item: data })
  } catch (err) {
    console.error('[agent/outbound/get]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const { kind: raw, id } = await context.params
  const kindOrErr = resolveKind(raw)
  if (kindOrErr instanceof Response) return kindOrErr
  const kind = kindOrErr
  const table = OUTBOUND_KIND_TABLE[kind]

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, LIBRARY_BODY_MAX_BYTES)) as Record<string, unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('too large')) {
      return portalJson({ error: 'body_too_large' }, { status: 413 })
    }
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const stamp = new Date().toISOString()
  const built = buildOutboundPatch(kind, body, stamp)
  if (!built.ok) return portalJson({ error: built.error }, { status: 400 })

  try {
    const admin = getPortalAdminClient()
    const existing = await admin.from(table).select('*').eq('id', id).maybeSingle()
    if (existing.error) {
      return portalJson({ error: 'fetch_failed', detail: existing.error.message }, { status: 500 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })

    let data: Record<string, unknown>
    if (kind === 'offers' && hasOfferContentPatch(built.row)) {
      data = await reviseOffer(admin, {
        offerId: id,
        patch: built.row,
        expectedActiveRevisionId:
          typeof existing.data.active_revision_id === 'string' ? existing.data.active_revision_id : null,
        changeReason:
          typeof body.revision_note === 'string' && body.revision_note.trim()
            ? body.revision_note.trim()
            : 'Offer definition updated through the Compass agent API.',
        createdBy: 'agent-api'
      })
    } else {
      const updated = await admin.from(table).update(built.row).eq('id', id).select('*').single()
      if (updated.error) {
        return portalJson({ error: 'update_failed', detail: updated.error.message }, { status: 400 })
      }
      data = updated.data as Record<string, unknown>
    }

    if (wantsMinimalReturn(request)) {
      return portalJson({
        ok: true,
        id: data.id,
        updated_at: data.updated_at
      })
    }
    return portalJson({ ok: true, item: data })
  } catch (err) {
    console.error('[agent/outbound/patch]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const { kind: raw, id } = await context.params
  const kindOrErr = resolveKind(raw)
  if (kindOrErr instanceof Response) return kindOrErr
  const kind = kindOrErr
  const table = OUTBOUND_KIND_TABLE[kind]
  const stamp = new Date().toISOString()

  try {
    const admin = getPortalAdminClient()
    const { data, error } = await admin
      .from(table)
      .update({ archived: true, updated_at: stamp })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    if (wantsMinimalReturn(request)) {
      return portalJson({ ok: true, id: data.id, updated_at: data.updated_at, archived: true })
    }
    return portalJson({ ok: true, item: data })
  } catch (err) {
    console.error('[agent/outbound/delete]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
