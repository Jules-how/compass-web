import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { listCrmLists, newLeadListId } from '@/lib/lead-lists'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const lists = await listCrmLists(supabase)
    return portalJson({ lists })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: { name?: string; notes?: string | null }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
  const notes =
    typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const now = new Date().toISOString()
    const row = {
      id: newLeadListId(),
      name: name.slice(0, 120),
      notes,
      created_at: now,
      updated_at: now
    }
    const { data, error } = await supabase
      .from('compass_lead_lists')
      .insert(row)
      .select('id,name,notes,created_at,updated_at')
      .single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    return portalJson({ list: { ...data, member_count: 0 } })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
