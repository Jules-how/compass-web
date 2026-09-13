import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agreementDefaults,
  validateAgreement,
  renderAgreement,
  assertAcceptable,
  totalCents,
  isPaidCheckout,
} from '../src/lib/agreements.mjs'
const valid = () => ({
  ...agreementDefaults('Example installation business'),
  clientEmail: 'signer@example.com',
  setupAud: 1500,
  enquiryStream: 'Website installation form',
  startDate: '2026-09-10',
  cancellation: 'Monthly rolling; seven days notice before renewal.',
  bankInstructions: 'Verified bank details supplied by operator.',
  termsReviewed: true,
})
test('requires explicit setup amount, tax treatment and review; no legacy defaults', () => {
  const d = agreementDefaults()
  assert.equal(d.monthlyAud, 2500)
  assert.equal(d.gstMode, 'not_registered')
  assert.equal(d.supplierAbn, '70833262837')
  assert.throws(() => validateAgreement({ ...valid(), setupAud: '' }))
  assert.throws(() => validateAgreement({ ...valid(), gstMode: '' }))
  assert.throws(() => validateAgreement({ ...valid(), termsReviewed: false }))
  assert.equal(validateAgreement({ ...valid(), setupAud: 0 }).setupAud, 0)
})
test('rejects invalid dates, nonfinite money, missing bank instructions and alternate card schedules', () => {
  for (const delta of [
    { startDate: '2026-02-31' },
    { monthlyAud: Infinity },
    { setupAud: -1 },
    { bankInstructions: '' },
    { clientEmail: 'bad' },
    { paymentMethod: 'stripe', billingTerms: 'Pay later' },
  ])
    assert.throws(() => validateAgreement({ ...valid(), ...delta }))
})
test('signed text binds amounts, scope, ABN and no GST without reviving the old guarantee', () => {
  const text = renderAgreement(validateAgreement(valid()))
  assert.match(text, /2,500.00/)
  assert.match(text, /1,500.00/)
  assert.match(text, /no GST charged/)
  assert.match(text, /70833262837/)
  assert.doesNotMatch(text, /van tier|1,997/)
  assert.match(text, /Google Search/)
  assert.match(text, /no appointment.*guarantee/is)
})
test('acceptance rejects expired, revoked, already signed and changed documents', () => {
  const r = {
    status: 'issued',
    documentHash: 'a',
    expiresAt: '2026-09-12T00:00:00Z',
  }
  const now = Date.parse('2026-09-10')
  assert.doesNotThrow(() => assertAcceptable(r, 'a', now))
  assert.throws(() => assertAcceptable(r, 'b', now))
  assert.throws(() => assertAcceptable(r, 'a', Date.parse('2026-09-13')))
  for (const status of ['signed', 'revoked'])
    assert.throws(() => assertAcceptable({ ...r, status }, 'a', now))
})
test('payment requires paid provider state, correct amount, currency and exact agreement metadata', () => {
  const r = {
    id: 'agreement-1',
    documentHash: 'hash',
    terms: validateAgreement(valid()),
  }
  const session = {
    status: 'complete',
    payment_status: 'paid',
    amount_total: 400000,
    currency: 'aud',
    metadata: { agreement_id: r.id, document_hash: r.documentHash },
  }
  assert.equal(isPaidCheckout(session, r), true)
  for (const delta of [
    { payment_status: 'unpaid' },
    { status: 'open' },
    { amount_total: 399999 },
    { currency: 'usd' },
    { metadata: { agreement_id: 'different', document_hash: 'hash' } },
  ])
    assert.equal(isPaidCheckout({ ...session, ...delta }, r), false)
})
test('GST is only added for an explicitly GST-exclusive agreement', () => {
  assert.equal(totalCents(2500, 'not_registered'), 250000)
  assert.equal(totalCents(2500, 'inclusive'), 250000)
  assert.equal(totalCents(2500, 'exclusive'), 275000)
})
