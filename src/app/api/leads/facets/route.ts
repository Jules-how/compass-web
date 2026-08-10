import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { normalizeVerticalSlug, slugifyVerticalKey } from '@/lib/leads-meta'

export const dynamic = 'force-dynamic'

const PAGE = 1000
const MAX_ROWS = 20_000

/**
 * GET /api/leads/facets — distinct verticals (and cities) currently in lead_contacts.
 * New upload verticals become filterable as soon as they land in the DB.
 */
export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const verticalCounts = new Map<string, number>()
    const cityCounts = new Map<string, number>()

    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const to = Math.min(from + PAGE - 1, MAX_ROWS - 1)
      const { data, error } = await supabase
        .from('lead_contacts')
        .select('vertical,city')
        .order('mirrored_at', { ascending: false })
        .range(from, to)

      if (error) {
        return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 400 })
      }

      const batch = (data ?? []) as Array<{ vertical: string | null; city: string | null }>
      for (const row of batch) {
        const vertical = normalizeVerticalSlug(row.vertical) ?? slugifyVerticalKey(row.vertical ?? '')
        if (vertical) verticalCounts.set(vertical, (verticalCounts.get(vertical) ?? 0) + 1)
        const city = row.city?.trim()
        if (city) {
          const key = city.toLowerCase()
          // Preserve first-seen casing for display.
          if (!cityCounts.has(key)) cityCounts.set(key, 0)
          cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1)
        }
      }
      if (batch.length < PAGE) break
    }

    const verticals = Array.from(verticalCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }))

    const cities = Array.from(cityCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 80)
      .map(([value, count]) => ({ value, count }))

    return portalJsonCached({ verticals, cities }, {}, 30)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'facets_failed' }, { status: 500 })
  }
}
