import {
  buildCreativeMetrics,
  extractConversionCount,
  extractPurchaseValue,
  type SyncedCreative
} from '@/lib/ad-accounts'

const GRAPH = 'https://graph.facebook.com/v21.0'

type MetaInsightRow = {
  ad_id?: string
  ad_name?: string
  campaign_id?: string
  campaign_name?: string
  spend?: string
  ctr?: string
  impressions?: string
  clicks?: string
  date_start?: string
  date_stop?: string
  actions?: Array<Record<string, unknown>>
  action_values?: Array<Record<string, unknown>>
}

async function metaGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  const body = (await res.json()) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Meta API ${res.status}`)
  }
  return body
}

export type MetaAdAccountInfo = {
  id: string
  account_id: string
  name: string
  currency?: string
  account_status?: number
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccountInfo[]> {
  const body = await metaGet<{ data?: MetaAdAccountInfo[] }>('/me/adaccounts', accessToken, {
    fields: 'id,account_id,name,currency,account_status',
    limit: '100'
  })
  return body.data ?? []
}

export async function fetchMetaAccountSpend(
  accessToken: string,
  actId: string,
  datePreset: 'today' | 'yesterday' | 'last_7d'
): Promise<number> {
  const body = await metaGet<{ data?: Array<{ spend?: string }> }>(
    `/${actId}/insights`,
    accessToken,
    {
      level: 'account',
      fields: 'spend',
      date_preset: datePreset,
      limit: '1'
    }
  )
  const spend = body.data?.[0]?.spend
  return spend ? Number(spend) : 0
}

export async function syncMetaCreatives(input: {
  accessToken: string
  actId: string
  leadValue?: number
}): Promise<{ creatives: SyncedCreative[]; periodStart?: string; periodEnd?: string }> {
  const body = await metaGet<{ data?: MetaInsightRow[] }>(`/${input.actId}/insights`, input.accessToken, {
    level: 'ad',
    fields: 'ad_id,ad_name,spend,ctr,impressions,clicks,actions,action_values',
    date_preset: 'last_30d',
    limit: '50',
    sort: 'spend_descending'
  })

  const rows = body.data ?? []
  const creatives = rows
    .filter((row) => row.ad_id && row.ad_name)
    .map((row) =>
      buildCreativeMetrics({
        id: `meta-${row.ad_id}`,
        name: row.ad_name || row.ad_id || 'Untitled ad',
        channel: 'Meta',
        spend: Number(row.spend || 0),
        ctr: Number(row.ctr || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        leads: extractConversionCount(row.actions),
        purchaseValue: extractPurchaseValue(row.action_values),
        leadValue: input.leadValue,
        periodStart: row.date_start,
        periodEnd: row.date_stop
      })
    )
    .sort((a, b) => b.spend - a.spend)

  return {
    creatives,
    periodStart: rows[0]?.date_start,
    periodEnd: rows[0]?.date_stop
  }
}

export async function exchangeMetaCode(input: {
  code: string
  redirectUri: string
  appId: string
  appSecret: string
}): Promise<{ accessToken: string; expiresIn?: number }> {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('client_secret', input.appSecret)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('code', input.code)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  const body = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: { message?: string }
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error?.message || 'meta_token_exchange_failed')
  }

  // Upgrade to long-lived user token when possible.
  const longUrl = new URL(`${GRAPH}/oauth/access_token`)
  longUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longUrl.searchParams.set('client_id', input.appId)
  longUrl.searchParams.set('client_secret', input.appSecret)
  longUrl.searchParams.set('fb_exchange_token', body.access_token)

  const longRes = await fetch(longUrl.toString(), { cache: 'no-store' })
  const longBody = (await longRes.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (longRes.ok && longBody.access_token) {
    return { accessToken: longBody.access_token, expiresIn: longBody.expires_in }
  }

  return { accessToken: body.access_token, expiresIn: body.expires_in }
}

export function metaOAuthUrl(input: {
  appId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('scope', 'ads_read,business_management')
  return url.toString()
}
