import 'server-only'

/**
 * Thin Google Ads REST client (v18).
 * Docs:
 * - Call structure: https://developers.google.com/google-ads/api/docs/concepts/call-structure
 * - searchStream: https://developers.google.com/google-ads/api/rest/reference/rest/v18/customers.googleAds/searchStream
 * - mutate: https://developers.google.com/google-ads/api/rest/reference/rest/v18/customers.googleAds/mutate
 * - List accessible customers: https://developers.google.com/google-ads/api/docs/account-management/listing-accounts
 */

import {
  accessTokenFromGoogleAdsRefresh,
  googleAdsApiConfigured,
  googleAdsDeveloperToken,
  googleAdsLoginCustomerId
} from '@/lib/google-attach/oauth'

const API_VERSION = 'v18'
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`

export type GoogleAdsApiError = {
  message: string
  status?: number
  details?: unknown
  requestId?: string
}

export type GoogleAdsClientOptions = {
  refreshToken: string
  /** Operating customer CID (no hyphens). */
  customerId: string
  /** When acting via MCC, login-customer-id header. */
  loginCustomerId?: string
}

export class GoogleAdsApiClient {
  private readonly refreshToken: string
  private readonly customerId: string
  private readonly loginCustomerId: string

  constructor(options: GoogleAdsClientOptions) {
    this.refreshToken = options.refreshToken
    this.customerId = options.customerId.replace(/-/g, '')
    this.loginCustomerId = (options.loginCustomerId || googleAdsLoginCustomerId()).replace(/-/g, '')
  }

  static configured(): boolean {
    return googleAdsApiConfigured().configured
  }

  private async headers(accessToken: string): Promise<Record<string, string>> {
    const developerToken = googleAdsDeveloperToken()
    if (!developerToken) throw new Error('google_ads_developer_token_missing')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json'
    }
    if (this.loginCustomerId) headers['login-customer-id'] = this.loginCustomerId
    return headers
  }

  private async accessToken(): Promise<string> {
    return accessTokenFromGoogleAdsRefresh(this.refreshToken)
  }

  private parseError(status: number, body: unknown): GoogleAdsApiError {
    const record = body as {
      error?: { message?: string; details?: unknown }
      message?: string
      requestId?: string
    }
    return {
      message: record.error?.message || record.message || `google_ads_http_${status}`,
      status,
      details: record.error?.details ?? body,
      requestId: record.requestId
    }
  }

  /**
   * GAQL searchStream — https://developers.google.com/google-ads/api/rest/reference/rest/v18/customers.googleAds/searchStream
   */
  async searchStream<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const accessToken = await this.accessToken()
    const res = await fetch(`${API_BASE}/customers/${this.customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: await this.headers(accessToken),
      body: JSON.stringify({ query })
    })
    const body = (await res.json().catch(() => ({}))) as unknown
    if (!res.ok) throw this.parseError(res.status, body)

    const rows: T[] = []
    if (Array.isArray(body)) {
      for (const chunk of body) {
        const results = (chunk as { results?: T[] }).results
        if (Array.isArray(results)) rows.push(...results)
      }
    }
    return rows
  }

  /**
   * Atomic mutate — https://developers.google.com/google-ads/api/rest/reference/rest/v18/customers.googleAds/mutate
   */
  async mutate(operations: Record<string, unknown>[]): Promise<{
    mutateOperationResponses: Array<Record<string, unknown>>
    partialFailureError?: unknown
  }> {
    if (operations.length === 0) return { mutateOperationResponses: [] }
    const accessToken = await this.accessToken()
    const res = await fetch(`${API_BASE}/customers/${this.customerId}/googleAds:mutate`, {
      method: 'POST',
      headers: await this.headers(accessToken),
      body: JSON.stringify({
        mutateOperations: operations,
        partialFailure: false,
        validateOnly: false
      })
    })
    const body = (await res.json().catch(() => ({}))) as {
      mutateOperationResponses?: Array<Record<string, unknown>>
      partialFailureError?: unknown
      error?: { message?: string }
    }
    if (!res.ok) throw this.parseError(res.status, body)
    return {
      mutateOperationResponses: body.mutateOperationResponses ?? [],
      partialFailureError: body.partialFailureError
    }
  }

  /**
   * GeoTargetConstant suggest — https://developers.google.com/google-ads/api/rest/reference/rest/v18/geoTargetConstants/suggest
   */
  static async suggestGeoTargets(input: {
    refreshToken: string
    locationNames: string[]
    locale?: string
    countryCode?: string
  }): Promise<
    Array<{
      searchTerm?: string
      geoTargetConstant?: {
        resourceName?: string
        name?: string
        targetType?: string
        countryCode?: string
      }
    }>
  > {
    if (input.locationNames.length === 0) return []
    const accessToken = await accessTokenFromGoogleAdsRefresh(input.refreshToken)
    const developerToken = googleAdsDeveloperToken()
    if (!developerToken) throw new Error('google_ads_developer_token_missing')

    const res = await fetch(`${API_BASE}/geoTargetConstants:suggest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locale: input.locale || 'en',
        countryCode: input.countryCode || 'AU',
        locationNames: {
          names: input.locationNames
        }
      })
    })
    const body = (await res.json().catch(() => ({}))) as {
      geoTargetConstantSuggestions?: Array<{
        searchTerm?: string
        geoTargetConstant?: {
          resourceName?: string
          name?: string
          targetType?: string
          countryCode?: string
        }
      }>
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(body.error?.message || `geo_suggest_failed (${res.status})`)
    }
    return body.geoTargetConstantSuggestions ?? []
  }

  /** ListAccessibleCustomers — manager OAuth context, no login-customer-id required. */
  static async listAccessibleCustomers(refreshToken: string): Promise<string[]> {
    const accessToken = await accessTokenFromGoogleAdsRefresh(refreshToken)
    const developerToken = googleAdsDeveloperToken()
    if (!developerToken) throw new Error('google_ads_developer_token_missing')
    const res = await fetch(`${API_BASE}/customers:listAccessibleCustomers`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken
      }
    })
    const body = (await res.json().catch(() => ({}))) as {
      resourceNames?: string[]
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(body.error?.message || `list_accessible_customers_failed (${res.status})`)
    }
    return (body.resourceNames ?? []).map((name) => name.replace('customers/', ''))
  }
}

export function tempResourceName(customerId: string, kind: string, id: number): string {
  return `customers/${customerId.replace(/-/g, '')}/${kind}/-${id}`
}

export function microsFromAud(aud: number): string {
  return String(Math.round(aud * 1_000_000))
}

export function customerResource(customerId: string): string {
  return `customers/${customerId.replace(/-/g, '')}`
}

export function googleAdsConsoleUrl(customerId: string, campaignId?: string): string {
  const cid = customerId.replace(/-/g, '')
  if (campaignId) {
    return `https://ads.google.com/aw/campaigns?campaignId=${campaignId}&__u=${cid}`
  }
  return `https://ads.google.com/aw/overview?__u=${cid}`
}
