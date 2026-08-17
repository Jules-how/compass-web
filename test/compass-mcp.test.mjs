import assert from 'node:assert/strict'
import test from 'node:test'
import { callTool, clampLimit, handleRpc, parseEnvFile, resolveConfig, TOOLS } from '../mcp/lib.mjs'

test('exactly six tools', () => {
  assert.equal(TOOLS.length, 6)
  assert.deepEqual(
    TOOLS.map((t) => t.name),
    ['brief', 'campaigns', 'leads', 'mark', 'copy', 'land']
  )
})

test('parseEnvFile ignores comments and export', () => {
  const map = parseEnvFile('# x\nexport COMPASS_AGENT_SECRET=abc\nCOMPASS_BASE_URL="https://x.test"\n')
  assert.equal(map.COMPASS_AGENT_SECRET, 'abc')
  assert.equal(map.COMPASS_BASE_URL, 'https://x.test')
})

test('resolveConfig prefers process env', () => {
  const cfg = resolveConfig(
    { COMPASS_AGENT_SECRET: 'from-env', COMPASS_BASE_URL: 'https://prod.test' },
    [{ COMPASS_AGENT_SECRET: 'from-file' }]
  )
  assert.equal(cfg.secret, 'from-env')
  assert.equal(cfg.baseUrl, 'https://prod.test')
})

test('clampLimit caps at 100', () => {
  assert.equal(clampLimit(500), 100)
  assert.equal(clampLimit(0), 1)
})

function mockFetch(capture) {
  return async (url, init) => {
    capture.url = String(url)
    capture.method = init.method
    capture.headers = init.headers
    capture.body = init.body
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true })
    }
  }
}

const cfg = { baseUrl: 'https://compass.test', secret: 's' }

test('brief fresh sets header', async () => {
  const capture = {}
  await callTool('brief', { fresh: true }, { cfg, fetchImpl: mockFetch(capture) })
  assert.match(capture.url, /\/api\/agent\/brief$/)
  assert.equal(capture.headers['x-compass-fresh'], '1')
})

test('leads cohort requires campaignId', async () => {
  const r = await callTool('leads', { view: 'cohort' }, { cfg, fetchImpl: mockFetch({}) })
  assert.equal(r.isError, true)
})

test('leads cohort query', async () => {
  const capture = {}
  await callTool(
    'leads',
    { view: 'cohort', campaignId: 'c1', unverified_only: true, limit: 20 },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  const u = new URL(capture.url)
  assert.equal(u.searchParams.get('pipeline_campaign_id'), 'c1')
  assert.equal(u.searchParams.get('unverified_only'), '1')
  assert.equal(u.searchParams.get('limit'), '20')
})

test('push_leads defaults dryRun true', async () => {
  const capture = {}
  await callTool('land', { campaignId: 'c1', action: 'push_leads' }, { cfg, fetchImpl: mockFetch(capture) })
  assert.equal(capture.method, 'POST')
  assert.match(capture.url, /push-leads$/)
  assert.deepEqual(JSON.parse(capture.body), { campaignId: 'c1', dryRun: true })
})

test('push_leads dryRun false lands', async () => {
  const capture = {}
  await callTool(
    'land',
    { campaignId: 'c1', action: 'push_leads', dryRun: false },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  assert.deepEqual(JSON.parse(capture.body), { campaignId: 'c1', dryRun: false })
})

test('copy patch sends Prefer minimal', async () => {
  const capture = {}
  await callTool(
    'copy',
    { campaignId: 'c1', action: 'patch', patch: { opener_reviewed_at: true } },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  assert.equal(capture.method, 'PATCH')
  assert.equal(capture.headers.Prefer, 'return=minimal')
})

test('rpc tools/list', async () => {
  const res = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { cfg, fetchImpl: mockFetch({}) })
  assert.equal(res.result.tools.length, 6)
})

test('rpc ignores notifications', async () => {
  const res = await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { cfg })
  assert.equal(res, null)
})
