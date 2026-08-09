import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEAN_COLUMNS =
  'id,name,email,company,role,outbound_status,interest_label,instantly_campaign_name,instantly_campaign_id,instantly_lead_id,instantly_synced_at,city,state,last_outbound_at,updated_at'

/**
 * Lean lead list for agents. Caps at 100 rows; defaults to Instantly-hot statuses.
 * Query: status=replied,interested,meeting_booked & limit=50 & q=acme
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status') || 'replied,interested,meeting_booked'
  const statuses = statusParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40) || 40))
  const q = url.searchParams.get('q')?.trim() || ''

  try {
    const admin = getPortalAdminClient()
    let query = admin
      .from('lead_contacts')
      .select(LEAN_COLUMNS)
      .in('outbound_status', statuses)
      .order('instantly_synced_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (q) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) return portalJson({ error: 'list_failed', detail: error.message }, { status: 500 })

    const leads = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      company: row.company,
      role: row.role,
      status: row.outbound_status,
      interest: row.interest_label,
      campaign: row.instantly_campaign_name,
      campaignId: row.instantly_campaign_id,
      instantlyLeadId: row.instantly_lead_id,
      syncedAt: row.instantly_synced_at,
      city: row.city,
      state: row.state,
      lastOutboundAt: row.last_outbound_at
    }))

    return portalJson({
      ok: true,
      count: leads.length,
      statuses,
      leads
    })
  } catch (err) {
    console.error('[agent/leads]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'list_failed' }, { status: 500 })
  }
}
