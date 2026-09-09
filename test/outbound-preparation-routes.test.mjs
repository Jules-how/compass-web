import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const context = { params: Promise.resolve({ id: 'cell' }) }
function http() {
  return {
    portalJson: (body, init = {}) => new Response(JSON.stringify(body), init),
    portalAccessResponse: (e) =>
      e.message === 'unauthorized'
        ? new Response('unauthorized', { status: 401 })
        : null,
    readBoundedJson: (request) => request.json(),
    requireSameOrigin: (request) =>
      request.headers.get('origin') === new URL(request.url).origin
        ? null
        : new Response('forbidden', { status: 403 })
  }
}
function route(access) {
  let adminCalls = 0
  const calls = []
  const human = { human: true }
  const admin = { worker: true }
  const mod = loadTypescript(
    'src/app/api/operator/outbound/preparation/[id]/route.ts',
    {
      '@/lib/portal-access': {
        requirePortalAccess: async (options) => {
          assert.deepEqual(options, { operator: true })
          if (!access) throw new Error('unauthorized')
          return { supabase: human }
        }
      },
      '@/lib/portal-admin': {
        getPortalAdminClient: () => {
          adminCalls++
          return admin
        }
      },
      '@/lib/portal-http': http(),
      '@/lib/outbound-preparation-server': {
        getPreparationState: async (db, id) => {
          assert.equal(db, human)
          return { id }
        }
      },
      '@/lib/outbound-preparation-command': {
        executePreparationCommand: async (...args) => {
          calls.push(args)
          return { ok: true }
        }
      }
    }
  )
  return {
    ...mod,
    calls,
    human,
    admin,
    get adminCalls() {
      return adminCalls
    }
  }
}
function req(origin = 'https://compass.test') {
  return new Request(
    'https://compass.test/api/operator/outbound/preparation/cell',
    {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' })
    }
  )
}
test('operator route rejects cross-origin and unauthenticated writes before requesting the service client', async () => {
  const r = route(false)
  assert.equal((await r.POST(req('https://other.test'), context)).status, 403)
  assert.equal((await r.POST(req(), context)).status, 401)
  assert.equal(r.adminCalls, 0)
})
test('operator route passes human database session separately for approval', async () => {
  const r = route(true)
  assert.equal((await r.POST(req(), context)).status, 200)
  assert.equal(r.calls.length, 1)
  assert.equal(r.calls[0][0], r.admin)
  assert.equal(r.calls[0][3], r.human)
})
test('operator reads use its RLS client and do not request a service client', async () => {
  const r = route(true)
  assert.equal(
    (await r.GET(new Request('https://compass.test'), context)).status,
    200
  )
  assert.equal(r.adminCalls, 0)
})
test('worker command cannot grant human approval', async () => {
  let approved = false
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { bundle: { context: { campaign_id: 'cell' } } },
            error: null
          })
        })
      })
    }),
    rpc: () => {
      approved = true
    }
  }
  const commands = loadTypescript('src/lib/outbound-preparation-command.ts', {
    './outbound-preparation-server': {}
  })
  await assert.rejects(
    commands.executePreparationCommand(db, 'cell', {
      action: 'approve',
      preparation_id: 'prep',
      hash: 'a'.repeat(64)
    }),
    /requires_operator_session/
  )
  assert.equal(approved, false)
})
test('agent route authenticates before creating the service client and never supplies an operator session', async () => {
  let authorized = false
  let adminCalls = 0
  let args
  const route = loadTypescript(
    'src/app/api/agent/outbound/preparation/route.ts',
    {
      '@/lib/agent-auth': {
        requireAgentAuth: () =>
          authorized ? null : new Response('unauthorized', { status: 401 })
      },
      '@/lib/portal-admin': {
        getPortalAdminClient: () => {
          adminCalls++
          return { worker: true }
        }
      },
      '@/lib/portal-http': http(),
      '@/lib/outbound-preparation-server': {},
      '@/lib/outbound-preparation-command': {
        executePreparationCommand: async (...input) => {
          args = input
          return { ok: true }
        }
      }
    }
  )
  const request = () =>
    new Request(
      'https://compass.test/api/agent/outbound/preparation?campaign_id=cell',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"action":"claim","run_id":"run"}'
      }
    )
  assert.equal((await route.POST(request())).status, 401)
  assert.equal(adminCalls, 0)
  authorized = true
  assert.equal((await route.POST(request())).status, 200)
  assert.equal(args.length, 3)
})

test('CSV export rechecks the remote pause state after an earlier reservation', async () => {
  const { fixture } = await import('./helpers/outbound-fixture.mjs')
  const f = fixture()
  const bundle = { context: f.context, hash: 'a'.repeat(64) }
  let reserved = false
  const records = {
    compass_pipeline_campaigns: {
      id: 'test-cell',
      offer_key: 'installation-booking',
      status: 'planned',
      vertical_tags: ['hvac'],
      location_tags: ['sydney'],
      sequence_draft: f.context.sequence,
      instantly_campaign_id: 'instant'
    },
    compass_outbound_offers: f.context.offer,
    compass_outbound_configs: {
      recipe: f.context.recipe,
      settings: f.context.settings
    },
    compass_outbound_approvals: { hash: bundle.hash },
    compass_outbound_loads: { preparation_id: 'prep' }
  }
  const db = {
    rpc: async (name) => {
      if (name === 'outbound_reserve_load') reserved = true
      return { data: bundle, error: null }
    },
    from(table) {
      const q = {
        select() {
          return q
        },
        eq() {
          return q
        },
        single: async () => ({ data: records[table], error: null }),
        maybeSingle: async () => ({ data: records[table], error: null })
      }
      return q
    }
  }
  const server = loadTypescript('src/lib/outbound-preparation-server.ts', {
    './instantly': { resolveInstantlyApiKey: async () => 'test' },
    './instantly-write': { instantlyGetCampaign: async () => ({ status: 1 }) }
  })
  await assert.rejects(
    server.preparationExport(db, 'prep'),
    /campaign_must_be_paused/
  )
  assert.equal(reserved, false)
})

test('import actions explain missing approval and reservation before platform access', async () => {
  const { fixture } = await import('./helpers/outbound-fixture.mjs')
  const f = fixture()
  const bundle = { context: f.context, hash: 'a'.repeat(64) }
  const records = {
    compass_pipeline_campaigns: {
      id: 'test-cell', offer_key: 'installation-booking', status: 'planned',
      vertical_tags: ['hvac'], location_tags: ['sydney'],
      sequence_draft: f.context.sequence, instantly_campaign_id: 'instant'
    },
    compass_outbound_offers: f.context.offer,
    compass_outbound_configs: { recipe: f.context.recipe, settings: f.context.settings },
    compass_outbound_approvals: null,
    compass_outbound_loads: null
  }
  const db = {
    rpc: async (name) => {
      assert.equal(name, 'outbound_check_preparation')
      return { data: bundle, error: null }
    },
    from(table) {
      const q = {
        select() { return q }, eq() { return q },
        single: async () => ({ data: records[table], error: null }),
        maybeSingle: async () => ({ data: records[table], error: null })
      }
      return q
    }
  }
  const server = loadTypescript('src/lib/outbound-preparation-server.ts', {
    './instantly': { resolveInstantlyApiKey: async () => assert.fail('premature platform access') },
    './instantly-write': {}
  })
  for (const action of ['preparationExport', 'reserveBrowserLoad', 'reconcileBrowserLoad']) {
    await assert.rejects(server[action](db, 'prep'), /human_approval_required/)
  }
  records.compass_outbound_approvals = { hash: bundle.hash }
  for (const action of ['preparationExport', 'reconcileBrowserLoad']) {
    await assert.rejects(server[action](db, 'prep'), /check_paused_campaign_first/)
  }
})
