import type { NextRequest } from 'next/server'

import { getPortalAdminClient } from '@/lib/portal-admin'
import { onboardingFormUrl } from '@/lib/onboarding-rate-limit'
import { createOnboardingForm, latestOnboardingForm } from '@/lib/onboarding-server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data: client, error: clientError } = await supabase
      .from('compass_clients')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (clientError) return portalJson({ error: 'fetch_failed' }, { status: 500 })
    if (!client) return portalJson({ error: 'not_found' }, { status: 404 })

    const admin = getPortalAdminClient()
    const form = await latestOnboardingForm(admin, id)
    if (!form) return portalJson({ form: null })

    return portalJson({
      form: {
        id: form.id,
        status: form.status,
        offerKey: form.offer_key,
        sentAt: form.sent_at,
        openedAt: form.opened_at,
        submittedAt: form.submitted_at,
        url: onboardingFormUrl(form.token, _request)
      }
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: { offerKey?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data: client, error: clientError } = await supabase
      .from('compass_clients')
      .select('id,name')
      .eq('id', id)
      .maybeSingle()
    if (clientError) return portalJson({ error: 'create_failed' }, { status: 500 })
    if (!client) return portalJson({ error: 'not_found' }, { status: 404 })

    const admin = getPortalAdminClient()
    const offerKey = body.offerKey?.trim() || 'booked-jobs-system'
    const form = await createOnboardingForm(admin, id, offerKey)

    return portalJson(
      {
        form: {
          id: form.id,
          status: form.status,
          offerKey: form.offer_key,
          sentAt: form.sent_at,
          openedAt: form.opened_at,
          submittedAt: form.submitted_at,
          url: onboardingFormUrl(form.token, request)
        }
      },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('onboarding_pack_not_found')) {
      return portalJson({ error: 'pack_not_found' }, { status: 404 })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
