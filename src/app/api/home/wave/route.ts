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
import { readWaveDecision, waveReviewState } from '@/lib/wave-publication'
import { getPortalAdminClient } from '@/lib/portal-admin'

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

  let body: { action?: string; revision?: number }
  try {
    body = (await readBoundedJson(request, 4 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }
  if (body.action !== 'accept' && body.action !== 'dismiss') {
    return portalJson({ error: 'action_required' }, { status: 400 })
  }

  try {
    await requirePortalAccess({ operator: true })
    const admin = getPortalAdminClient()
    const day = sydneyDateOnly()
    const source = await readWaveDecision()
    const { data: today, error } = await admin.from('compass_wave_briefs')
      .select('id,revision,reviewed_at,publisher,decision_revision,recommendation')
      .eq('id', day).maybeSingle()
    if (error) throw new Error(error.message)
    if (waveReviewState(today, day, source.revision) !== 'current') {
      return portalJson({ error: 'This brief needs a current review before it can be resolved.' }, { status: 409 })
    }
    if (!Number.isInteger(body.revision) || body.revision !== today?.revision) {
      return portalJson({ error: 'The brief changed. Refresh before deciding.' }, { status: 409 })
    }
    const saved = await admin.rpc('compass_decide_wave_brief', {
      p_day: day, p_revision: body.revision, p_decision_value: source.value, p_action: body.action
    })
    if (saved.error) return portalJson({ error: saved.error.code === '40001' ? saved.error.message : 'Unable to save the decision.' }, { status: saved.error.code === '40001' ? 409 : 503 })
    return portalJson(saved.data)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJson({ error: 'wave_decision_failed' }, { status: 500 })
  }
}
