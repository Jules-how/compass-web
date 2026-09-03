import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import { normalizePathwayRunStatus, normalizePathwayTool, PATHWAY_STAGE_IDS } from '@/lib/pathway'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError
  let body: {
    id?: string
    campaignId?: string
    recipeId?: string
    status?: string
    costCents?: number
    durationMs?: number
    sendableCount?: number
    openerCoverage?: number
    detail?: string
    stage?: { id?: string; tool?: string; seconds?: number; costCents?: number; yield?: number }
  }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const stamp = new Date().toISOString()
    const id = (body.id || '').trim() || `run-${crypto.randomUUID()}`
    const { data: existing } = await admin
      .from('compass_pathway_runs')
      .select('id,stages')
      .eq('id', id)
      .maybeSingle()
    const stages = Array.isArray(existing?.stages) ? [...existing.stages] : []
    if (body.stage?.id && (PATHWAY_STAGE_IDS as readonly string[]).includes(body.stage.id)) {
      stages.push({
        id: body.stage.id,
        tool: normalizePathwayTool(body.stage.tool),
        seconds: body.stage.seconds ?? null,
        costCents: body.stage.costCents ?? null,
        yield: body.stage.yield ?? null,
        at: stamp
      })
    }
    const row = {
      id,
      campaign_id: body.campaignId?.trim() || null,
      recipe_id: body.recipeId?.trim() || null,
      status: normalizePathwayRunStatus(body.status),
      stages,
      cost_cents: body.costCents ?? null,
      duration_ms: body.durationMs ?? null,
      sendable_count: body.sendableCount ?? null,
      opener_coverage: body.openerCoverage ?? null,
      detail: body.detail?.trim() || null,
      updated_at: stamp,
      ...(existing ? {} : { created_at: stamp })
    }
    const { error } = await admin.from('compass_pathway_runs').upsert(row)
    if (error) throw new Error(error.message)
    return portalJson({ ok: true, id, status: row.status })
  } catch (err) {
    console.error('[agent/outbound/pathway/runs]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'run_write_failed' }, { status: 500 })
  }
}
