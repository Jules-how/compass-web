import { requireAgentAuth } from '@/lib/agent-auth'
import { buildLeadInventory } from '@/lib/leads-inventory'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Orient inventory: uncontacted counts by canonical vertical × state.
 * Caps: no per-contact dump. Optional ?vertical=mortgage-brokers to filter.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const verticalFilter = url.searchParams.get('vertical')?.trim().toLowerCase() || ''

  try {
    const admin = getPortalAdminClient()
    const { data, error } = await admin
      .from('lead_contacts')
      .select('vertical,outbound_status,email,state')
      .limit(50000)

    if (error) {
      return portalJson({ error: 'inventory_failed', detail: error.message }, { status: 500 })
    }

    let inventory = buildLeadInventory(data ?? [])
    if (verticalFilter) {
      inventory = {
        ...inventory,
        byVertical: inventory.byVertical.filter(
          (row) =>
            row.vertical === verticalFilter ||
            row.vertical.includes(verticalFilter) ||
            verticalFilter.includes(row.vertical)
        )
      }
    }

    return portalJson({ ok: true, ...inventory })
  } catch (err) {
    console.error('[agent/leads/inventory]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'inventory_failed' }, { status: 500 })
  }
}
