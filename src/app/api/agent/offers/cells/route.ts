import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import {
  createMissingOfferCells,
  parseCreateOfferCellsBody
} from '@/lib/offer-test-cells-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, 32 * 1024)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = parseCreateOfferCellsBody(body)
  if ('error' in parsed) return portalJson({ error: parsed.error }, { status: 400 })

  try {
    const admin = getPortalAdminClient()
    const result = await createMissingOfferCells(admin, parsed)
    return portalJson({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed'
    if (message === 'offer_not_found' || message === 'clone_not_found') {
      return portalJson({ error: message }, { status: 404 })
    }
    console.error('[agent/offers/cells]', message)
    return portalJson({ error: 'create_failed', detail: message }, { status: 500 })
  }
}
