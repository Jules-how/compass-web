import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { runCsDept } from '@/lib/cs-dept/run'
import { roiProjection } from '@/lib/cs-dept/engine.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Weekly CS run for Cursor automations.
 * GET = current real board; absence or failure is explicit. POST = recompute and persist drafts.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError
  try {
    const admin = getPortalAdminClient()
    const board = await runCsDept(admin, { includeDemo: false, persist: false })
    return portalJson({
      ok: true,
      generated_at: board.generated_at,
      source: board.counts.clients === 0 ? 'empty' : board.source,
      counts: board.counts,
      at_risk: board.cards
        .filter((card) => card.snapshot.at_risk)
        .map((card) => ({
          client: card.client.name,
          score: card.snapshot.score,
          drop: card.snapshot.drop_points
        })),
      roi: board.artifacts.filter((row) => row.kind === 'weekly_summary').map(roiProjection)
    })
  } catch (err) {
    return portalJson({ ok: false, source: 'unavailable', error: err instanceof Error ? err.message : 'cs_unavailable' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let persist = true
  try {
    const body = (await readBoundedJson(request)) as { persist?: boolean }
    if (body && body.persist === false) persist = false
  } catch {
    /* empty body is fine */
  }

  try {
    const admin = getPortalAdminClient()
    const board = await runCsDept(admin, { includeDemo: false, persist })
    return portalJson({
      ok: true,
      persisted: persist,
      generated_at: board.generated_at,
      source: board.counts.clients === 0 ? 'empty' : board.source,
      counts: board.counts,
      review_url: '/operations/cs',
      cards: board.cards.map((card) => ({
        client: card.client.name,
        score: card.snapshot.score,
        band: card.snapshot.band,
        attention: card.attention,
        drafts: card.artifacts.filter((row) => row.status === 'draft').map((row) => row.kind)
      }))
    })
  } catch (err) {
    return portalJson(
      { error: 'cs_run_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
