import { getAgentSecret, readAgentCredential, secretsMatch } from '@/lib/agent-auth'
import { applyInstantlyWebhookEvent, type InstantlyWebhookPayload } from '@/lib/instantly-webhook'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Instantly → Compass real-time lead status.
 * Auth: Authorization Bearer <INSTANTLY_WEBHOOK_SECRET || COMPASS_AGENT_SECRET>
 * or x-compass-agent-secret / x-instantly-webhook-secret.
 */
function getWebhookSecret(): string | null {
  const dedicated = process.env.INSTANTLY_WEBHOOK_SECRET?.trim()
  if (dedicated) return dedicated
  return getAgentSecret()
}

function readWebhookCredential(request: Request): string | null {
  const header = request.headers.get('x-instantly-webhook-secret')?.trim()
  if (header) return header
  return readAgentCredential(request)
}

function requireWebhookAuth(request: Request): Response | null {
  const expected = getWebhookSecret()
  if (!expected) return portalJson({ error: 'webhook_not_configured' }, { status: 503 })
  const provided = readWebhookCredential(request)
  if (!secretsMatch(provided, expected)) {
    return portalJson({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(request: Request) {
  const authError = requireWebhookAuth(request)
  if (authError) return authError

  let body: unknown
  try {
    body = await readBoundedJson(request, 65_536)
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const payload =
    body && typeof body === 'object' ? (body as InstantlyWebhookPayload) : ({} as InstantlyWebhookPayload)

  try {
    const admin = getPortalAdminClient()
    const result = await applyInstantlyWebhookEvent(admin, payload)
    return portalJson(result, { status: 200 })
  } catch (err) {
    console.error('[webhooks/instantly]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'webhook_apply_failed' }, { status: 500 })
  }
}

/** Health for Instantly / operators — no secrets. */
export async function GET() {
  return portalJson({
    ok: true,
    service: 'instantly-webhook',
    accepts: [
      'reply_received',
      'lead_interested',
      'lead_not_interested',
      'lead_meeting_booked',
      'lead_meeting_completed',
      'lead_closed',
      'lead_out_of_office',
      'lead_wrong_person',
      'lead_unsubscribed',
      'email_bounced',
      'email_sent'
    ]
  })
}
