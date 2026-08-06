import { buildCreativeMetrics, type SyncedCreative } from '@/lib/ad-accounts'

/**
 * Google Ads sync via Google Ads API searchStream (GAQL).
 * Requires OAuth access token + developer token + customer id.
 */
export async function syncGoogleCreatives(input: {
  accessToken: string
  developerToken: string
  customerId: string
  loginCustomerId?: string
  leadValue?: number
}): Promise<{ creatives: SyncedCreative[]; spendToday: number; spendYesterday: number }> {
  const customerId = input.customerId.replace(/[-\s]/g, '')
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.ctr,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 40
  `.trim()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    'developer-token': input.developerToken,
    'Content-Type': 'application/json'
  }
  if (input.loginCustomerId) {
    headers['login-customer-id'] = input.loginCustomerId.replace(/[-\s]/g, '')
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      cache: 'no-store'
    }
  )

  const text = await res.text()
  if (!res.ok) {
    let message = `Google Ads API ${res.status}`
    try {
      const err = JSON.parse(text) as { error?: { message?: string } }
      if (err.error?.message) message = err.error.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  // searchStream returns a JSON array of chunks, each with results[].
  let chunks: Array<{ results?: Array<Record<string, unknown>> }> = []
  try {
    const parsed = JSON.parse(text) as unknown
    chunks = Array.isArray(parsed) ? (parsed as typeof chunks) : [parsed as (typeof chunks)[number]]
  } catch {
    throw new Error('google_ads_invalid_response')
  }

  const byCampaign = new Map<
    string,
    {
      name: string
      costMicros: number
      impressions: number
      clicks: number
      conversions: number
      conversionValue: number
    }
  >()

  for (const chunk of chunks) {
    for (const row of chunk.results ?? []) {
      const campaign = (row.campaign ?? {}) as { id?: string; name?: string }
      const metrics = (row.metrics ?? {}) as Record<string, unknown>
      if (!campaign.id) continue
      const prev = byCampaign.get(campaign.id) ?? {
        name: campaign.name || campaign.id,
        costMicros: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0
      }
      prev.costMicros += Number(metrics.costMicros ?? metrics.cost_micros ?? 0)
      prev.impressions += Number(metrics.impressions ?? 0)
      prev.clicks += Number(metrics.clicks ?? 0)
      prev.conversions += Number(metrics.conversions ?? 0)
      prev.conversionValue += Number(metrics.conversionsValue ?? metrics.conversions_value ?? 0)
      byCampaign.set(campaign.id, prev)
    }
  }

  const creatives = [...byCampaign.entries()]
    .map(([id, row]) => {
      const spend = row.costMicros / 1_000_000
      const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0
      return buildCreativeMetrics({
        id: `google-${id}`,
        name: row.name,
        channel: 'Google',
        spend,
        ctr,
        impressions: row.impressions,
        clicks: row.clicks,
        leads: Math.round(row.conversions),
        purchaseValue: row.conversionValue,
        leadValue: input.leadValue
      })
    })
    .sort((a, b) => b.spend - a.spend)

  // Daily spend via a second lightweight query.
  const daily = await fetchGoogleDailySpend({
    accessToken: input.accessToken,
    developerToken: input.developerToken,
    customerId,
    loginCustomerId: input.loginCustomerId
  })

  return { creatives, ...daily }
}

async function fetchGoogleDailySpend(input: {
  accessToken: string
  developerToken: string
  customerId: string
  loginCustomerId?: string
}): Promise<{ spendToday: number; spendYesterday: number }> {
  const query = `
    SELECT segments.date, metrics.cost_micros
    FROM customer
    WHERE segments.date DURING LAST_2_DAYS
  `.trim()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    'developer-token': input.developerToken,
    'Content-Type': 'application/json'
  }
  if (input.loginCustomerId) {
    headers['login-customer-id'] = input.loginCustomerId.replace(/[-\s]/g, '')
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${input.customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      cache: 'no-store'
    }
  )
  if (!res.ok) return { spendToday: 0, spendYesterday: 0 }

  const text = await res.text()
  let chunks: Array<{ results?: Array<Record<string, unknown>> }> = []
  try {
    const parsed = JSON.parse(text) as unknown
    chunks = Array.isArray(parsed) ? (parsed as typeof chunks) : [parsed as (typeof chunks)[number]]
  } catch {
    return { spendToday: 0, spendYesterday: 0 }
  }

  const today = new Date().toISOString().slice(0, 10)
  const yesterdayDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  let spendToday = 0
  let spendYesterday = 0

  for (const chunk of chunks) {
    for (const row of chunk.results ?? []) {
      const segments = (row.segments ?? {}) as { date?: string }
      const metrics = (row.metrics ?? {}) as Record<string, unknown>
      const spend = Number(metrics.costMicros ?? metrics.cost_micros ?? 0) / 1_000_000
      if (segments.date === today) spendToday += spend
      if (segments.date === yesterdayDate) spendYesterday += spend
    }
  }

  return { spendToday, spendYesterday }
}
