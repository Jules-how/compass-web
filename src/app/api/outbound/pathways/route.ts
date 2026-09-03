import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { listPipelineCampaigns } from '@/lib/campaigns-server'
import {
  ensureDefaultRecipe,
  loadRecipeBundle,
  upsertOverlay
} from '@/lib/pathway-server'
import { normalizeStages } from '@/lib/pathway'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const url = new URL(request.url)
    const trade = url.searchParams.get('trade') || 'hvac'
    const campaignId = url.searchParams.get('campaignId')
    await ensureDefaultRecipe(supabase, trade)
    const bundle = await loadRecipeBundle(supabase, { trade, campaignId })
    const { data: runs } = await supabase
      .from('compass_pathway_runs')
      .select(
        'id,campaign_id,recipe_id,status,stages,cost_cents,duration_ms,sendable_count,opener_coverage,detail,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(30)
    const campaigns = await listPipelineCampaigns(supabase)
    return portalJsonCached({
      trade,
      campaignId: campaignId || null,
      defaultRecipe: bundle.defaultRecipe,
      overlay: bundle.overlay,
      stages: bundle.stages,
      runs: runs ?? [],
      campaigns: campaigns.map((row) => ({
        id: row.id,
        name: row.name,
        trade: (row.vertical_tags ?? [])[0] ?? null
      }))
    })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'pathway_fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  let body: {
    trade?: string
    campaignId?: string
    stages?: unknown
    kind?: string
  }
  try {
    body = (await readBoundedJson(request, 32 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const trade = (body.trade || 'hvac').trim().toLowerCase()
    if (body.kind === 'default') {
      const recipeId = await ensureDefaultRecipe(supabase, trade)
      const { error } = await supabase
        .from('compass_pathway_recipes')
        .update({ stages: normalizeStages(body.stages), updated_at: new Date().toISOString() })
        .eq('id', recipeId)
      if (error) throw new Error(error.message)
      const bundle = await loadRecipeBundle(supabase, { trade })
      return portalJson({ ok: true, recipe: bundle.defaultRecipe, stages: bundle.stages })
    }
    const campaignId = (body.campaignId || '').trim()
    if (!campaignId) return portalJson({ error: 'campaign_required' }, { status: 400 })
    const overlayId = await upsertOverlay(supabase, campaignId, trade, body.stages)
    const bundle = await loadRecipeBundle(supabase, { trade, campaignId })
    return portalJson({ ok: true, overlayId, overlay: bundle.overlay, stages: bundle.stages })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'pathway_save_failed' }, { status: 500 })
  }
}
