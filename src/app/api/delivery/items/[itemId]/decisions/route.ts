import { type NextRequest } from 'next/server'

import { parseDecisionCommand, parseDeliveryListQuery, parseResourceId } from '@/lib/portal-contracts'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalCommandResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ itemId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { itemId: rawItemId } = await context.params
    const itemId = parseResourceId(rawItemId, 'itemId')
    const { cursor, limit } = parseDeliveryListQuery(new URL(request.url).searchParams)
    const { supabase, user } = await requirePortalAccess({ delivery: true })
    let query = supabase
      .from('delivery_decisions')
      .select('id,item_id,decision,comment,actor_id,item_version,created_at')
      .eq('item_id', itemId)
      .order('id', { ascending: true })
      .limit(limit + 1)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) return portalJson({ error: 'not_found' }, { status: 404 })
    const rows = data ?? []
    const hasMore = rows.length > limit
    const decisions = rows.slice(0, limit).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      decision: row.decision,
      comment: row.comment,
      author: row.actor_id === user.id ? 'You' : 'Portal member',
      itemVersion: row.item_version,
      createdAt: row.created_at
    }))
    return portalJson({ decisions, nextCursor: hasMore ? decisions.at(-1)?.id ?? null : null })
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'not_found' }, { status: 404 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const { itemId } = await context.params
    const raw = await readBoundedJson(request)
    const command = parseDecisionCommand({ ...(raw as object), itemId })
    const { supabase } = await requirePortalAccess({ delivery: true })
    const { data, error } = await supabase.rpc('portal_decide_delivery_item', {
      p_item_id: command.itemId,
      p_operation_id: command.operationId,
      p_base_version: command.baseVersion,
      p_decision: command.decision,
      p_comment: command.comment
    })
    return portalCommandResponse(data, error)
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'invalid_request' }, { status: 400 })
  }
}
