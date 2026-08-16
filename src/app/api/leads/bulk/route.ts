import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { PIPELINE_STATUSES } from '@/lib/leads-meta'
import { isClassifyOutboundStatus } from '@/lib/inbox-classify'

export const dynamic = 'force-dynamic'

type BulkAction = 'suppress' | 'unsuppress' | 'set_status' | 'add_tag' | 'clear_tag'

interface BulkBody {
  action?: BulkAction
  ids?: unknown
  status?: unknown
  tag?: unknown
  reason?: unknown
}

const MAX_IDS = 500

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let supabase
  try {
    ;({ supabase } = await requirePortalAccess({ operator: true }))
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'bulk_failed' }, { status: 500 })
  }

  let body: BulkBody
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as BulkBody
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const action = body.action
  if (
    action !== 'suppress' &&
    action !== 'unsuppress' &&
    action !== 'set_status' &&
    action !== 'add_tag' &&
    action !== 'clear_tag'
  ) {
    return portalJson({ error: 'invalid_action' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  if (ids.length === 0) {
    return portalJson({ error: 'no_ids' }, { status: 400 })
  }
  if (ids.length > MAX_IDS) {
    return portalJson({ error: `too_many_ids (max ${MAX_IDS})` }, { status: 413 })
  }

  const now = new Date().toISOString()

  try {
    if (action === 'suppress') {
      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 200)
          : 'manual_suppress'
      const { error } = await supabase
        .from('lead_contacts')
        .update({
          outbound_status: 'suppressed',
          suppression_reason: reason,
          recontact_ok: 0,
          updated_at: now,
          mirrored_at: now
        })
        .in('id', ids)
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      return portalJson({ ok: true, updated: ids.length, action })
    }

    if (action === 'unsuppress') {
      const { error } = await supabase
        .from('lead_contacts')
        .update({
          outbound_status: 'uncontacted',
          suppression_reason: null,
          recontact_ok: 1,
          updated_at: now,
          mirrored_at: now
        })
        .in('id', ids)
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      return portalJson({ ok: true, updated: ids.length, action })
    }

    if (action === 'set_status') {
      const status = typeof body.status === 'string' ? body.status.trim() : ''
      if (
        !(PIPELINE_STATUSES as readonly string[]).includes(status) &&
        !isClassifyOutboundStatus(status)
      ) {
        return portalJson({ error: 'invalid_status' }, { status: 400 })
      }
      const patch: Record<string, unknown> = {
        outbound_status: status,
        updated_at: now,
        mirrored_at: now
      }
      if (status === 'suppressed') {
        patch.suppression_reason =
          typeof body.reason === 'string' && body.reason.trim()
            ? body.reason.trim().slice(0, 200)
            : 'manual_suppress'
        patch.recontact_ok = 0
      }
      const { error } = await supabase.from('lead_contacts').update(patch).in('id', ids)
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      return portalJson({ ok: true, updated: ids.length, action, status })
    }

    const tag = typeof body.tag === 'string' ? body.tag.trim().slice(0, 64) : ''
    if (!tag) return portalJson({ error: 'missing_tag' }, { status: 400 })

    const { data: rows, error: fetchError } = await supabase
      .from('lead_contacts')
      .select('id, tags')
      .in('id', ids)
    if (fetchError) {
      return portalJson({ error: 'fetch_failed', detail: fetchError.message }, { status: 400 })
    }

    let updated = 0
    for (const row of rows ?? []) {
      const nextTags =
        action === 'add_tag' ? addTag(row.tags, tag) : removeTag(row.tags, tag)
      const { error } = await supabase
        .from('lead_contacts')
        .update({ tags: nextTags, updated_at: now, mirrored_at: now })
        .eq('id', row.id)
      if (!error) updated += 1
    }

    return portalJson({ ok: true, updated, action, tag })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'bulk_failed' }, { status: 500 })
  }
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim()).filter(Boolean)
    }
  } catch {
    // comma / whitespace separated
  }
  return trimmed
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function serializeTags(tags: string[]): string | null {
  if (tags.length === 0) return null
  return JSON.stringify(Array.from(new Set(tags)))
}

function addTag(raw: string | null | undefined, tag: string): string | null {
  const tags = parseTags(raw)
  if (!tags.includes(tag)) tags.push(tag)
  return serializeTags(tags)
}

function removeTag(raw: string | null | undefined, tag: string): string | null {
  const tags = parseTags(raw).filter((t) => t !== tag)
  return serializeTags(tags)
}
