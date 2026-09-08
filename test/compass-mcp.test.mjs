import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { callTool, clampExportLimit, clampLimit, handleRpc, parseEnvFile, resolveConfig, TOOLS } from '../mcp/lib.mjs'

for (const framed of [false, true]) {
  test(`stdio handshake and tool discovery (${framed ? 'legacy framing' : 'MCP newlines'})`, { timeout: 5000 }, async (t) => {
    const child = spawn(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), '../mcp/server.mjs')], {
      env: { ...process.env, COMPASS_AGENT_SECRET: 'transport-test-only' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    t.after(() => child.kill())
    const output = []
    child.stdout.on('data', chunk => output.push(chunk))
    const completed = new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`server exit ${code}`)))
    })
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'Migration — test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    ]
    const input = Buffer.from(requests.map(request => {
      const json = JSON.stringify(request)
      return framed ? `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}` : `${json}\n`
    }).join(''))
    // Exercise partial messages and EOF without any network calls or live secrets.
    for (let i = 0; i < input.length; i += 7) child.stdin.write(input.subarray(i, i + 7))
    child.stdin.end()
    await completed
    let remaining = Buffer.concat(output)
    const responses = []
    if (framed) {
      while (remaining.length) {
        const end = remaining.indexOf('\r\n\r\n')
        assert.ok(end > 0)
        const length = Number(/Content-Length: (\d+)/.exec(remaining.subarray(0, end).toString())[1])
        responses.push(JSON.parse(remaining.subarray(end + 4, end + 4 + length).toString()))
        remaining = remaining.subarray(end + 4 + length)
      }
    } else {
      responses.push(...remaining.toString().trim().split('\n').map(line => JSON.parse(line)))
    }
    assert.equal(responses.length, 2, 'notifications must not produce a response')
    assert.equal(responses.find(r => r.id === 1).result.protocolVersion, '2024-11-05')
    assert.equal(responses.find(r => r.id === 2).result.tools.length, TOOLS.length)
  })
}

test('search, commit, ledger, and export tools', () => {
  assert.deepEqual(
    TOOLS.map((t) => t.name),
    [
      'brief',
      'campaigns',
      'leads',
      'leads.search',
      'leads.commit',
      'mark',
      'copy',
      'land',
      'commit',
      'ledger',
      'export'
    ]
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

test('clampExportLimit caps at 200', () => {
  assert.equal(clampExportLimit(50000), 200)
  assert.equal(clampExportLimit(0), 1)
})

test('resolveConfig fills from compass-web env file when process env is empty', () => {
  const cfg = resolveConfig(
    {},
    [{ COMPASS_AGENT_SECRET: 'from-file', COMPASS_BASE_URL: '' }]
  )
  assert.equal(cfg.secret, 'from-file')
  assert.equal(cfg.baseUrl, 'https://compass-web-eosin.vercel.app')
})

test('mcp server loads this repo compass-web/.env.local first', () => {
  const server = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../mcp/server.mjs'), 'utf8')
  assert.match(server, /join\(MCP_DIR, '\.\.\/\.env\.local'\)/)
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
  assert.equal(res.result.tools.length, 11)
})

test('leads.search hits unified GET', async () => {
  const capture = {}
  await callTool(
    'leads.search',
    { view: 'rows', pipeline_campaign_id: 'none', columns: 'cohort', limit: 2000 },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  const u = new URL(capture.url)
  assert.match(u.pathname, /\/api\/agent\/leads$/)
  assert.equal(u.searchParams.get('view'), 'rows')
  assert.equal(u.searchParams.get('pipeline_campaign_id'), 'none')
  assert.equal(u.searchParams.get('columns'), 'cohort')
})

test('leads.commit posts rows', async () => {
  const capture = {}
  await callTool(
    'leads.commit',
    { rows: [{ email: 'a@b.c', company: 'Acme' }], on_conflict: 'email' },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  assert.equal(capture.method, 'POST')
  assert.match(capture.url, /\/api\/agent\/leads$/)
  assert.deepEqual(JSON.parse(capture.body).rows[0].company, 'Acme')
})

test('rpc ignores notifications', async () => {
  const res = await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { cfg })
  assert.equal(res, null)
})

test('ledger requires vertical', async () => {
  const r = await callTool('ledger', {}, { cfg, fetchImpl: mockFetch({}) })
  assert.equal(r.isError, true)
})

test('ledger query includes overlap ids', async () => {
  const capture = {}
  await callTool(
    'ledger',
    { vertical: 'broker', campaign_ids: 'a,b', later_campaign_ids: 'c' },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  const u = new URL(capture.url)
  assert.match(capture.url, /\/api\/agent\/leads\/ledger/)
  assert.equal(u.searchParams.get('vertical'), 'broker')
  assert.equal(u.searchParams.get('campaign_ids'), 'a,b')
  assert.equal(u.searchParams.get('later_campaign_ids'), 'c')
})

test('export pages with cursor', async () => {
  const capture = {}
  await callTool(
    'export',
    { vertical: 'broker', limit: 200, cursor: 'contact-1' },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  const u = new URL(capture.url)
  assert.match(capture.url, /\/api\/agent\/leads\/export/)
  assert.equal(u.searchParams.get('limit'), '200')
  assert.equal(u.searchParams.get('cursor'), 'contact-1')
})

test('commit posts rows', async () => {
  const capture = {}
  await callTool(
    'commit',
    { vertical: 'mortgage-brokers', import_batch_id: 'agent-path-smoke', rows: [{ email: 'a@x.com', company: 'Acme' }] },
    { cfg, fetchImpl: mockFetch(capture) }
  )
  assert.equal(capture.method, 'POST')
  assert.match(capture.url, /\/api\/agent\/leads$/)
  assert.deepEqual(JSON.parse(capture.body), {
    defaults: { vertical: 'mortgage-brokers', source: 'other' },
    rows: [{ email: 'a@x.com', company: 'Acme' }],
    on_conflict: 'email'
  })
})
