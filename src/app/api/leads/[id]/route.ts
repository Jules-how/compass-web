import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { parseLeadFacts, type LeadFact } from '@/lib/lead-facts'
import { MAX_LEAD_OPENER } from '@/lib/campaigns'
import { LEAD_LIST_COLUMNS } from '@/lib/list-columns'
import type { LeadContact } from '@/lib/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

function parseOpener(value: unknown): { ok: true; opener: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, opener: null }
  if (typeof value !== 'string') return { ok: false, error: 'opener_invalid' }
  const opener = value.trim() || null
  if (opener && opener.length > MAX_LEAD_OPENER) return { ok: false, error: 'opener_too_long' }
  return { ok: true, opener }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  const { id: rawId } = await context.params
  const id = decodeURIComponent(rawId || '').trim()
  if (!id) return portalJson({ error: 'missing_id' }, { status: 400 })

  let body: { opener?: unknown; lead_facts?: unknown; pipeline_campaign_id?: unknown }
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  if (
    body.opener === undefined &&
    body.lead_facts === undefined &&
    body.pipeline_campaign_id === undefined
  ) {
    return portalJson({ error: 'empty_patch' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    mirrored_at: new Date().toISOString()
  }

  if (body.opener !== undefined) {
    const parsed = parseOpener(body.opener)
    if (!parsed.ok) return portalJson({ error: parsed.error }, { status: 400 })
    patch.opener = parsed.opener
  }

  if (body.lead_facts !== undefined) {
    const facts = parseLeadFacts(body.lead_facts)
    if (!facts.ok) return portalJson({ error: facts.error }, { status: 400 })
    patch.lead_facts = facts.facts as LeadFact[]
  }

  if (body.pipeline_campaign_id !== undefined) {
    if (body.pipeline_campaign_id == null || body.pipeline_campaign_id === '') {
      patch.pipeline_campaign_id = null
    } else if (typeof body.pipeline_campaign_id !== 'string') {
      return portalJson({ error: 'pipeline_campaign_id_invalid' }, { status: 400 })
    } else {
      patch.pipeline_campaign_id = body.pipeline_campaign_id.trim() || null
    }
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('lead_contacts')
      .update(patch)
      .eq('id', id)
      .select(LEAD_LIST_COLUMNS)
      .maybeSingle()

    if (error) {
      return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    }
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ lead: data as LeadContact })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
