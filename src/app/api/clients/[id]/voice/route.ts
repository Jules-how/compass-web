import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'
import { listRecentVoiceCalls } from '@/lib/voice-calls'
import type { ClientVoiceConfig } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { id } = await context.params

    const [clientRes, calls] = await Promise.all([
      supabase.from('compass_clients').select('id,name,voice').eq('id', id).maybeSingle(),
      listRecentVoiceCalls(supabase, id, 15)
    ])

    if (clientRes.error || !clientRes.data) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    const voice = (clientRes.data.voice ?? {}) as ClientVoiceConfig
    return portalJson({
      clientId: id,
      clientName: clientRes.data.name,
      voice,
      calls
    })
  } catch (err) {
    const denied = portalAccessResponse(err)
    if (denied) return denied
    console.error('[clients/voice]', err)
    return portalJson({ error: 'load_failed' }, { status: 500 })
  }
}
