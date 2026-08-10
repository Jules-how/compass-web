import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  deriveCopyArchiveComponents,
  isValidSequence,
  normalizeTags
} from '@/lib/outbound-copy'
import { outboundNowIso } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

const TABLE = 'compass_outbound_copy_archive'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJsonCached(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const stamp = outboundNowIso()
  const patch: Record<string, unknown> = { updated_at: stamp }

  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (body.offer_key !== undefined) {
    patch.offer_key = typeof body.offer_key === 'string' ? body.offer_key.trim() || null : null
  }
  if (typeof body.structure_id === 'string') patch.structure_id = body.structure_id.trim()
  if (body.opener_mode !== undefined) {
    patch.opener_mode =
      typeof body.opener_mode === 'string' ? body.opener_mode.trim() || null : null
  }
  if (body.vertical_tags !== undefined) patch.vertical_tags = normalizeTags(body.vertical_tags)
  if (body.location_tags !== undefined) patch.location_tags = normalizeTags(body.location_tags)
  if (body.notes !== undefined) {
    patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  }
  if (typeof body.archived === 'boolean') patch.archived = body.archived
  if (body.last_used_at !== undefined) {
    patch.last_used_at = typeof body.last_used_at === 'string' ? body.last_used_at : null
  }
  if (body.first_used_at !== undefined) {
    patch.first_used_at = typeof body.first_used_at === 'string' ? body.first_used_at : null
  }
  if (body.performance !== undefined && body.performance && typeof body.performance === 'object') {
    patch.performance = body.performance
  }
  if (body.sequence !== undefined) {
    if (!isValidSequence(body.sequence)) return portalJson({ error: 'invalid_sequence' }, { status: 400 })
    patch.sequence = body.sequence
    patch.components = deriveCopyArchiveComponents(body.sequence as never, {
      offer_key:
        typeof patch.offer_key === 'string'
          ? patch.offer_key
          : typeof body.offer_key === 'string'
            ? body.offer_key
            : null,
      opener_mode:
        typeof patch.opener_mode === 'string'
          ? patch.opener_mode
          : typeof body.opener_mode === 'string'
            ? body.opener_mode
            : null
    })
  }
  if (body.touch_used === true) {
    patch.last_used_at = stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await supabase.from(TABLE).select('id,first_used_at').eq('id', id).maybeSingle()
    if (existing.error) {
      return portalJson({ error: 'fetch_failed', detail: existing.error.message }, { status: 500 })
    }
    if (!existing.data) return portalJson({ error: 'not_found' }, { status: 404 })
    if (body.touch_used === true && !existing.data.first_used_at) {
      patch.first_used_at = stamp
    }
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*').single()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  const stamp = outboundNowIso()
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from(TABLE)
      .update({ archived: true, updated_at: stamp })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return portalJson({ error: 'archive_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ ok: true, id })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'archive_failed' }, { status: 500 })
  }
}
