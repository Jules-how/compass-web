import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const { siteFromEmailOrUrl } = loadTypescript('src/lib/company-site.ts')
test('shared TradeHQ tenant URL is retained without equating unrelated businesses', () => {
  assert.deepEqual(siteFromEmailOrUrl({ website:'https://tradehq.com.au/coppthecurrent', email:'coppthecurrent@outlook.com.au' }), {website:'https://tradehq.com.au/coppthecurrent',company_domain:null})
  assert.deepEqual(siteFromEmailOrUrl({ email:'coppthecurrent@outlook.com.au' }), {website:null,company_domain:null})
  assert.equal(siteFromEmailOrUrl({website:'https://example.com/contact'}).company_domain,'example.com')
})
