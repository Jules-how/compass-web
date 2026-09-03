import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import { loadRecipeBundle, ensureDefaultRecipe } from '@/lib/pathway-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError
  const url = new URL(request.url)
  const trade = url.searchParams.get('trade') || 'hvac'
  const campaignId = url.searchParams.get('campaignId')
  try {
    const admin = getPortalAdminClient()
    await ensureDefaultRecipe(admin, trade)
    const bundle = await loadRecipeBundle(admin, { trade, campaignId })
    return portalJson({
      ok: true,
      trade,
      campaignId: campaignId || null,
      stages: bundle.stages,
      defaultRecipe: {
        id: bundle.defaultRecipe.id,
        templates: bundle.defaultRecipe.templates.map((row) => ({
          id: row.id,
          label: row.label,
          signalWhen: row.signalWhen,
          structure: row.structure,
          subject: row.subject,
          style: row.style
        }))
      },
      overlayTemplates: (bundle.overlay?.templates ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        signalWhen: row.signalWhen,
        structure: row.structure,
        subject: row.subject
      })),
      note: 'Honour stages[].tool. skip means do not run that stage. Do not invent emails. Run list-builds then generate_openers.py. POST /api/agent/outbound/pathway/runs when a stage finishes.'
    })
  } catch (err) {
    console.error('[agent/outbound/pathway]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'pathway_failed' }, { status: 500 })
  }
}
