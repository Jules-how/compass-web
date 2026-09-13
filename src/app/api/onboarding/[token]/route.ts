import type { NextRequest } from 'next/server'

import { getPortalAdminClient } from '@/lib/portal-admin'
import {
  checkOnboardingRateLimit,
  resolveAppOrigin
} from '@/lib/onboarding-rate-limit'
import {
  loadFormByToken,
  markFormOpened,
  processOnboardingSubmit,
  publicPackForForm,
  saveFormAnswers
} from '@/lib/onboarding-server'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ token: string }>
}

function rateLimitResponse(retryAfterSec: number) {
  return portalJson(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  )
}

function invalidToken() {
  return portalJson({ error: 'not_found' }, { status: 404 })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params
  if (!token || token.length < 20) return invalidToken()

  const limit = checkOnboardingRateLimit(_request, token, 'read')
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec)

  try {
    const admin = getPortalAdminClient()
    const form = await loadFormByToken(admin, token)
    if (!form || form.status === 'expired') return invalidToken()

    await markFormOpened(admin, form)

    const pack = publicPackForForm(form.offer_key)
    return portalJson({
      status: form.status === 'sent' ? 'opened' : form.status,
      offerKey: form.offer_key,
      answers: form.answers,
      submittedAt: form.submitted_at,
      pack: {
        title: pack.title,
        subtitle: pack.subtitle,
        sections: pack.sections
      }
    })
  } catch {
    return portalJson({ error: 'load_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { token } = await context.params
  if (!token || token.length < 20) return invalidToken()

  const limit = checkOnboardingRateLimit(request, token, 'write')
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec)

  let body: { answers?: Record<string, unknown> }
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return portalJson({ error: 'answers_required' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const form = await loadFormByToken(admin, token)
    if (!form || form.status === 'expired' || form.status === 'submitted') {
      return invalidToken()
    }

    const merged = { ...form.answers, ...body.answers }
    await saveFormAnswers(admin, form.id, merged)
    if (form.status === 'sent') await markFormOpened(admin, form)

    return portalJson({ ok: true, answers: merged })
  } catch {
    return portalJson({ error: 'save_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params
  if (!token || token.length < 20) return invalidToken()

  const limit = checkOnboardingRateLimit(request, token, 'write')
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec)

  let body: { answers?: Record<string, unknown> }
  try {
    body = (await readBoundedJson(request, 256 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const admin = getPortalAdminClient()
    const form = await loadFormByToken(admin, token)
    if (!form || form.status === 'expired') return invalidToken()

    if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
      const merged = { ...form.answers, ...body.answers }
      await saveFormAnswers(admin, form.id, merged)
      form.answers = merged
    }

    const result = await processOnboardingSubmit(form)
    if (result.validationErrors?.length) {
      return portalJson({ error: 'validation_failed', errors: result.validationErrors }, { status: 400 })
    }

    return portalJson({
      ok: true,
      clientId: result.clientId,
      projectId: result.projectId,
      redirectUrl: `${resolveAppOrigin(request)}/onboard/${token}?done=1`
    })
  } catch {
    return portalJson({ error: 'submit_failed' }, { status: 500 })
  }
}
