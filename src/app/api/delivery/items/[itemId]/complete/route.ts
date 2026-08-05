import { type NextRequest } from 'next/server'

import { parseCompleteItemCommand } from '@/lib/portal-contracts'
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

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const { itemId } = await context.params
    const raw = await readBoundedJson(request)
    const command = parseCompleteItemCommand({ ...(raw as object), itemId })
    const { supabase } = await requirePortalAccess({ delivery: true })
    const { data, error } = await supabase.rpc('portal_complete_delivery_item', {
      p_item_id: command.itemId,
      p_operation_id: command.operationId,
      p_base_version: command.baseVersion
    })
    return portalCommandResponse(data, error)
  } catch (error) {
    return portalAccessResponse(error) ?? portalJson({ error: 'invalid_request' }, { status: 400 })
  }
}
