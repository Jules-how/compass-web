import { getPortalAdminClient } from '@/lib/portal-admin'
import {
  fallbackExternalId,
  parseInboundLeadIngestBody,
  projectInboundLead
} from '@/lib/inbound-leads'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ingestSecretConfigured(): string | null {
  const secret = process.env.COMPASS_LEAD_INGEST_SECRET?.trim()
  return secret || null
}

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: Request) {
  const expected = ingestSecretConfigured()
  if (!expected) return portalJson({ error: 'ingest_not_configured' }, { status: 503 })

  const provided = request.headers.get('x-ingest-secret')
  if (!secretsMatch(provided, expected)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await readBoundedJson(request, 100_000)
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = parseInboundLeadIngestBody(body)
  if ('error' in parsed) return portalJson({ error: parsed.error }, { status: 400 })

  const externalId = parsed.externalId || fallbackExternalId(parsed)
  const admin = getPortalAdminClient()

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id,slug,status')
    .eq('slug', parsed.clientSlug)
    .maybeSingle()

  if (tenantError || !tenant || tenant.status !== 'active') {
    return portalJson({ error: 'unknown_client' }, { status: 404 })
  }

  const row = {
    tenant_id: tenant.id,
    external_id: externalId,
    source: parsed.source,
    channel: parsed.channel,
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    submitted_at: parsed.submittedAt,
    summary: parsed.summary,
    raw: parsed.raw,
    updated_at: new Date().toISOString()
  }

  const { data, error } = await admin
    .from('portal_inbound_leads')
    .upsert(row, { onConflict: 'tenant_id,external_id' })
    .select(
      'id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at,lifecycle_status,lifecycle_updated_at'
    )
    .single()

  if (error || !data) {
    console.error('[ingest/leads] upsert failed', error?.message)
    return portalJson({ error: 'ingest_failed' }, { status: 500 })
  }

  return portalJson({ ok: true, lead: projectInboundLead(data as Record<string, unknown>) })
}
