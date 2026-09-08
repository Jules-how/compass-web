import { NextRequest } from 'next/server'
import {
  acceptAgreement,
  beginCheckout,
  ensureSigningTasks,
  getAgreementByToken,
  publicAgreement,
  refreshPayment,
} from '@/lib/agreement-server'
import {
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/portal-http'
import { checkOnboardingRateLimit } from '@/lib/onboarding-rate-limit'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Context = { params: Promise<{ token: string }> }
function limit(request: Request, token: string, action: 'read' | 'write') {
  const r = checkOnboardingRateLimit(request, token, action)
  return r.ok
    ? null
    : portalJson(
        { error: 'Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
      )
}
export async function GET(request: NextRequest, context: Context) {
  const { token } = await context.params
  const limited = limit(request, token, 'read')
  if (limited) return limited
  try {
    const record = await getAgreementByToken(token)
    return portalJson(
      { agreement: publicAgreement(record) },
      {
        headers: {
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex',
        },
      },
    )
  } catch {
    return portalJson({ error: 'Signing link not found.' }, { status: 404 })
  }
}
export async function POST(request: NextRequest, context: Context) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { token } = await context.params
  const limited = limit(request, token, 'write')
  if (limited) return limited
  try {
    const body = (await readBoundedJson(request, 10000)) as {
      action?: string
      name?: string
      email?: string
      consent?: boolean
      documentHash?: string
    }
    const record = await getAgreementByToken(token)
    if (body.action === 'accept') {
      const signed = await acceptAgreement(record, body, request)
      let taskWarning = false
      try {
        await ensureSigningTasks(signed)
      } catch {
        taskWarning = true
      }
      return portalJson({ agreement: publicAgreement(signed), taskWarning })
    }
    if (body.action === 'checkout') {
      return portalJson({
        url: await beginCheckout(record, request.nextUrl.origin),
      })
    }
    if (body.action === 'refresh') {
      return portalJson({
        agreement: publicAgreement(await refreshPayment(record)),
      })
    }
    throw new Error('Unknown action.')
  } catch (e) {
    return portalJson(
      {
        error:
          e instanceof Error ? e.message : 'Unable to complete this action.',
      },
      { status: 400 },
    )
  }
}
