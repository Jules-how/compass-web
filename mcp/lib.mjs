/**
 * Lean Compass agent MCP. Search/commit leads, ledger, export, campaign land.
 * No Instantly clone, no ads, no library dump, no Instantly activate.
 */

export const SERVER_NAME = 'compass'
export const SERVER_VERSION = '0.2.0'
export const PROTOCOL_VERSION = '2024-11-05'

const DEFAULT_BASE = 'https://compass-web-eosin.vercel.app'
const MAX_LIMIT = 100
const SEARCH_MAX_LIMIT = 5000
const DEFAULT_LIMIT = 50
const EXPORT_MAX_LIMIT = 200
const SEARCH_DEFAULT_LIMIT = 2000

export const TOOLS = [
  {
    name: 'pathfinder',
    description: 'Read approved outcomes, supporting canonical work, outcome evidence and persistent findings. Optional goal_id narrows the context. Use before daily planning; missing capacity remains unknown.',
    inputSchema: {type:'object',properties:{goal_id:{type:'string'}},additionalProperties:false}
  },
  {
    name: 'pathfinder.review',
    description: 'Record or revise the same goal-linked finding using a stable issue_key and current revision (0 on create). Preserves task identity and history. No task creation, spending or external actions.',
    inputSchema: {type:'object',required:['goal_id','issue_key','revision','title','symptom','next_action','source'],properties:{
      goal_id:{type:'string'},issue_key:{type:'string'},revision:{type:'integer'},title:{type:'string'},symptom:{type:'string'},hypothesis:{type:'string'},alternatives:{type:'string'},next_action:{type:'string'},expected_benefit:{type:'string'},effort_minutes:{type:['integer','null']},uncertainty:{type:'string'},prerequisites:{type:'string'},opportunity_cost:{type:'string'},review_on:{type:['string','null']},source:{type:'string'},evidence_ids:{type:'array',items:{type:'string'}},status:{type:'string',enum:['open','watching','resolved','dismissed']}
    },additionalProperties:false}
  },
  {
    name: 'outbound.overview',
    description: 'Shared Outbound screen truth: observed campaign status with freshness, preparation, recorded yesterday/today activity and source-backed next-action proposals. Use this for what is live and what to do next. Refresh never sends or activates.',
    inputSchema: { type: 'object', properties: { fresh: { type: 'boolean' } }, additionalProperties: false }
  },
  {
    name: 'operating',
    description: 'Read the shared operating day, accepted order, alternatives, contextual tasks, goals, preparations and source coverage.',
    inputSchema: { type: 'object', properties: { day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, additionalProperties: false }
  },
  {
    name: 'operating.write',
    description: 'Idempotent revision-checked contextual task/project and source/preparation/capture writeback. Pass the full operating command. Agents cannot complete tasks, accept a day or change accepted dates. Inferred work remains proposed.',
    inputSchema: { type: 'object', required: ['command'], properties: { command: { type: 'object', additionalProperties: true } }, additionalProperties: false }
  },
  {
    name: 'brief',
    description:
      'Compact daily brief plus currentWave (trade, cluster, remaining). Cached unless fresh=true. Start here. Live targeting is Compass, not markdown.',
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
      'Deprecated alias. inventory = counts. cohort = harvest rows (campaignId required). Prefer leads.search.',
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
    name: 'leads.search',
    description:
      'Filter lead_contacts. view=rows (keyset, default 2000 max 5000) or counts. pipeline_campaign_id=none for unattached. columns=lean|cohort|full. Never activates Instantly.',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['rows', 'counts'] },
        q: { type: 'string' },
        vertical: { type: 'string' },
        state: { type: 'string' },
        city: { type: 'string' },
        cohort_tag: { type: 'string' },
        source: { type: 'string' },
        outbound_status: { type: 'string', description: 'CSV ok' },
        sync_state: { type: 'string' },
        pipeline_campaign_id: { type: 'string', description: 'id or none' },
        instantly_campaign_id: { type: 'string' },
        enrich_status: { type: 'string' },
        icp_status: { type: 'string' },
        email_origin: { type: 'string' },
        after_hours: { type: 'string', enum: ['0', '1'] },
        min_reviews: { type: 'string' },
        unverified_only: { type: 'boolean' },
        recontact_ready: { type: 'string', enum: ['0', '1'] },
        bucket: { type: 'string', enum: ['leads', 'prospects', 'archived'] },
        completeness: { type: 'string' },
        columns: { type: 'string', enum: ['lean', 'cohort', 'full'] },
        cursor: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: SEARCH_MAX_LIMIT }
      },
      additionalProperties: false
    }
  },
  {
    name: 'leads.commit',
    description:
      'Bulk upsert lead_contacts. Email match updates; company domain/name+city is company_dupe (no insert). Never invents email. Never activates Instantly.',
    inputSchema: {
      type: 'object',
      required: ['rows'],
      properties: {
        defaults: { type: 'object' },
        rows: { type: 'array', items: { type: 'object' } },
        on_conflict: { type: 'string', enum: ['email'] },
        mark: { type: 'object' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'mark',
    description:
      'Deprecated alias of PATCH /api/agent/leads/mark. Prefer leads.commit. Bulk ids/emails (max 500) or rows[] (max 50).',
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
  },
  {
    name: 'commit',
    description:
      'Insert lead rows through Compass (email, company, domain dupe). POST /api/agent/leads. Max 200. Never PostgREST.',
    inputSchema: {
      type: 'object',
      required: ['vertical', 'rows'],
      properties: {
        vertical: { type: 'string', description: 'Required. Alias broker → mortgage-brokers.' },
        sourceService: { type: 'string', description: 'apify | origami | vibe | manual | other. Default other.' },
        import_batch_id: { type: 'string' },
        filename: { type: 'string' },
        rows: { type: 'array', items: { type: 'object' }, description: 'Mapped or CSV-shaped rows. Max 200.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'ledger',
    description:
      'Vertical ledger: outbound_status, state, last_outbound buckets, top campaign names. Optional campaign_ids vs later_campaign_ids overlap. Compact counts only.',
    inputSchema: {
      type: 'object',
      required: ['vertical'],
      properties: {
        vertical: { type: 'string', description: 'Required. Alias broker → mortgage-brokers.' },
        campaign_ids: { type: 'string', description: 'Comma list of older Instantly campaign ids.' },
        later_campaign_ids: { type: 'string', description: 'Comma list of later Instantly campaign ids.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'export',
    description:
      'One page of lead export (max 200). Email required. Agent pages to a local CSV. Never dump the table in chat.',
    inputSchema: {
      type: 'object',
      required: ['vertical'],
      properties: {
        vertical: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: EXPORT_MAX_LIMIT },
        cursor: { type: 'string', description: 'Last id from the previous page.' }
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

export function clampExportLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return DEFAULT_LIMIT
  return Math.min(EXPORT_MAX_LIMIT, Math.max(1, Math.trunc(v)))
}

export function clampSearchLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return SEARCH_DEFAULT_LIMIT
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(v)))
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
    case 'pathfinder': {
      const path='/api/agent/pathfinder'+(args.goal_id?'?goal_id='+encodeURIComponent(args.goal_id):'');
      const r=await compassFetch(cfg,{method:'GET',path,fetchImpl});
      return r.status>=400?toolError(JSON.stringify(r.json)):toolOk(r.json);
    }
    case 'pathfinder.review': {
      const r=await compassFetch(cfg,{method:'POST',path:'/api/agent/pathfinder',body:{...args,action:'review'},fetchImpl});
      return r.status>=400?toolError(JSON.stringify(r.json)):toolOk(r.json);
    }
    case 'outbound.overview': {
      const r = await compassFetch(cfg, { method: 'GET', path: '/api/agent/outbound/overview', headers: args.fresh === true ? { 'x-compass-fresh': '1' } : {}, fetchImpl });
      return r.status >= 400 ? toolError(JSON.stringify(r.json)) : toolOk(r.json);
    }
    case 'operating': {
      const r = await compassFetch(cfg, { method: 'GET', path: '/api/agent/operating' + (args.day ? '?day=' + encodeURIComponent(args.day) : ''), fetchImpl });
      return r.status >= 400 ? toolError(JSON.stringify(r.json)) : toolOk(r.json);
    }
    case 'operating.write': {
      if (!args.command || typeof args.command !== 'object' || Array.isArray(args.command)) return toolError('command must be an object');
      const r = await compassFetch(cfg, { method: 'POST', path: '/api/agent/operating', body: args.command, fetchImpl });
      return r.status >= 400 ? toolError(JSON.stringify(r.json)) : toolOk(r.json);
    }
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
    case 'leads.search': {
      const view = args.view === 'counts' ? 'counts' : 'rows'
      const r = await compassFetch(cfg, {
        method: 'GET',
        path: '/api/agent/leads',
        query: {
          view,
          q: args.q,
          vertical: args.vertical,
          state: args.state,
          city: args.city,
          cohort_tag: args.cohort_tag,
          source: args.source,
          outbound_status: args.outbound_status,
          sync_state: args.sync_state,
          pipeline_campaign_id: args.pipeline_campaign_id,
          instantly_campaign_id: args.instantly_campaign_id,
          enrich_status: args.enrich_status,
          icp_status: args.icp_status,
          email_origin: args.email_origin,
          after_hours: args.after_hours,
          min_reviews: args.min_reviews,
          unverified_only: args.unverified_only === true ? '1' : undefined,
          recontact_ready: args.recontact_ready,
          bucket: args.bucket,
          completeness: args.completeness,
          columns: args.columns,
          cursor: args.cursor,
          limit: args.limit != null ? String(clampSearchLimit(args.limit)) : undefined
        },
        fetchImpl
      })
      return toolOk(r.json)
    }
    case 'leads.commit': {
      const rows = Array.isArray(args.rows) ? args.rows : []
      if (!rows.length) return toolError('leads.commit requires rows')
      const r = await compassFetch(cfg, {
        method: 'POST',
        path: '/api/agent/leads',
        body: {
          defaults: args.defaults && typeof args.defaults === 'object' ? args.defaults : undefined,
          rows,
          on_conflict: args.on_conflict || 'email',
          mark: args.mark && typeof args.mark === 'object' ? args.mark : undefined
        },
        fetchImpl
      })
      return toolOk(r.json)
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
    case 'commit': {
      const rows = Array.isArray(args.rows) ? args.rows : []
      if (!rows.length) return toolError('commit requires rows')
      const vertical = typeof args.vertical === 'string' ? args.vertical.trim() : ''
      if (!vertical) return toolError('commit requires vertical')
      const r = await compassFetch(cfg, {
        method: 'POST',
        path: '/api/agent/leads',
        body: {
          defaults: {
            vertical,
            source: typeof args.sourceService === 'string' ? args.sourceService : 'other'
          },
          rows,
          on_conflict: 'email'
        },
        fetchImpl
      })
      return toolOk(r.json)
    }
    case 'ledger': {
      const vertical = typeof args.vertical === 'string' ? args.vertical.trim() : ''
      if (!vertical) return toolError('ledger requires vertical')
      const r = await compassFetch(cfg, {
        method: 'GET',
        path: '/api/agent/leads/ledger',
        query: {
          vertical,
          campaign_ids: args.campaign_ids || undefined,
          later_campaign_ids: args.later_campaign_ids || undefined
        },
        fetchImpl
      })
      return toolOk(r.json)
    }
    case 'export': {
      const vertical = typeof args.vertical === 'string' ? args.vertical.trim() : ''
      if (!vertical) return toolError('export requires vertical')
      const r = await compassFetch(cfg, {
        method: 'GET',
        path: '/api/agent/leads/export',
        query: {
          vertical,
          limit: String(clampExportLimit(args.limit)),
          cursor: args.cursor || undefined
        },
        fetchImpl
      })
      return toolOk(r.json)
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
