import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectPackErrors,
  loadOnboardingPack,
  mapOnboardingSubmit,
  validateOnboardingAnswers,
  validateOnboardingPack,
  ONBOARDING_DELIVERY_TASKS
} from '../src/lib/onboarding-pack.mjs'

test('Ads + booking is the current onboarding pack', () => {
  const pack = loadOnboardingPack('installation-booking')
  assert.equal(pack.offerKey, 'installation-booking')
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

test('submit mapping fills client identity and revision-scoped delivery inputs', () => {
  const answers = {
    legal_entity_name: 'Acme Plumbing Pty Ltd',
    abn: '12 345 678 901',
    billing_email: 'accounts@acmeplumbing.example',
    trading_name: 'Acme Plumbing',
    primary_contact_name: 'Sam Owner',
    primary_contact_mobile: '0400000000',
    trade: 'HVAC',
    website_url: 'https://acme.example',
    installation_services: 'Ducted and split-system installations',
    service_areas: 'Parramatta\nMerrylands',
    excluded_services_areas: 'Service-only calls\nOutside Sydney',
    weekly_quote_capacity: '12',
    google_ads_customer_id: '123-456-7890',
    monthly_media_budget_aud: '3000',
    tracking_status: 'present_unverified',
    landing_page_status: 'switchflow_page',
    business_hours: {
      monday: { open: '07:00', close: '17:00', closed: false },
      tuesday: { open: '07:00', close: '17:00', closed: false },
      wednesday: { open: '07:00', close: '17:00', closed: false },
      thursday: { open: '07:00', close: '17:00', closed: false },
      friday: { open: '07:00', close: '17:00', closed: false },
      saturday: { open: '08:00', close: '12:00', closed: false },
      sunday: { open: '08:00', close: '12:00', closed: true }
    },
    qualification_rules: 'Residential installation in the service area',
    do_not_book_rules: 'No repair-only work',
    google_calendar_id: 'bookings@acmeplumbing.example',
    handoff_email: 'quotes@acmeplumbing.example',
    reminder_preference: 'SMS 24 hours before',
    authorisation: true
  }

  const submittedAt = '2026-08-26T05:00:00.000Z'
  const { clientPatch, delivery } = mapOnboardingSubmit(
    answers,
    { name: '', industry: null, website: null, main_contact_name: null },
    submittedAt
  )

  assert.equal(clientPatch.name, 'Acme Plumbing')
  assert.equal(clientPatch.industry, 'HVAC')
  assert.equal(clientPatch.main_contact_name, 'Sam Owner')
  assert.equal(clientPatch.website, 'https://acme.example')
  assert.equal(delivery.google_ads_customer_id, '123-456-7890')
  assert.equal(delivery.installation_services, 'Ducted and split-system installations')
  assert.equal(delivery.authorisation_at, submittedAt)
})

test('required field validation catches incomplete submit', () => {
  const pack = loadOnboardingPack('installation-booking')
  const errors = validateOnboardingAnswers(pack, { trading_name: 'Only partial' })
  assert.ok(errors.length > 0)
  assert.ok(errors.some((row) => row.fieldId === 'billing_email'))
  assert.ok(errors.some((row) => row.fieldId === 'authorisation'))
})

test('delivery task list covers go-live checks', () => {
  const keys = ONBOARDING_DELIVERY_TASKS.map((row) => row.key)
  assert.deepEqual(keys, [
    'confirm_access',
    'capture_baseline',
    'prepare_search',
    'prepare_booking',
    'staging_test',
    'live_authorisation'
  ])
})

test('submit mapping is idempotent on client fields already set', () => {
  const answers = {
    legal_entity_name: 'Legal Co',
    billing_email: 'bill@example.com',
    trading_name: 'Trade Co',
    primary_contact_name: 'Owner',
    trade: 'Electrical',
    website_url: 'https://existing.example',
    authorisation: true
  }
  const { clientPatch } = mapOnboardingSubmit(answers, {
    name: 'Existing Name',
    industry: 'HVAC',
    website: 'https://already.example',
    main_contact_name: 'Existing Contact'
  })
  assert.equal(Object.keys(clientPatch).length, 0)
})
