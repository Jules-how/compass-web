import type { NextRequest } from 'next/server'

import {
  AD_ACCOUNT_LIST_COLUMNS,
  normalizeExternalAccountId,
  projectAdAccount,
  type AdAccountRow,
  type AdPlatform
} from '@/lib/ad-accounts'
import { encryptSecret } from '@/lib/ad-token-crypto'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

const PLATFORMS = new Set<AdPlatform>(['meta', 'google', 'linkedin'])

export async function GET() {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_ad_accounts')
      .select(AD_ACCOUNT_LIST_COLUMNS)
      .order('created_at', { ascending: true })

    if (error) {
      // Table may not be migrated yet — return empty with a soft hint.
      if (/does not exist|schema cache/i.test(error.message)) {
        return portalJsonCached({ accounts: [], migrationRequired: true })
      }
      return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    }

    return portalJsonCached({
      accounts: ((data ?? []) as AdAccountRow[]).map(projectAdAccount),
      oauth: {
        meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
      }
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: {
    platform?: string
    externalAccountId?: string
    accountName?: string
    currency?: string
    accessToken?: string
    refreshToken?: string
    developerToken?: string
    loginCustomerId?: string
    leadValue?: number
  }
  try {
    body = (await readBoundedJson(request, 32 * 1024)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const platform = body.platform as AdPlatform | undefined
  if (!platform || !PLATFORMS.has(platform)) {
    return portalJson({ error: 'platform_required' }, { status: 400 })
  }

  const externalRaw = body.externalAccountId?.trim()
  if (!externalRaw) return portalJson({ error: 'account_id_required' }, { status: 400 })
  const externalAccountId = normalizeExternalAccountId(platform, externalRaw)

  const accessToken = body.accessToken?.trim()
  if (!accessToken) return portalJson({ error: 'access_token_required' }, { status: 400 })

  const stamp = new Date().toISOString()
  const meta: Record<string, unknown> = {}
  if (typeof body.leadValue === 'number' && body.leadValue > 0) meta.lead_value = body.leadValue
  if (body.developerToken?.trim()) meta.developer_token = body.developerToken.trim()
  if (body.loginCustomerId?.trim()) {
    meta.login_customer_id = body.loginCustomerId.trim().replace(/[-\s]/g, '')
  }

  const row = {
    id: `adacct-${crypto.randomUUID()}`,
    platform,
    external_account_id: externalAccountId,
    account_name: body.accountName?.trim() || externalAccountId,
    currency: body.currency?.trim() || null,
    status: 'connected' as const,
    access_token_enc: encryptSecret(accessToken),
    refresh_token_enc: body.refreshToken?.trim()
      ? encryptSecret(body.refreshToken.trim())
      : null,
    token_expires_at: null as string | null,
    meta,
    last_synced_at: null as string | null,
    last_error: null as string | null,
    created_at: stamp,
    updated_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    // Upsert on platform + external id.
    const { data: existing } = await supabase
      .from('compass_ad_accounts')
      .select('id')
      .eq('platform', platform)
      .eq('external_account_id', externalAccountId)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await supabase
        .from('compass_ad_accounts')
        .update({
          account_name: row.account_name,
          currency: row.currency,
          status: 'connected',
          access_token_enc: row.access_token_enc,
          refresh_token_enc: row.refresh_token_enc,
          meta: row.meta,
          last_error: null,
          updated_at: stamp
        })
        .eq('id', existing.id)
        .select(AD_ACCOUNT_LIST_COLUMNS)
        .single()
      if (error) {
        return portalJson({ error: 'save_failed', detail: error.message }, { status: 400 })
      }
      return portalJson(projectAdAccount(data as AdAccountRow))
    }

    const { data, error } = await supabase
      .from('compass_ad_accounts')
      .insert(row)
      .select(AD_ACCOUNT_LIST_COLUMNS)
      .single()

    if (error) {
      return portalJson({ error: 'save_failed', detail: error.message }, { status: 400 })
    }

    return portalJson(projectAdAccount(data as AdAccountRow), { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'save_failed' }, { status: 500 })
  }
}
