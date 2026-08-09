import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { listOutreachTouches } from '@/lib/lead-outreach'
import {
  computeRecontactEligibility,
  synthesizeTouchesFromLead,
  type LeadOutreachTouch
} from '@/lib/recontact-eligibility'
import { LEAD_LIST_COLUMNS } from '@/lib/list-columns'
import type { LeadContact } from '@/lib/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params
  const id = decodeURIComponent(rawId || '').trim()
  if (!id) return portalJson({ error: 'missing_id' }, { status: 400 })

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const { data: lead, error } = await supabase
      .from('lead_contacts')
      .select(LEAD_LIST_COLUMNS)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 400 })
    }
    if (!lead) return portalJson({ error: 'not_found' }, { status: 404 })

    const contact = lead as unknown as LeadContact
    let touches: LeadOutreachTouch[] = []
    try {
      touches = await listOutreachTouches(supabase, id, 50)
    } catch {
      touches = []
    }

    const history =
      touches.length > 0
        ? touches
        : (synthesizeTouchesFromLead(contact).map((t) => ({
            ...t,
            created_at: t.contacted_at
          })) as LeadOutreachTouch[])

    const eligibility = computeRecontactEligibility(contact)

    return portalJsonCached(
      {
        leadId: id,
        eligibility,
        touches: history,
        source: touches.length > 0 ? 'outreach_log' : 'lead_mirror'
      },
      {},
      30
    )
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
