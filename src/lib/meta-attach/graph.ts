/**
 * Meta Marketing API adapter with composio (proxy) and direct (Graph) drivers.
 *
 * Composio proxy docs:
 * https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteProxy
 * POST https://backend.composio.dev/api/v3.1/tools/execute/proxy
 * Headers: x-api-key: COMPOSIO_API_KEY
 * Body: { connected_account_id, endpoint, method, body?, parameters? }
 */
import 'server-only'

import type {
  MetaAttachDriverConfig,
  MetaGraphAdapter,
  MetaGraphAdInput,
  MetaGraphAdSetInput,
  MetaGraphCampaignInput,
  MetaGraphCreativeInput,
  MetaGraphImageInput
} from '@/lib/meta-attach/types'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const COMPOSIO_PROXY = 'https://backend.composio.dev/api/v3.1/tools/execute/proxy'

type GraphError = { error?: { message?: string; code?: number } }

function actPath(adAccountId: string): string {
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  return id
}

async function readImageBytes(imageUrl: string): Promise<Uint8Array> {
  const res = await fetch(imageUrl, { cache: 'no-store' })
  if (!res.ok) throw new Error(`image_fetch_failed:${res.status}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

function createDirectAdapter(accessToken: string): MetaGraphAdapter {
  async function graphPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = new URL(`${GRAPH_BASE}${path}`)
    url.searchParams.set('access_token', accessToken)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    })
    const json = (await res.json()) as T & GraphError
    if (!res.ok || json.error) {
      throw new Error(json.error?.message || `meta_graph_${res.status}`)
    }
    return json
  }

  async function graphGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${GRAPH_BASE}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('access_token', accessToken)
    const res = await fetch(url.toString(), { cache: 'no-store' })
    const json = (await res.json()) as T & GraphError
    if (!res.ok || json.error) {
      throw new Error(json.error?.message || `meta_graph_${res.status}`)
    }
    return json
  }

  return {
    driver: 'direct',
    configured: Boolean(accessToken),

    async ensureCampaignPaused(input: MetaGraphCampaignInput) {
      const body = await graphPost<{ id: string }>(`/${actPath(input.adAccountId)}/campaigns`, {
        name: input.name,
        objective: input.objective ?? 'OUTCOME_LEADS',
        status: 'PAUSED',
        special_ad_categories: [],
        buying_type: 'AUCTION'
      })
      return { id: body.id }
    },

    async ensureAdSetPaused(input: MetaGraphAdSetInput) {
      const body = await graphPost<{ id: string }>(`/${actPath(input.adAccountId)}/adsets`, {
        name: input.name,
        campaign_id: input.campaignId,
        daily_budget: Math.round(input.dailyBudget * 100),
        billing_event: 'IMPRESSIONS',
        optimization_goal: input.optimizationGoal ?? 'LEAD_GENERATION',
        destination_type: input.destinationType ?? 'WEBSITE',
        promoted_object: { page_id: input.pageId },
        targeting: input.targeting,
        status: 'PAUSED',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
      })
      return { id: body.id }
    },

    async uploadImage(input: MetaGraphImageInput) {
      const bytes = await readImageBytes(input.imageUrl)
      const form = new FormData()
      form.set('access_token', accessToken)
      form.set('bytes', new Blob([Buffer.from(bytes)]), 'creative.png')
      const res = await fetch(`${GRAPH_BASE}/${actPath(input.adAccountId)}/adimages`, {
        method: 'POST',
        body: form,
        cache: 'no-store'
      })
      const json = (await res.json()) as {
        images?: Record<string, { hash?: string }>
        error?: { message?: string }
      }
      if (!res.ok || json.error) {
        throw new Error(json.error?.message || 'meta_image_upload_failed')
      }
      const first = Object.values(json.images ?? {})[0]
      if (!first?.hash) throw new Error('meta_image_hash_missing')
      return { hash: first.hash }
    },

    async createCreative(input: MetaGraphCreativeInput) {
      const body = await graphPost<{ id: string }>(`/${actPath(input.adAccountId)}/adcreatives`, {
        name: input.name,
        object_story_spec: {
          page_id: input.pageId,
          link_data: {
            message: input.primaryText,
            name: input.headline,
            description: input.description,
            link: input.link,
            image_hash: input.imageHash,
            call_to_action: { type: input.cta, value: { link: input.link } }
          }
        }
      })
      return { id: body.id }
    },

    async createAdPaused(input: MetaGraphAdInput) {
      const body = await graphPost<{ id: string }>(`/${actPath(input.adAccountId)}/ads`, {
        name: input.name,
        adset_id: input.adSetId,
        creative: { creative_id: input.creativeId },
        status: 'PAUSED'
      })
      return { id: body.id }
    },

    async fetchAdInsights(input) {
      const body = await graphGet<{ data?: Array<Record<string, unknown>> }>(
        `/${actPath(input.adAccountId)}/insights`,
        {
          level: 'ad',
          fields: 'ad_id,spend,actions,date_start,date_stop',
          date_preset: input.datePreset ?? 'yesterday',
          filtering: JSON.stringify([
            { field: 'ad.id', operator: 'IN', value: input.adIds }
          ]),
          limit: '50'
        }
      )
      return (body.data ?? []).map((row) => ({
        ad_id: String(row.ad_id ?? ''),
        spend: Number(row.spend ?? 0),
        leads: extractLeadCount(row.actions as Array<Record<string, unknown>> | undefined),
        date_start: row.date_start ? String(row.date_start) : undefined,
        date_stop: row.date_stop ? String(row.date_stop) : undefined
      }))
    }
  }
}

function createComposioAdapter(apiKey: string, connectedAccountId: string): MetaGraphAdapter {
  async function proxyRequest<T>(input: {
    endpoint: string
    method: string
    body?: Record<string, unknown>
    parameters?: Array<{ name: string; value: string; type: 'header' | 'query' }>
  }): Promise<T> {
    const res = await fetch(COMPOSIO_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        connected_account_id: connectedAccountId,
        endpoint: input.endpoint,
        method: input.method,
        body: input.body,
        parameters: input.parameters
      }),
      cache: 'no-store'
    })
    const json = (await res.json()) as {
      data?: T
      error?: string
      message?: string
      successful?: boolean
    }
    if (!res.ok) {
      throw new Error(json.error || json.message || `composio_proxy_${res.status}`)
    }
    const payload = (json.data ?? json) as T & GraphError
    if ((payload as GraphError).error) {
      throw new Error((payload as GraphError).error?.message || 'composio_meta_error')
    }
    return payload
  }

  return {
    driver: 'composio',
    configured: Boolean(apiKey && connectedAccountId),

    async ensureCampaignPaused(input: MetaGraphCampaignInput) {
      const body = await proxyRequest<{ id: string }>({
        endpoint: `/${GRAPH_VERSION}/${actPath(input.adAccountId)}/campaigns`,
        method: 'POST',
        body: {
          name: input.name,
          objective: input.objective ?? 'OUTCOME_LEADS',
          status: 'PAUSED',
          special_ad_categories: [],
          buying_type: 'AUCTION'
        }
      })
      return { id: body.id }
    },

    async ensureAdSetPaused(input: MetaGraphAdSetInput) {
      const body = await proxyRequest<{ id: string }>({
        endpoint: `/${GRAPH_VERSION}/${actPath(input.adAccountId)}/adsets`,
        method: 'POST',
        body: {
          name: input.name,
          campaign_id: input.campaignId,
          daily_budget: Math.round(input.dailyBudget * 100),
          billing_event: 'IMPRESSIONS',
          optimization_goal: input.optimizationGoal ?? 'LEAD_GENERATION',
          destination_type: input.destinationType ?? 'WEBSITE',
          promoted_object: { page_id: input.pageId },
          targeting: input.targeting,
          status: 'PAUSED',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
        }
      })
      return { id: body.id }
    },

    async uploadImage(input: MetaGraphImageInput) {
      // Composio proxy is JSON-only; fetch image server-side then use direct multipart as fallback
      // when META_ACCESS_TOKEN is also set, else require pre-uploaded hash via review.
      const token = process.env.META_ACCESS_TOKEN?.trim()
      if (!token) {
        throw new Error('composio_image_upload_requires_META_ACCESS_TOKEN_or_preuploaded_hash')
      }
      return createDirectAdapter(token).uploadImage(input)
    },

    async createCreative(input: MetaGraphCreativeInput) {
      const body = await proxyRequest<{ id: string }>({
        endpoint: `/${GRAPH_VERSION}/${actPath(input.adAccountId)}/adcreatives`,
        method: 'POST',
        body: {
          name: input.name,
          object_story_spec: {
            page_id: input.pageId,
            link_data: {
              message: input.primaryText,
              name: input.headline,
              description: input.description,
              link: input.link,
              image_hash: input.imageHash,
              call_to_action: { type: input.cta, value: { link: input.link } }
            }
          }
        }
      })
      return { id: body.id }
    },

    async createAdPaused(input: MetaGraphAdInput) {
      const body = await proxyRequest<{ id: string }>({
        endpoint: `/${GRAPH_VERSION}/${actPath(input.adAccountId)}/ads`,
        method: 'POST',
        body: {
          name: input.name,
          adset_id: input.adSetId,
          creative: { creative_id: input.creativeId },
          status: 'PAUSED'
        }
      })
      return { id: body.id }
    },

    async fetchAdInsights(input) {
      const token = process.env.META_ACCESS_TOKEN?.trim()
      if (!token) return []
      return createDirectAdapter(token).fetchAdInsights!(input)
    }
  }
}

function extractLeadCount(actions?: Array<Record<string, unknown>>): number {
  if (!actions) return 0
  let total = 0
  for (const action of actions) {
    const type = String(action.action_type ?? '')
    if (type.includes('lead')) total += Number(action.value ?? 0)
  }
  return total
}

export function resolveMetaAttachDriver(): MetaAttachDriverConfig {
  const driver = (process.env.META_ATTACH_DRIVER ?? 'composio').trim().toLowerCase()

  if (driver === 'direct') {
    const token = process.env.META_ACCESS_TOKEN?.trim()
    if (!token) {
      return { ok: false, driver: 'direct', error: 'META_ACCESS_TOKEN not configured' }
    }
    const adapter = createDirectAdapter(token)
    return { ok: true, driver: 'direct', adapter }
  }

  if (driver === 'composio') {
    const apiKey = process.env.COMPOSIO_API_KEY?.trim()
    const accountId = process.env.COMPOSIO_META_ACCOUNT_ID?.trim()
    if (!apiKey || !accountId) {
      return {
        ok: false,
        driver: 'composio',
        error: 'COMPOSIO_API_KEY and COMPOSIO_META_ACCOUNT_ID required for composio driver'
      }
    }
    const adapter = createComposioAdapter(apiKey, accountId)
    return { ok: true, driver: 'composio', adapter }
  }

  return { ok: false, driver: 'none', error: `Unknown META_ATTACH_DRIVER: ${driver}` }
}

export { createDirectAdapter, createComposioAdapter }
