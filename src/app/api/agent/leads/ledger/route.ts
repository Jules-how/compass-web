import { requireAgentAuth } from '@/lib/agent-auth'
import { canonicalizeVertical } from '@/lib/leads-inventory'
import { buildLeadLedger, LEDGER_ROW_CAP, ledgerVerticalValues, parseIdList } from '@/lib/leads-ledger'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEDGER_COLUMNS =
  'vertical,outbound_status,state,last_outbound_at,instantly_campaign_name,instantly_campaign_id,instantly_campaign_ids'

/**
 * Vertical ledger: status, state, last_outbound buckets, top campaign names.
 * Optional campaign_ids vs later_campaign_ids overlap (old only / later only / both).
 * Buckets use stored last_outbound_at. Does not invent last-touch.
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

  const campaignIds = parseIdList(url.searchParams.get('campaign_ids'))
  const laterCampaignIds = parseIdList(url.searchParams.get('later_campaign_ids'))
  const values = ledgerVerticalValues(verticalRaw)

  try {
    const admin = getPortalAdminClient()
    let query = admin.from('lead_contacts').select(LEDGER_COLUMNS).limit(LEDGER_ROW_CAP)
    if (values.length) query = query.in('vertical', values)

    const { data, error } = await query
    if (error) {
      return portalJson({ error: 'ledger_failed', detail: error.message }, { status: 500 })
    }

    const ledger = buildLeadLedger(data ?? [], {
      vertical: verticalRaw,
      campaignIds,
      laterCampaignIds
    })

    return portalJson({ ok: true, ...ledger })
  } catch (err) {
    console.error('[agent/leads/ledger]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'ledger_failed' }, { status: 500 })
  }
}
