import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const campaignId = new URL(request.url).searchParams.get('campaignId')?.trim()
  if (!campaignId) return portalJson({ error: 'campaign_required' }, { status: 400 })
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('lead_contacts')
      .select(
        'id,name,email,company,city,opener,opener_template_id,opener_override,icp_status,outbound_status'
      )
      .eq('pipeline_campaign_id', campaignId)
      .limit(500)
    if (error) throw new Error(error.message)
    return portalJsonCached({ campaignId, leads: data ?? [] }, {}, 5)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'chunk_fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let body: {
    id?: string
    opener?: string
    opener_template_id?: string | null
    opener_override?: boolean
  }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  const id = (body.id || '').trim()
  if (!id) return portalJson({ error: 'id_required' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const patch: Record<string, unknown> = {}
    if (body.opener !== undefined) patch.opener = body.opener
    if (body.opener_template_id !== undefined) patch.opener_template_id = body.opener_template_id
    if (body.opener_override !== undefined) patch.opener_override = body.opener_override
    if (Object.keys(patch).length === 0) return portalJson({ error: 'empty_patch' }, { status: 400 })
    const { data, error } = await supabase
      .from('lead_contacts')
      .update(patch)
      .eq('id', id)
      .select('id,name,email,company,city,opener,opener_template_id,opener_override')
      .single()
    if (error) throw new Error(error.message)
    return portalJson({ lead: data })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'chunk_update_failed' }, { status: 500 })
  }
}
