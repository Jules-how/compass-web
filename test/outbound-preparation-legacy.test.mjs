import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const ErrorType = class extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}
function production(writer = {}) {
  return loadTypescript('src/lib/instantly-push.ts', {
    '@/lib/instantly': { InstantlyApiError: ErrorType },
    '@/lib/instantly-write': {
      instantlyGetCampaign: async () => ({ status: 0 }),
      ...writer
    }
  })
}
function fakeLedger(count) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: 'lead-' + i,
    email: 'lead' + i + '@example.test',
    company: 'Example ' + i,
    name: '',
    opener: 'Saw Example ' + i + '.',
    outbound_status: 'uncontacted'
  }))
  const receipts = []
  const db = {
    from(table) {
      if (table === 'compass_pipeline_activity')
        return { insert: async () => ({ error: null }) }
      let patch = null,
        id = null
      const query = {
        select() {
          return query
        },
        eq(column, value) {
          if (column === 'id') id = value
          return query
        },
        order() {
          return query
        },
        limit() {
          return query
        },
        in() {
          return query
        },
        update(value) {
          patch = value
          return query
        },
        then(resolve, reject) {
          if (patch) receipts.push({ id, patch })
          return Promise.resolve({
            data: patch ? [{ id }] : rows,
            error: null
          }).then(resolve, reject)
        }
      }
      return query
    }
  }
  return { db, receipts, rows }
}

test('production sequence mapper puts the wait under the preceding email and preserves a blank follow-up subject', () => {
  const { outboundSequenceToInstantlySequences } = production()
  const steps = outboundSequenceToInstantlySequences({
    steps: [
      { subject: 'hello', slots: [{ key: 'custom', body: 'First' }] },
      { subject: '', delay_days: 3, slots: [{ key: 'custom', body: 'Second' }] }
    ]
  })[0].steps
  assert.deepEqual(
    steps.map((s) => s.delay),
    [3, 0]
  )
  assert.equal(steps[1].variants[0].subject, '')
})
test('index-only receipts in later chunks resolve to that chunk and persist before another API call', async () => {
  const ledger = fakeLedger(201)
  let calls = 0
  const mod = production({
    instantlyAddLeadsBulk: async (_key, input) => {
      calls++
      assert.equal(input.verifyOnImport, false)
      assert.equal(input.skipIfInWorkspace, false)
      if (calls === 2) assert.equal(ledger.receipts.length, 1)
      return {
        created_leads: [{ id: 'provider-' + calls, index: 0 }],
        leads_uploaded: 1
      }
    }
  })
  const result = await mod.pushLeadsToInstantly({
    supabase: ledger.db,
    apiKey: 'test',
    campaign: { id: 'cell', name: 'test', instantly_campaign_id: 'instant' }
  })
  assert.deepEqual(
    result.created.map((r) => r.id),
    ['lead-0', 'lead-200']
  )
  assert.equal(result.marked, 2)
})
test('failure on a later chunk preserves earlier successful receipt', async () => {
  const ledger = fakeLedger(201)
  let calls = 0
  const mod = production({
    instantlyAddLeadsBulk: async () => {
      if (++calls === 2) throw new Error('remote failure')
      return {
        created_leads: [{ id: 'provider-1', index: 0 }],
        leads_uploaded: 1
      }
    }
  })
  await assert.rejects(
    mod.pushLeadsToInstantly({
      supabase: ledger.db,
      apiKey: 'test',
      campaign: { id: 'cell', name: 'test', instantly_campaign_id: 'instant' }
    }),
    /remote failure/
  )
  assert.equal(ledger.receipts.length, 1)
  assert.equal(ledger.receipts[0].id, 'lead-0')
})
test('installation-booking cannot bypass preparation through legacy API loading or template duplication', async () => {
  const mod = production()
  const input = {
    campaign: { id: 'cell', offer_key: 'installation-booking' },
    apiKey: 'test'
  }
  await assert.rejects(mod.pushLeadsToInstantly(input), /preparation/)
  await assert.rejects(mod.pushSequenceToInstantly(input), /preparation/)
  await assert.rejects(mod.duplicateFillCaptureTemplate(input), /Historical/)
  await assert.rejects(
    mod.ensureInstantlyCampaign({ ...input, pushSequence: true }),
    /preparation/
  )
})
test('import enrichment cannot reset contacted, negative or suppressed outreach states', () => {
  const mod = loadTypescript('src/lib/lead-commit.ts', { '@/lib/events': {} })
  for (const status of [
    'contacted',
    'not_interested',
    'suppressed',
    'in_instantly',
    'replied'
  ]) {
    const existing = {
      id: 'old',
      email: 'work@example.test',
      company: 'Example',
      company_domain: 'example.test',
      city: 'Sydney',
      outbound_status: status,
      icp_status: null
    }
    const result = mod.decideLeadCommit(
      {
        email: existing.email,
        company: existing.company,
        outbound_status: 'uncontacted'
      },
      {
        byEmail: new Map([[existing.email, existing]]),
        byDomain: new Map(),
        byCompanyCity: new Map()
      }
    )
    assert.equal(result.action, 'update')
    assert.equal(Object.hasOwn(result.patch, 'outbound_status'), false)
  }
})
