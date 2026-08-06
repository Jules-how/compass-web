import type { NextRequest } from 'next/server'

import { listLinkedInAdAccounts } from '@/lib/ad-sync/linkedin'
import { listMetaAdAccounts } from '@/lib/ad-sync/meta'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

/** Discover ad accounts for a pasted access token (before saving). */
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: { platform?: string; accessToken?: string }
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const platform = body.platform
  const accessToken = body.accessToken?.trim()
  if (!platform || !accessToken) {
    return portalJson({ error: 'platform_and_token_required' }, { status: 400 })
  }

  try {
    await requirePortalAccess({ operator: true })

    if (platform === 'meta') {
      const accounts = await listMetaAdAccounts(accessToken)
      return portalJson({
        accounts: accounts.map((a) => ({
          id: a.id,
          accountId: a.account_id,
          name: a.name,
          currency: a.currency ?? null,
          status: a.account_status === 1 ? 'active' : 'inactive'
        }))
      })
    }

    if (platform === 'linkedin') {
      const accounts = await listLinkedInAdAccounts(accessToken)
      return portalJson({
        accounts: accounts.map((a) => ({
          id: a.id,
          accountId: a.id,
          name: a.name,
          currency: a.currency ?? null,
          status: a.status ?? null
        }))
      })
    }

    if (platform === 'google') {
      return portalJson({
        accounts: [],
        hint: 'Paste your Google Ads customer ID (digits only). Discover via Google Ads → Settings → Account settings.'
      })
    }

    return portalJson({ error: 'unsupported_platform' }, { status: 400 })
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    const message = err instanceof Error ? err.message : 'discover_failed'
    return portalJson({ error: 'discover_failed', detail: message }, { status: 400 })
  }
}
