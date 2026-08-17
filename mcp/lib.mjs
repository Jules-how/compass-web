/**
 * Lean Compass agent MCP. Six tools. No Instantly clone, no ads, no library dump.
 */

export const SERVER_NAME = 'compass'
export const SERVER_VERSION = '0.1.0'
export const PROTOCOL_VERSION = '2024-11-05'

const DEFAULT_BASE = 'https://compass-web-eosin.vercel.app'
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const TOOLS = [
  {
    name: 'brief',
    description:
      'Compact daily brief. Cached unless fresh=true. Start here. Not live Instantly counts unless fresh.',
    inputSchema: {
      type: 'object',
      properties: {
        fresh: { type: 'boolean', description: 'Rebuild counts. Default false.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'campaigns',
    description: 'Pipeline campaigns with compact wave (cohort, blocked, readyToActivate).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'leads',
    description:
      'inventory = uncontacted counts by vertical×state. cohort = harvest rows for one campaign. Always limited.',
    inputSchema: {
      type: 'object',
      required: ['view'],
      properties: {
        view: { type: 'string', enum: ['inventory', 'cohort'] },
        campaignId: { type: 'string', description: 'Required for cohort.' },
        vertical: { type: 'string', description: 'Optional inventory filter.' },
        enrich_status: { type: 'string', description: 'Comma list, e.g. none,queued' },
        unverified_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
        offset: { type: 'integer', minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'mark',
    description:
      'PATCH lead_contacts. Bulk ids/emails (max 500) or rows[] (max 50) for facts/opener/website. Same-turn land stamps.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        emails: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'object' } },
        pipeline_campaign_id: { type: 'string' },
        cohort_tag: { type: 'string' },
        enrich_status: { type: 'string' },
        outbound_status: { type: 'string' },
        instantly_lead_id: { type: 'string' },
        instantly_campaign_id: { type: 'string' },
        instantly_campaign_name: { type: 'string' },
        email_verify_status: { type: 'string' },
        email_verified: { type: 'boolean' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'copy',
    description:
      'Campaign sequence_draft and wave flags. get is compact unless full=true. patch always Prefer: return=minimal. Changing body clears copy_confirmed_at.',
    inputSchema: {
      type: 'object',
      required: ['campaignId', 'action'],
      properties: {
        campaignId: { type: 'string' },
        action: { type: 'string', enum: ['get', 'patch'] },
        full: { type: 'boolean', description: 'Include sequence_draft on get.' },
        patch: {
          type: 'object',
          description: 'Fields for patch (sequence_draft, opener_reviewed_at, copy_confirmed_at, experiment_*).'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'land',
    description:
      'Paused Instantly only. ensure binds campaign. push_sequence writes Compass copy. push_leads maps opener→Personalization and stamps in_instantly. push_leads is dry-run unless dryRun=false. Never activates.',
    inputSchema: {
      type: 'object',
      required: ['campaignId', 'action'],
      properties: {
        campaignId: { type: 'string' },
        action: { type: 'string', enum: ['ensure', 'push_sequence', 'push_leads'] },
        pushSequence: { type: 'boolean', description: 'ensure only: also push sequence.' },
        dryRun: {
          type: 'boolean',
          description: 'push_leads only. Default true. Set false to actually upload.'
        }
      },
      additionalProperties: false
    }
  }
]

export function clampLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(v)))
}

export function parseEnvFile(text) {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const stripped = line.startsWith('export ') ? line.slice(7) : line
    const eq = stripped.indexOf('=')
    if (eq < 1) continue
    const key = stripped.slice(0, eq).trim()
    let val = stripped.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

export function resolveConfig(env, fileMaps = []) {
  const merged = { ...env }
  for (const map of fileMaps) {
    if (map && typeof map === 'object') {
      for (const [k, v] of Object.entries(map)) {
        if (merged[k] == null || merged[k] === '') merged[k] = v
      }
    }
  }
  return {
    baseUrl: (merged.COMPASS_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
    secret: merged.COMPASS_AGENT_SECRET || ''
  }
}

export async function compassFetch(cfg, { method, path, query, body, headers = {}, fetchImpl }) {
  const url = new URL(cfg.baseUrl + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === '') continue
      url.searchParams.set(k, String(v))
    }
  }
  const fetchFn = fetchImpl || fetch
  const res = await fetchFn(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.secret}`,
      Accept: 'application/json',
      ...headers,
      ...(body != null ? { 'Content-Type': 'application/json' } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { error: 'non_json', status: res.status, body: text.slice(0, 400) }
  }
  return { status: res.status, json }
}

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

function toolOk(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

export async function callTool(name, args = {}, { cfg, fetchImpl }) {
  if (!cfg.secret) return toolError('missing COMPASS_AGENT_SECRET')

  switch (name) {
    case 'brief': {
      const r = await compassFetch(cfg, {
        method: 'GET',
        path: '/api/agent/brief',
        headers: args.fresh === true ? { 'x-compass-fresh': '1' } : {},
        fetchImpl
      })
      return toolOk(r.json)
    }
    case 'campaigns': {
      const r = await compassFetch(cfg, { method: 'GET', path: '/api/agent/campaigns', fetchImpl })
      return toolOk(r.json)
    }
    case 'leads': {
      const view = args.view
      if (view === 'inventory') {
        const r = await compassFetch(cfg, {
          method: 'GET',
          path: '/api/agent/leads/inventory',
          query: { vertical: args.vertical || undefined },
          fetchImpl
        })
        return toolOk(r.json)
      }
      if (view === 'cohort') {
        const campaignId = typeof args.campaignId === 'string' ? args.campaignId.trim() : ''
        if (!campaignId) return toolError('cohort requires campaignId')
        const r = await compassFetch(cfg, {
          method: 'GET',
          path: '/api/agent/leads/cohort',
          query: {
            pipeline_campaign_id: campaignId,
            enrich_status: args.enrich_status || undefined,
            unverified_only: args.unverified_only === true ? '1' : undefined,
            limit: String(clampLimit(args.limit)),
            offset: String(Math.max(0, Number(args.offset) || 0))
          },
          fetchImpl
        })
        return toolOk(r.json)
      }
      return toolError('leads.view must be inventory or cohort')
    }
    case 'mark': {
      const body = { ...args }
      delete body.view
      const r = await compassFetch(cfg, {
        method: 'PATCH',
        path: '/api/agent/leads/mark',
        body,
        fetchImpl
      })
      return toolOk(r.json)
    }
    case 'copy': {
      const campaignId = typeof args.campaignId === 'string' ? args.campaignId.trim() : ''
      if (!campaignId) return toolError('copy requires campaignId')
      const path = `/api/agent/outbound/campaigns/${encodeURIComponent(campaignId)}/copy`
      if (args.action === 'get') {
        const r = await compassFetch(cfg, {
          method: 'GET',
          path,
          query: args.full === true ? { full: '1' } : undefined,
          fetchImpl
        })
        return toolOk(r.json)
      }
      if (args.action === 'patch') {
        const r = await compassFetch(cfg, {
          method: 'PATCH',
          path,
          body: args.patch && typeof args.patch === 'object' ? args.patch : {},
          headers: { Prefer: 'return=minimal' },
          fetchImpl
        })
        return toolOk(r.json)
      }
      return toolError('copy.action must be get or patch')
    }
    case 'land': {
      const campaignId = typeof args.campaignId === 'string' ? args.campaignId.trim() : ''
      if (!campaignId) return toolError('land requires campaignId')
      if (args.action === 'ensure') {
        const r = await compassFetch(cfg, {
          method: 'POST',
          path: '/api/agent/instantly/ensure',
          body: { campaignId, pushSequence: args.pushSequence === true },
          fetchImpl
        })
        return toolOk(r.json)
      }
      if (args.action === 'push_sequence') {
        const r = await compassFetch(cfg, {
          method: 'POST',
          path: '/api/agent/instantly/push-sequence',
          body: { campaignId },
          fetchImpl
        })
        return toolOk(r.json)
      }
      if (args.action === 'push_leads') {
        const dryRun = args.dryRun !== false
        const r = await compassFetch(cfg, {
          method: 'POST',
          path: '/api/agent/instantly/push-leads',
          body: { campaignId, dryRun },
          fetchImpl
        })
        return toolOk(r.json)
      }
      return toolError('land.action must be ensure, push_sequence, or push_leads')
    }
    default:
      return toolError(`unknown tool: ${name}`)
  }
}

export async function handleRpc(message, ctx) {
  if (!message || typeof message !== 'object') return null
  const { id, method, params } = message
  if (method && String(method).startsWith('notifications/')) return null

  const reply = (result, error) => {
    if (id === undefined || id === null) return null
    const out = { jsonrpc: '2.0', id }
    if (error) out.error = error
    else out.result = result
    return out
  }

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
    case 'tools/call': {
      const name = params?.name
      const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}
      const result = await callTool(name, args, ctx)
      return reply(result)
    }
    default:
      return reply(null, { code: -32601, message: `Method not found: ${method}` })
  }
}
