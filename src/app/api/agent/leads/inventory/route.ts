import { requireAgentAuth } from '@/lib/agent-auth'
import { loadLeadInventory } from '@/lib/lead-search'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Alias for GET /api/agent/leads?view=counts
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const verticalFilter = url.searchParams.get('vertical')?.trim().toLowerCase() || ''

  try {
    const admin = getPortalAdminClient()
    const inventory = await loadLeadInventory(admin, verticalFilter)
    return portalJson({
      ok: true,
      deprecated: 'Use GET /api/agent/leads?view=counts&vertical=…',
      ...inventory
    })
  } catch (err) {
    console.error('[agent/leads/inventory]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'inventory_failed' }, { status: 500 })
  }
}
