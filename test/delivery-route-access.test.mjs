import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'

test('delivery routes reject unauthenticated callers before any privileged data access', async t => {
  const env = {
    COMPASS_DELIVERY_WORKER_SECRET: 'fixture-worker-secret-with-32-characters',
    COMPASS_DELIVERY_PUBLIC_ORIGIN: 'https://compass.example.test',
    TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'fixture-token'
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => { for (const [key,value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  } })
  class PortalAccessError extends Error { kind = 'unauthorized' }
  let privilegedReads = 0
  const stubs = {
    '@/lib/portal-access': {
      PortalAccessError,
      requirePortalAccess: async ({ operator }) => { assert.equal(operator, true); throw new PortalAccessError() }
    },
    './portal-access': { PortalAccessError },
    '@/lib/portal-admin': { getPortalAdminClient: () => { privilegedReads++; throw Error('Privileged access before authentication') } }
  }
  for (const [path, status, headers] of [
    ['', 401, { origin: env.COMPASS_DELIVERY_PUBLIC_ORIGIN }],
    ['/accounts', 401, { origin: env.COMPASS_DELIVERY_PUBLIC_ORIGIN }],
    ['/intake', 401, {}],
    ['/worker', 401, { authorization: 'Bearer incorrect-token' }],
    ['/webhooks/twilio', 403, { 'content-type': 'application/x-www-form-urlencoded' }],
    ['/webhooks/twilio/status', 403, { 'content-type': 'application/x-www-form-urlencoded' }]
  ]) {
    const route = loadTypescript(`src/app/api/delivery-engine${path}/route.ts`, stubs)
    const result = await route.POST(new Request(`${env.COMPASS_DELIVERY_PUBLIC_ORIGIN}/api/delivery-engine${path}`, { method: 'POST', headers, body: '{}' }))
    assert.equal(result.status, status, path || 'operator commands')
    if (path === '' || path === '/accounts') {
      const crossOrigin = await route.POST(new Request(`${env.COMPASS_DELIVERY_PUBLIC_ORIGIN}/api/delivery-engine${path}`, { method: 'POST', headers: { origin: 'https://outside.example.test' }, body: '{}' }))
      assert.equal(crossOrigin.status, 403)
    }
    if (path === '') assert.equal((await route.GET(new Request(`${env.COMPASS_DELIVERY_PUBLIC_ORIGIN}/api/delivery-engine`))).status, 401)
  }
  assert.equal(privilegedReads, 0)
})
