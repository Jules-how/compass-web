import { requireAgentAuth } from '@/lib/agent-auth'
import { canonicalizeVertical, hasUsableEmail } from '@/lib/leads-inventory'
import {
  campaignIdsFromLead,
  clampExportLimit,
  ledgerVerticalValues,
  parseExportCursor
} from '@/lib/leads-ledger'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXPORT_COLUMNS =
  'id,email,company,city,state,outbound_status,instantly_campaign_name,instantly_campaign_id,instantly_campaign_ids,last_outbound_at'

/**
 * Paged lead export. Email required. Max 200. Agent writes a local CSV; never dump the table in chat.
 * Query: vertical=broker & limit=200 & cursor=<last id>
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const verticalRaw = url.searchParams.get('vertical')?.trim() || ''
  if (!verticalRaw) {
    return portalJson({ error: 'vertical_required' }, { status: 400 })
  }

  const vertical = canonicalizeVertical(verticalRaw)
  if (vertical === '(blank)') {
    return portalJson({ error: 'vertical_required' }, { status: 400 })
  }

  const limit = clampExportLimit(url.searchParams.get('limit'))
  const cursor = parseExportCursor(url.searchParams.get('cursor'))
  const values = ledgerVerticalValues(verticalRaw)

  try {
    const admin = getPortalAdminClient()
    let query = admin
      .from('lead_contacts')
      .select(EXPORT_COLUMNS)
      .in('vertical', values)
      .not('email', 'is', null)
      .neq('email', '')
      .order('id', { ascending: true })
      .limit(limit)

    if (cursor) query = query.gt('id', cursor)

    const { data, error } = await query
    if (error) {
      return portalJson({ error: 'export_failed', detail: error.message }, { status: 500 })
    }

    const leads = (data ?? [])
      .filter((row) => hasUsableEmail(row.email))
      .map((row) => ({
        id: row.id,
        email: row.email,
        company: row.company,
        city: row.city,
        state: row.state,
        outbound_status: row.outbound_status,
        instantly_campaign_name: row.instantly_campaign_name,
        instantly_campaign_ids: campaignIdsFromLead(
          row.instantly_campaign_ids,
          row.instantly_campaign_id
        ),
        last_outbound_at: row.last_outbound_at
      }))

    const last = leads[leads.length - 1]
    const nextCursor = leads.length === limit && last ? last.id : null

    return portalJson({
      ok: true,
      vertical,
      count: leads.length,
      limit,
      cursor: cursor || null,
      next_cursor: nextCursor,
      leads
    })
  } catch (err) {
    console.error('[agent/leads/export]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'export_failed' }, { status: 500 })
  }
}
