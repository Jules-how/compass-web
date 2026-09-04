import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { loadMorningWavePayload } from '@/lib/wave-morning-server'
import { sydneyDateOnly } from '@/lib/wave-desk'
import { applyBriefDecision } from '@/lib/wave-morning'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const wave = await loadMorningWavePayload(supabase)
    return portalJsonCached(wave, {}, 30)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'wave_fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: { action?: string }
  try {
    body = (await readBoundedJson(request, 4 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  if (body.action !== 'accept' && body.action !== 'dismiss') {
    return portalJson({ error: 'action_required' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const day = sydneyDateOnly()
    const { data: today, error } = await supabase
      .from('compass_wave_briefs')
      .select('id,next_campaign_ids,next_status,recommendation')
      .eq('id', day)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!today) return portalJson({ error: 'brief_missing' }, { status: 409 })

    const patch = applyBriefDecision(
      {
        id: today.id,
        next_campaign_ids: today.next_campaign_ids ?? [],
        next_status: today.next_status
      },
      body.action
    )
    const saved = await supabase
      .from('compass_wave_briefs')
      .update({
        next_status: patch.next_status,
        resolved_at: patch.resolved_at
      })
      .eq('id', day)
      .select('id,next_campaign_ids,next_status,resolved_at')
      .single()
    if (saved.error) throw new Error(saved.error.message)
    return portalJson({ ok: true, brief: saved.data })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'wave_decision_failed' }, { status: 500 })
  }
}
