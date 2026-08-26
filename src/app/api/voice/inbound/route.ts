import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson } from '@/lib/portal-http'
import {
  buildDynamicVariables,
  lookupClientByTwilioNumber,
  safeDefaultDynamicVariables
} from '@/lib/voice-client'
import { verifyRetellSignature } from '@/lib/voice-webhook-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-retell-signature')
  const secret = process.env.RETELL_WEBHOOK_SECRET?.trim()
  if (secret && !verifyRetellSignature(raw, signature, secret)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const fromNumber = String(body.from_number ?? '')
  const toNumber = String(body.to_number ?? '')

  try {
    const admin = getPortalAdminClient()
    const ctx = await lookupClientByTwilioNumber(admin, toNumber)
    if (!ctx) {
      return portalJson({
        dynamic_variables: safeDefaultDynamicVariables(),
        metadata: { lookup: 'miss' }
      })
    }

    const dynamic_variables = buildDynamicVariables(ctx)
    return portalJson({
      dynamic_variables,
      metadata: {
        compass_client_id: ctx.clientId,
        pack_id: ctx.pack.pack_id
      }
    })
  } catch (err) {
    console.error('[voice/inbound]', err instanceof Error ? err.message : err)
    return portalJson({
      dynamic_variables: safeDefaultDynamicVariables(),
      metadata: { lookup: 'error' }
    })
  }
}

export async function GET() {
  return portalJson({ ok: true, service: 'voice-inbound' })
}
