import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectPackErrors,
  loadOnboardingPack,
  mapOnboardingSubmit,
  tierFromVanBand,
  validateOnboardingAnswers,
  validateOnboardingPack,
  ONBOARDING_DELIVERY_TASKS
} from '../src/lib/onboarding-pack.mjs'

test('fill-capture pack is the default onboarding pack', () => {
  const pack = loadOnboardingPack('booked-jobs-system')
  assert.equal(pack.offerKey, 'booked-jobs-system')
  assert.equal(collectPackErrors(pack).length, 0)
  validateOnboardingPack(pack)
})

test('missed-call pack passes schema validation', () => {
  const pack = loadOnboardingPack('missed_call_booking')
  assert.equal(pack.offerKey, 'missed_call_booking')
  assert.equal(collectPackErrors(pack).length, 0)
  validateOnboardingPack(pack)
  assert.ok(pack.sections.length >= 5)
  const fieldIds = pack.sections.flatMap((section) => section.fields.map((field) => field.id))
  assert.ok(fieldIds.includes('authorisation'))
  assert.ok(fieldIds.includes('billing_email'))
})

test('submit mapping fills client, deal_terms, and delivery', () => {
  const answers = {
    legal_entity_name: 'Acme Plumbing Pty Ltd',
    abn: '12 345 678 901',
    gst_registered: true,
    billing_email: 'accounts@acmeplumbing.example',
    trading_name: 'Acme Plumbing',
    owner_name: 'Sam Owner',
    owner_mobile: '0400000000',
    public_number: '0299999999',
    carrier: 'telstra',
    line_type: 'landline',
    van_count_band: '4-8',
    trade: 'Plumbing',
    services_offered: 'Blocked drains, hot water',
    service_suburbs: 'Parramatta\nMerrylands',
    business_hours: {
      monday: { open: '07:00', close: '17:00', closed: false },
      tuesday: { open: '07:00', close: '17:00', closed: false },
      wednesday: { open: '07:00', close: '17:00', closed: false },
      thursday: { open: '07:00', close: '17:00', closed: false },
      friday: { open: '07:00', close: '17:00', closed: false },
      saturday: { open: '08:00', close: '12:00', closed: false },
      sunday: { open: '08:00', close: '12:00', closed: true }
    },
    after_hours_preference: 'no_answer_divert',
    booked_out_action: 'Offer next available slot',
    do_not_book_rules: 'No gas fitter work',
    google_calendar_id: 'bookings@acmeplumbing.example',
    spoken_business_name: 'Acme Plumbing',
    after_hours_greeting: 'Thanks for calling Acme',
    authorisation: true
  }

  const submittedAt = '2026-08-26T05:00:00.000Z'
  const { clientPatch, dealTerms, delivery } = mapOnboardingSubmit(
    answers,
    { name: '', industry: null, main_contact_name: null },
    { offer: 'missed_call_booking', status: 'draft' },
    submittedAt
  )

  assert.equal(clientPatch.name, 'Acme Plumbing')
  assert.equal(clientPatch.industry, 'Plumbing')
  assert.equal(clientPatch.main_contact_name, 'Sam Owner')
  assert.equal(dealTerms.tier, 'vans_4_8')
  assert.equal(dealTerms.billing_email, 'accounts@acmeplumbing.example')
  assert.equal(dealTerms.status, 'contracted')
  assert.equal(delivery.public_number, '0299999999')
  assert.equal(delivery.authorisation_at, submittedAt)
  assert.equal(tierFromVanBand('1-3'), 'vans_3')
})

test('required field validation catches incomplete submit', () => {
  const pack = loadOnboardingPack('missed_call_booking')
  const errors = validateOnboardingAnswers(pack, { trading_name: 'Only partial' })
  assert.ok(errors.length > 0)
  assert.ok(errors.some((row) => row.fieldId === 'billing_email'))
  assert.ok(errors.some((row) => row.fieldId === 'authorisation'))
})

test('delivery task list covers go-live checks', () => {
  const keys = ONBOARDING_DELIVERY_TASKS.map((row) => row.key)
  assert.deepEqual(keys, [
    'provision_number',
    'configure_agent',
    'calendar_probe',
    'forwarding_setup',
    'go_live_test_call',
    'go_live_test_sms'
  ])
})

test('submit mapping is idempotent on client fields already set', () => {
  const answers = {
    legal_entity_name: 'Legal Co',
    billing_email: 'bill@example.com',
    trading_name: 'Trade Co',
    owner_name: 'Owner',
    van_count_band: '1-3',
    trade: 'Electrical',
    authorisation: true
  }
  const { clientPatch } = mapOnboardingSubmit(answers, {
    name: 'Existing Name',
    industry: 'HVAC',
    main_contact_name: 'Existing Contact'
  })
  assert.equal(Object.keys(clientPatch).length, 0)
})
