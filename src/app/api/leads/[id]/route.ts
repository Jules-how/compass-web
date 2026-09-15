import type { NextRequest } from 'next/server'
import {
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { applyLeadIcpFields } from '@/lib/lead-icp'
import { parseLeadFacts, type LeadFact } from '@/lib/lead-facts'
import { parseCompanySite } from '@/lib/company-site'
import { MAX_LEAD_OPENER } from '@/lib/campaigns'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { LEAD_LIST_COLUMNS } from '@/lib/list-columns'
import { assertKnownFields, LeadWriteValidationError } from '@/lib/lead-write-validation'

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

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, 64 * 1024)) as Record<string, unknown>
    assertKnownFields(body,new Set(['opener','lead_facts','pipeline_campaign_id','website','icp_status','review_count','hours_label','after_hours','capture_crack','email_origin']),'body')
  } catch (error) {
    if (error instanceof LeadWriteValidationError) return portalJson({error:'validation_failed',issues:error.issues},{status:422})
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const icpKeys = [
    'icp_status',
    'review_count',
    'hours_label',
    'after_hours',
    'capture_crack',
    'email_origin'
  ]
  const hasIcp = icpKeys.some((key) => body[key] !== undefined)
  if (
    body.opener === undefined &&
    body.lead_facts === undefined &&
    body.pipeline_campaign_id === undefined &&
    body.website === undefined &&
    !hasIcp
  ) {
    return portalJson({ error: 'empty_patch' }, { status: 400 })
  }

  const stamp = new Date().toISOString()
  const patch: Record<string, unknown> = {
    updated_at: stamp,
    mirrored_at: stamp
  }

  if (body.opener !== undefined) {
    const parsed = parseOpener(body.opener)
    if (!parsed.ok) return portalJson({ error: parsed.error }, { status: 400 })
    patch.opener = parsed.opener
  }

  if (body.lead_facts !== undefined) {
    const facts = parseLeadFacts(body.lead_facts)
    if (!facts.ok) return portalJson({ error: facts.error }, { status: 400 })
    // Supabase jsonb: store the array. SQLite WIP stringified this column.
    patch.lead_facts = facts.facts as LeadFact[]
  }

  const icp = applyLeadIcpFields(body, patch)
  if (!icp.ok) return portalJson({ error: icp.error }, { status: 400 })

  if (body.website !== undefined) {
    if (body.website != null && typeof body.website !== 'string') {
      return portalJson({ error: 'website_invalid' }, { status: 400 })
    }
    const site = parseCompanySite(body.website)
    patch.website = site.website
    patch.company_domain = site.company_domain
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
    const admin = getPortalAdminClient()
    const { data: lead, error } = await admin
      .from('lead_contacts')
      .update(patch)
      .eq('id', id)
      .select(LEAD_LIST_COLUMNS)
      .maybeSingle()

    if (error) {
      return portalJson({ error: 'update_failed', detail: error.message }, { status: 500 })
    }
    if (!lead) return portalJson({ error: 'not_found' }, { status: 404 })
    return portalJson({ lead })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed'
    return portalJson({ error: 'update_failed', detail: message }, { status: 500 })
  }
}
