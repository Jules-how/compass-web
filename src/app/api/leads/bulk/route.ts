import type { NextRequest } from 'next/server'
import {
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { PIPELINE_STATUSES } from '@/lib/leads-meta'
import { isClassifyOutboundStatus } from '@/lib/inbox-classify'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { patchLeadContactsByIds } from '@/lib/lead-mark'

export const dynamic = 'force-dynamic'

type BulkAction = 'suppress' | 'unsuppress' | 'set_status' | 'add_tag' | 'clear_tag' | 'archive' | 'unarchive'

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
    action !== 'clear_tag' &&
    action !== 'archive' &&
    action !== 'unarchive'
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

  try {
    const admin = getPortalAdminClient()

    if (action === 'archive') {
      const count = await patchLeadContactsByIds(admin, ids, { is_archived: true })
      return portalJson({ ok: true, count, action })
    }

    if (action === 'unarchive') {
      const count = await patchLeadContactsByIds(admin, ids, { is_archived: false })
      return portalJson({ ok: true, count, action })
    }

    if (action === 'suppress') {
      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 200)
          : 'manual_suppress'
      const count = await patchLeadContactsByIds(admin, ids, {
        outbound_status: 'suppressed',
        suppression_reason: reason,
        recontact_ok: 0
      })
      return portalJson({ ok: true, count, action })
    }

    if (action === 'unsuppress') {
      const count = await patchLeadContactsByIds(admin, ids, {
        outbound_status: 'uncontacted',
        suppression_reason: null,
        recontact_ok: 1
      })
      return portalJson({ ok: true, count, action })
    }

    if (action === 'set_status') {
      const status = typeof body.status === 'string' ? body.status.trim() : ''
      const valid =
        (PIPELINE_STATUSES as readonly string[]).includes(status) || isClassifyOutboundStatus(status)
      if (!valid) {
        return portalJson({ error: 'invalid_status' }, { status: 400 })
      }
      const patch: Record<string, unknown> = { outbound_status: status }
      if (status === 'suppressed') {
        patch.suppression_reason = 'manual_suppress'
        patch.recontact_ok = 0
      }
      const count = await patchLeadContactsByIds(admin, ids, patch)
      return portalJson({ ok: true, count, action, status })
    }

    if (action === 'add_tag') {
      const rawTag = typeof body.tag === 'string' ? body.tag.trim() : ''
      if (!rawTag) return portalJson({ error: 'missing_tag' }, { status: 400 })
      const tag = rawTag.slice(0, 40)
      const count = await patchLeadContactsByIds(admin, ids, { cohort_tag: tag })
      return portalJson({ ok: true, count, action, tag })
    }

    if (action === 'clear_tag') {
      const count = await patchLeadContactsByIds(admin, ids, { cohort_tag: null })
      return portalJson({ ok: true, count, action })
    }

    return portalJson({ error: 'unhandled_action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'bulk_failed'
    return portalJson({ error: 'bulk_failed', detail: message }, { status: 500 })
  }
}
