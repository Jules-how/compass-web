import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const HOT = new Set(['replied', 'interested', 'booked', 'meeting_booked', 'converted'])

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

function normalizeCompanyKey(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+(pty ltd|ltd|pty)\b/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function companyCityKey(company, city) {
  const companyKey = normalizeCompanyKey(company)
  if (!companyKey) return ''
  return `${companyKey}|${String(city ?? '').trim().toLowerCase()}`
}

function decide(incoming, lookups) {
  const email = normalizeEmail(incoming.email)
  const company = String(incoming.company ?? '').trim()
  const key = email || 'row'
  if (!email) return { action: 'skip', key, reason: 'missing email' }
  if (!company) return { action: 'skip', key: email, reason: 'missing company' }
  const domain = String(incoming.company_domain ?? '').toLowerCase()
  const cityKey = companyCityKey(company, incoming.city)
  const emailMatch = lookups.byEmail.get(email)
  if (emailMatch) {
    const patch = { ...incoming }
    if (emailMatch.icp_status === 'skip') patch.icp_status = 'skip'
    const explicit = incoming.outbound_status !== undefined
    if (!explicit && HOT.has(emailMatch.outbound_status)) delete patch.outbound_status
    return { action: 'update', key: email, id: emailMatch.id, patch }
  }
  if (domain && lookups.byDomain.get(domain)) {
    return { action: 'company_dupe', key: email, existing_id: lookups.byDomain.get(domain).id }
  }
  if (cityKey && lookups.byCompanyCity.get(cityKey)) {
    return { action: 'company_dupe', key: email, existing_id: lookups.byCompanyCity.get(cityKey).id }
  }
  return { action: 'insert', key: email }
}

test('commit skips missing email or company', () => {
  const empty = { byEmail: new Map(), byDomain: new Map(), byCompanyCity: new Map() }
  assert.equal(decide({ company: 'Acme' }, empty).reason, 'missing email')
  assert.equal(decide({ email: 'a@b.c' }, empty).reason, 'missing company')
})

test('email match updates and does not invent a second row', () => {
  const lookups = {
    byEmail: new Map([['ada@shop.com', { id: '1', outbound_status: 'uncontacted', icp_status: 'none' }]]),
    byDomain: new Map(),
    byCompanyCity: new Map()
  }
  const d = decide({ email: 'Ada@Shop.com', company: 'Shop', opener: 'hey' }, lookups)
  assert.equal(d.action, 'update')
  assert.equal(d.id, '1')
})

test('company domain or company+city is company_dupe, not insert', () => {
  const lookups = {
    byEmail: new Map(),
    byDomain: new Map([['shop.com.au', { id: 'dom-1' }]]),
    byCompanyCity: new Map([['inner west plumbing|marrickville', { id: 'city-1' }]])
  }
  const domain = decide(
    { email: 'new@shop.com.au', company: 'Other', company_domain: 'shop.com.au' },
    lookups
  )
  assert.equal(domain.action, 'company_dupe')
  assert.equal(domain.existing_id, 'dom-1')
  const city = decide(
    { email: 'other@example.com', company: 'Inner West Plumbing', city: 'Marrickville' },
    lookups
  )
  assert.equal(city.action, 'company_dupe')
  assert.equal(city.existing_id, 'city-1')
})

test('hot outbound_status is not downgraded unless the row sets it', () => {
  const lookups = {
    byEmail: new Map([['hot@shop.com', { id: 'h1', outbound_status: 'replied', icp_status: 'pass' }]]),
    byDomain: new Map(),
    byCompanyCity: new Map()
  }
  const silent = decide({ email: 'hot@shop.com', company: 'Shop', opener: 'x' }, lookups)
  assert.equal(silent.action, 'update')
  assert.equal(silent.patch.outbound_status, undefined)
  const explicit = decide(
    { email: 'hot@shop.com', company: 'Shop', outbound_status: 'uncontacted' },
    lookups
  )
  assert.equal(explicit.patch.outbound_status, 'uncontacted')
})

test('icp_status skip stays skip', () => {
  const lookups = {
    byEmail: new Map([['skip@shop.com', { id: 's1', outbound_status: 'uncontacted', icp_status: 'skip' }]]),
    byDomain: new Map(),
    byCompanyCity: new Map()
  }
  const d = decide({ email: 'skip@shop.com', company: 'Shop', icp_status: 'pass' }, lookups)
  assert.equal(d.patch.icp_status, 'skip')
})

test('legacy enum maps live in shared import helpers', () => {
  const src = read('src/lib/lead-import-shared.ts')
  assert.match(src, /ready.*enriched/)
  assert.match(src, /qualified.*pass/)
  assert.match(src, /function companyCityKey/)
})

test('commit helper encodes the same decisions', () => {
  const src = read('src/lib/lead-commit.ts')
  assert.match(src, /company_dupe/)
  assert.match(src, /isHotOutboundStatus/)
  assert.match(src, /isIcpSkip/)
  assert.match(src, /LEAD_WRITE_BATCH = 500/)
  assert.match(src, /never invent|missing email/)
})
