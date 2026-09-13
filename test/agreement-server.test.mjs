import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'
import { createHmac } from 'node:crypto'
const tables = new Map()
class Query {
  constructor(table) {
    this.table = table
    this.filters = []
    this.operation = 'select'
    this.one = false
  }
  select() {
    return this
  }
  eq(k, v) {
    this.filters.push((r) => r[k] === v)
    return this
  }
  like(k, v) {
    this.filters.push((r) => r[k]?.startsWith(v.slice(0, -1)))
    return this
  }
  order() {
    return this
  }
  limit() {
    return this
  }
  maybeSingle() {
    this.one = true
    return this
  }
  insert(row) {
    this.operation = 'insert'
    this.row = row
    return this
  }
  upsert(row, opts) {
    this.operation = 'upsert'
    this.row = row
    this.ignore = opts?.ignoreDuplicates
    return this
  }
  update(row) {
    this.operation = 'update'
    this.row = row
    return this
  }
  then(resolve, reject) {
    try {
      let map = tables.get(this.table)
      if (!map) {
        map = new Map()
        tables.set(this.table, map)
      }
      let rows = [...map.values()].filter((r) =>
        this.filters.every((f) => f(r)),
      )
      if (this.operation === 'insert') {
        if (map.has(this.row.id))
          return Promise.resolve({
            data: null,
            error: { message: 'duplicate' },
          }).then(resolve, reject)
        map.set(this.row.id, { ...this.row })
        rows = [this.row]
      }
      if (this.operation === 'upsert') {
        if (!map.has(this.row.id) || !this.ignore)
          map.set(this.row.id, { ...this.row })
        rows = [map.get(this.row.id)]
      }
      if (this.operation === 'update') {
        rows = rows.map((r) => ({ ...r, ...this.row }))
        for (const r of rows) map.set(r.id, r)
      }
      return Promise.resolve({
        data: this.one ? rows[0] || null : rows,
        error: null,
      }).then(resolve, reject)
    } catch (e) {
      return Promise.reject(e).then(resolve, reject)
    }
  }
}
globalThis.agreementTestDb = { from: (t) => new Query(t) }
process.env.COMPASS_AGENT_SECRET = 'test-only-agreement-secret-not-a-live-key'
process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture'
let source = fs
  .readFileSync(
    new URL('../src/lib/agreement-server.ts', import.meta.url),
    'utf8',
  )
  .replace("import 'server-only'", '')
  .replace(
    "import { getPortalAdminClient } from '@/lib/portal-admin'",
    'const getPortalAdminClient=()=>globalThis.agreementTestDb',
  )
  .replace(
    "import { appendEvidence } from '@/lib/events'",
    'const appendEvidence=async()=>({inserted:true,id:"test-event"})',
  )
  .replace(
    "'@/lib/agreements.mjs'",
    JSON.stringify(
      pathToFileURL(
        new URL('../src/lib/agreements.mjs', import.meta.url).pathname,
      ).href,
    ),
  )
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText
const api = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
)
const { agreementDefaults } = await import('../src/lib/agreements.mjs')
const valid = () => ({
  ...agreementDefaults('Example test business'),
  clientEmail: 'signer@example.com',
  setupAud: 1500,
  enquiryStream: 'Installation form',
  startDate: '2026-09-10',
  cancellation: 'Monthly rolling with seven days notice.',
  bankInstructions: 'TEST fixture, not a real account',
  termsReviewed: true,
})
const attribution = () => ({
  offerId: 'offer-installation-booking',
  offerKey: 'installation-booking',
  offerName: 'Ads + booking',
  revision: {
    id: 'offer-revision-fixture',
    offer_id: 'offer-installation-booking',
    version_no: 3,
    version_label: 'v3',
    snapshot_scope: 'full',
    snapshot: {
      offer_key: 'installation-booking',
      name: 'Ads + booking',
      lock: { icp: 'Australian AC installers' }
    },
    content_hash: 'fixture-hash',
    change_reason: 'Fixture',
    source: 'test',
    supersedes_revision_id: null,
    created_by: 'test',
    created_at: '2026-09-10T00:00:00Z'
  }
})
test('encrypted persistence, unforgeable token, immutable acceptance and idempotent task creation', async () => {
  const r = await api.createAgreement('client-fixture', valid(), attribution())
  const stored = tables.get('compass_settings').get(r.id)
  assert.equal(stored.value.includes('signer@example.com'), false)
  const token = api.signingToken(r.id)
  assert.equal((await api.getAgreementByToken(token)).document, r.document)
  await assert.rejects(() => api.getAgreementByToken(token + 'x'))
  const signed = await api.acceptAgreement(
    r,
    {
      name: 'Test Signer',
      email: 'signer@example.com',
      consent: true,
      documentHash: r.documentHash,
    },
    new Request('https://example.com'),
  )
  assert.equal(signed.status, 'signed')
  assert.equal(signed.payment.status, 'pending')
  assert.equal(signed.offerRevisionId, 'offer-revision-fixture')
  await assert.rejects(
    () =>
      api.acceptAgreement(
        r,
        {
          name: 'Test Signer',
          email: 'signer@example.com',
          consent: true,
          documentHash: r.documentHash,
        },
        new Request('https://example.com'),
      ),
    /updated elsewhere/,
  )
  await api.ensureSigningTasks(signed)
  await api.ensureSigningTasks(signed)
  assert.equal(tables.get('compass_projects').size, 1)
  assert.equal(tables.get('compass_tasks').size, 4)
  assert.equal(tables.get('compass_client_engagements').size, 1)
  const publicData = api.publicAgreement(signed)
  assert.equal(publicData.signature.ip, undefined)
  const paid = await api.confirmBankPayment(signed, 'fixture-bank-ref')
  assert.equal(paid.payment.status, 'paid')
  assert.equal(paid.documentHash, r.documentHash)
})
test('signatory mismatch and missing consent do not accept an agreement', async () => {
  const r = await api.createAgreement('other-client', valid(), attribution())
  await assert.rejects(() =>
    api.acceptAgreement(
      r,
      {
        name: 'Wrong Person',
        email: 'wrong@example.com',
        consent: true,
        documentHash: r.documentHash,
      },
      new Request('https://example.com'),
    ),
  )
  assert.equal((await api.getAgreement(r.id)).status, 'issued')
})
test('webhook authentication rejects tampering and stale events', () => {
  const body = JSON.stringify({ type: 'test' })
  const t = Math.floor(Date.now() / 1000)
  const h = createHmac('sha256', 'whsec_fixture')
    .update(t + '.' + body)
    .digest('hex')
  assert.equal(api.verifyStripeEvent(body, `t=${t},v1=${h}`).type, 'test')
  assert.throws(() => api.verifyStripeEvent(body + ' ', `t=${t},v1=${h}`))
  assert.throws(() => api.verifyStripeEvent(body, `t=${t - 600},v1=${h}`))
})
test('checkout cannot start before signing and retries use the persisted session', async () => {
  let calls = 0
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls++
    if (init.method === 'POST')
      return Response.json({
        id: 'cs_fixture',
        url: 'https://checkout.stripe.com/test',
        status: 'open',
      })
    return Response.json({
      id: 'cs_fixture',
      url: 'https://checkout.stripe.com/test',
      status: 'open',
    })
  }
  try {
    const r = await api.createAgreement('card-client', {
      ...valid(),
      paymentMethod: 'stripe',
    }, attribution())
    await assert.rejects(() => api.beginCheckout(r, 'https://example.com'))
    const signed = await api.acceptAgreement(
      r,
      {
        name: 'Test Signer',
        email: 'signer@example.com',
        consent: true,
        documentHash: r.documentHash,
      },
      new Request('https://example.com'),
    )
    assert.equal(
      await api.beginCheckout(signed, 'https://example.com'),
      'https://checkout.stripe.com/test',
    )
    const current = await api.getAgreement(r.id)
    assert.equal(
      await api.beginCheckout(current, 'https://example.com'),
      'https://checkout.stripe.com/test',
    )
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = oldFetch
  }
})
