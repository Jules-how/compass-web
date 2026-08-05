import { type NextRequest } from 'next/server'

import {
  parseDeliveryListQuery,
  parseResourceId,
  projectCustomerItem,
  projectCustomerProject
} from '@/lib/portal-contracts'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ projectId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { projectId: rawProjectId } = await context.params
    const projectId = parseResourceId(rawProjectId, 'projectId')
    const { cursor, limit } = parseDeliveryListQuery(new URL(request.url).searchParams)
    const { supabase } = await requirePortalAccess({ delivery: true })

    const projectQuery = supabase
      .from('delivery_projects')
      .select('id,name,customer_summary,status,version,updated_at')
      .eq('id', projectId)
      .maybeSingle()
    let itemsQuery = supabase
      .from('delivery_items')
      .select(
        'id,project_id,title,customer_description,evidence_request,action_owner,customer_state,due_at,reviewable,version,updated_at'
      )
      .eq('project_id', projectId)
      .order('id', { ascending: true })
      .limit(limit + 1)
    if (cursor) itemsQuery = itemsQuery.gt('id', cursor)

    const [projectResult, itemsResult] = await Promise.all([projectQuery, itemsQuery])
    if (projectResult.error || !projectResult.data) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }
    if (itemsResult.error) return portalJson({ error: 'fetch_failed' }, { status: 500 })

    const rows = (itemsResult.data ?? []) as Record<string, unknown>[]
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map(projectCustomerItem)
    return portalJson({
      project: projectCustomerProject(projectResult.data as Record<string, unknown>),
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null
    })
  } catch (error) {
    const accessResponse = portalAccessResponse(error)
    if (accessResponse) return accessResponse
    return portalJson({ error: 'not_found' }, { status: 404 })
  }
}
