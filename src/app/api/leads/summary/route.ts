import type { LeadSummaryCounts } from '@/lib/types'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import type { LeadFilterQuery } from '@/lib/leads-query'

export const dynamic = 'force-dynamic'

async function countRows(
  supabase: { from: (table: string) => unknown },
  apply?: (q: LeadFilterQuery) => LeadFilterQuery
): Promise<number> {
  let q = (supabase.from('lead_contacts') as {
    select: (
      columns: string,
      opts: { count: 'exact'; head: true }
    ) => LeadFilterQuery & PromiseLike<{ count: number | null; error: unknown }>
  }).select('id', { count: 'exact', head: true })
  if (apply) q = apply(q) as typeof q
  const result = await q
  if (result?.error) return 0
  return result?.count ?? 0
}

/**
 * Global lane counts for the CRM chip bar.
 * Intentionally ignores request filters — filtered totals come from /api/leads/list
 * so filter changes do not re-run eight head-count queries.
 */
export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    const [
      total,
      uncontacted,
      inInstantly,
      replied,
      interested,
      suppressed,
      noPhone,
      noEmail,
      needsReview
    ] = await Promise.all([
      countRows(supabase),
      countRows(supabase, (q) => q.eq('outbound_status', 'uncontacted')),
      countRows(supabase, (q) =>
        q.or(
          'outbound_status.eq.in_instantly,instantly_lead_id.not.is.null,instantly_campaign_id.not.is.null'
        )
      ),
      countRows(supabase, (q) => q.eq('outbound_status', 'replied')),
      countRows(supabase, (q) => q.eq('outbound_status', 'interested')),
      countRows(supabase, (q) =>
        q.or('outbound_status.eq.suppressed,suppression_reason.not.is.null')
      ),
      countRows(supabase, (q) => q.or('phone.is.null,phone.eq.')),
      countRows(supabase, (q) => q.or('email.is.null,email.eq.')),
      countRows(supabase, (q) =>
        q.or('outbound_status.eq.needs_review,outbound_status.eq.needs-review')
      )
    ])

    const summary: LeadSummaryCounts = {
      total,
      filtered: total,
      uncontacted,
      in_instantly: inInstantly,
      replied,
      interested,
      suppressed,
      no_phone: noPhone,
      no_email: noEmail,
      needs_review: needsReview
    }

    // Chips are global — longer browser cache so revisits stay snappy.
    return portalJsonCached({ summary }, {}, 60)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'summary_failed' }, { status: 500 })
  }
}
