import { buildCreativeMetrics, type SyncedCreative } from '@/lib/ad-accounts'

/**
 * LinkedIn Marketing API creative analytics.
 * Requires a Marketing Developer Platform token with rw_ads / r_ads reporting scopes.
 */
export async function syncLinkedInCreatives(input: {
  accessToken: string
  adAccountId: string
  leadValue?: number
}): Promise<{ creatives: SyncedCreative[]; spendToday: number; spendYesterday: number }> {
  const accountUrn = input.adAccountId.startsWith('urn:')
    ? input.adAccountId
    : `urn:li:sponsoredAccount:${input.adAccountId}`

  const end = new Date()
  const start = new Date(Date.now() - 30 * 86_400_000)
  const dateRange = {
    start: {
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      day: start.getUTCDate()
    },
    end: {
      year: end.getUTCFullYear(),
      month: end.getUTCMonth() + 1,
      day: end.getUTCDate()
    }
  }

  const params = new URLSearchParams()
  params.set('q', 'analytics')
  params.set('pivot', 'CREATIVE')
  params.set('timeGranularity', 'ALL')
  params.set('dateRange', JSON.stringify(dateRange))
  params.append('accounts', accountUrn)
  params.set(
    'fields',
    'impressions,clicks,costInLocalCurrency,externalWebsiteConversions,conversionValueInLocalCurrency,pivotValues'
  )

  const res = await fetch(
    `https://api.linkedin.com/rest/adAnalytics?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      cache: 'no-store'
    }
  )

  const body = (await res.json()) as {
    elements?: Array<Record<string, unknown>>
    message?: string
    status?: number
  }
  if (!res.ok) {
    throw new Error(body.message || `LinkedIn Ads API ${res.status}`)
  }

  const creatives = (body.elements ?? [])
    .map((row, index) => {
      const spend = Number(row.costInLocalCurrency ?? 0)
      const impressions = Number(row.impressions ?? 0)
      const clicks = Number(row.clicks ?? 0)
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
      const leads = Math.round(Number(row.externalWebsiteConversions ?? 0))
      const purchaseValue = Number(row.conversionValueInLocalCurrency ?? 0)
      const pivotValues = Array.isArray(row.pivotValues) ? row.pivotValues : []
      const creativeUrn = String(pivotValues[0] ?? `linkedin-${index}`)
      const id = creativeUrn.replace(/^urn:li:sponsoredCreative:/, 'linkedin-')

      return buildCreativeMetrics({
        id,
        name: creativeUrn.includes('sponsoredCreative')
          ? `Creative ${creativeUrn.split(':').pop()}`
          : creativeUrn,
        channel: 'LinkedIn',
        spend,
        ctr,
        impressions,
        clicks,
        leads,
        purchaseValue,
        leadValue: input.leadValue
      })
    })
    .sort((a, b) => b.spend - a.spend)

  // LinkedIn daily spend is optional; approximate from window average when unavailable.
  const windowSpend = creatives.reduce((s, c) => s + c.spend, 0)
  const spendToday = windowSpend / 30
  return { creatives, spendToday, spendYesterday: spendToday }
}

export async function listLinkedInAdAccounts(accessToken: string): Promise<
  Array<{ id: string; name: string; currency?: string; status?: string }>
> {
  const res = await fetch(
    'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))&count=50',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      cache: 'no-store'
    }
  )
  const body = (await res.json()) as {
    elements?: Array<{ id?: number | string; name?: string; currency?: string; status?: string }>
    message?: string
  }
  if (!res.ok) throw new Error(body.message || `LinkedIn Ads API ${res.status}`)
  return (body.elements ?? []).map((el) => ({
    id: String(el.id ?? ''),
    name: el.name || String(el.id ?? ''),
    currency: el.currency,
    status: el.status
  }))
}
