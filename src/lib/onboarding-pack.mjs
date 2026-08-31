/** Onboarding question pack schema + validation. Safe for node:test. */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIELD_TYPES = new Set([
  'text',
  'tel',
  'email',
  'select',
  'multiselect',
  'hours',
  'toggle',
  'textarea',
  'file_note'
])

const BLOCKS = new Set(['invoice', 'delivery', null])

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export const AUTHORISATION_FIELD_ID = 'authorisation'

export const ONBOARDING_DELIVERY_TASKS = [
  { key: 'provision_number', title: 'Provision Switchflow number', task_type: 'DELIVER' },
  { key: 'configure_agent', title: 'Configure voice agent', task_type: 'DELIVER' },
  { key: 'calendar_probe', title: 'Probe Google Calendar access', task_type: 'DELIVER' },
  { key: 'forwarding_setup', title: 'Set up call forwarding', task_type: 'DELIVER' },
  { key: 'go_live_test_call', title: 'Go-live test call', task_type: 'DELIVER' },
  { key: 'go_live_test_sms', title: 'Go-live test SMS', task_type: 'DELIVER' }
]

export const ONBOARDING_INVOICE_TASK = {
  key: 'raise_install_invoice',
  title: 'Raise install invoice in QuickBooks',
  task_type: 'ADMIN'
}

const moduleDir = dirname(fileURLToPath(import.meta.url))

/** @param {string} offerKey */
export function resolvePackPath(offerKey) {
  const filename = `${offerKey.replace(/_/g, '-')}.json`
  const candidates = [
    join(process.cwd(), 'onboarding', filename),
    join(process.cwd(), '..', 'onboarding', filename),
    join(moduleDir, '..', '..', 'onboarding', filename),
    join(moduleDir, '..', '..', '..', 'onboarding', filename)
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`onboarding_pack_not_found:${offerKey}`)
}

/** @param {string} offerKey */
export function loadOnboardingPack(offerKey) {
  const raw = readFileSync(resolvePackPath(offerKey), 'utf8')
  const pack = JSON.parse(raw)
  validateOnboardingPack(pack)
  return pack
}

/** @param {unknown} pack */
export function validateOnboardingPack(pack) {
  const errors = collectPackErrors(pack)
  if (errors.length > 0) {
    throw new Error(`invalid_onboarding_pack:${errors.join('; ')}`)
  }
  return pack
}

/** @param {unknown} pack */
export function collectPackErrors(pack) {
  const errors = []
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return ['pack must be an object']
  }
  const p = /** @type {Record<string, unknown>} */ (pack)
  if (typeof p.offerKey !== 'string' || !p.offerKey.trim()) errors.push('offerKey required')
  if (typeof p.title !== 'string' || !p.title.trim()) errors.push('title required')
  if (!Array.isArray(p.sections) || p.sections.length === 0) errors.push('sections required')

  const fieldIds = new Set()
  for (const section of p.sections ?? []) {
    if (!section || typeof section !== 'object') {
      errors.push('section must be an object')
      continue
    }
    const s = /** @type {Record<string, unknown>} */ (section)
    if (typeof s.id !== 'string' || !s.id.trim()) errors.push('section.id required')
    if (typeof s.title !== 'string' || !s.title.trim()) errors.push(`section ${s.id}: title required`)
    if (!Array.isArray(s.fields) || s.fields.length === 0) {
      errors.push(`section ${s.id}: fields required`)
      continue
    }
    for (const field of s.fields) {
      if (!field || typeof field !== 'object') {
        errors.push(`section ${s.id}: field must be object`)
        continue
      }
      const f = /** @type {Record<string, unknown>} */ (field)
      if (typeof f.id !== 'string' || !f.id.trim()) {
        errors.push(`section ${s.id}: field.id required`)
        continue
      }
      if (fieldIds.has(f.id)) errors.push(`duplicate field id ${f.id}`)
      fieldIds.add(f.id)
      if (typeof f.label !== 'string' || !f.label.trim()) errors.push(`field ${f.id}: label required`)
      if (!FIELD_TYPES.has(f.type)) errors.push(`field ${f.id}: invalid type ${f.type}`)
      if (typeof f.required !== 'boolean') errors.push(`field ${f.id}: required must be boolean`)
      if (!BLOCKS.has(f.blocks ?? null)) errors.push(`field ${f.id}: invalid blocks ${f.blocks}`)
      if (f.type === 'select' || f.type === 'multiselect') {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          errors.push(`field ${f.id}: options required`)
        }
      }
    }
  }
  if (!fieldIds.has(AUTHORISATION_FIELD_ID)) {
    errors.push('authorisation field required')
  }
  return errors
}

/** @param {ReturnType<typeof loadOnboardingPack>} pack */
export function packFieldById(pack) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map()
  for (const section of pack.sections) {
    for (const field of section.fields) {
      map.set(field.id, field)
    }
  }
  return map
}

/** @param {ReturnType<typeof loadOnboardingPack>} pack @param {string} bookingGrantEmail */
export function hydratePackForClient(pack, bookingGrantEmail = '') {
  const grant = bookingGrantEmail.trim() || 'booking@switchflow.agency'
  return {
    ...pack,
    sections: pack.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        help:
          typeof field.help === 'string'
            ? field.help.replace(/\{\{BOOKING_GRANT_EMAIL\}\}/g, grant)
            : field.help
      }))
    }))
  }
}

/** @param {unknown} value @param {Record<string, unknown>} field */
export function isFieldAnswered(value, field) {
  if (field.type === 'file_note') return true
  if (field.type === 'toggle') return value === true
  if (field.type === 'hours') return isValidHours(value)
  if (field.type === 'multiselect') return Array.isArray(value) && value.length > 0
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/** @param {unknown} value */
export function isValidHours(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const hours = /** @type {Record<string, unknown>} */ (value)
  return WEEKDAYS.every((day) => {
    const row = hours[day]
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false
    const r = /** @type {Record<string, unknown>} */ (row)
    if (r.closed === true) return true
    return typeof r.open === 'string' && r.open.length >= 4 && typeof r.close === 'string' && r.close.length >= 4
  })
}

/** @param {ReturnType<typeof loadOnboardingPack>} pack @param {Record<string, unknown>} answers */
export function validateOnboardingAnswers(pack, answers) {
  const errors = []
  const fields = packFieldById(pack)
  for (const [fieldId, field] of fields) {
    if (field.type === 'file_note') continue
    if (!field.required) continue
    const value = answers[fieldId]
    if (!isFieldAnswered(value, field)) {
      errors.push({ fieldId, message: `${field.label} is required` })
    }
  }
  if (answers[AUTHORISATION_FIELD_ID] !== true) {
    errors.push({ fieldId: AUTHORISATION_FIELD_ID, message: 'Authorisation is required' })
  }
  return errors
}

/** @param {string} band */
export function tierFromVanBand(band) {
  return band === '4-8' ? 'vans_4_8' : 'vans_3'
}

/** @param {Record<string, unknown>} answers @param {Record<string, unknown>} existingClient @param {Record<string, unknown>} existingDealTerms @param {string} submittedAt */
export function mapOnboardingSubmit(answers, existingClient = {}, existingDealTerms = {}, submittedAt = new Date().toISOString()) {
  const tier = tierFromVanBand(String(answers.van_count_band || ''))
  const tradingName = String(answers.trading_name || '').trim()
  const legalName = String(answers.legal_entity_name || '').trim()
  const ownerName = String(answers.owner_name || '').trim()
  const trade = String(answers.trade || '').trim()
  const billingEmail = String(answers.billing_email || '').trim()

  const delivery = {
    trading_name: tradingName,
    legal_entity_name: legalName,
    abn: String(answers.abn || '').trim(),
    gst_registered: answers.gst_registered === true,
    owner_name: ownerName,
    owner_mobile: String(answers.owner_mobile || '').trim(),
    public_number: String(answers.public_number || '').trim(),
    carrier: String(answers.carrier || '').trim(),
    line_type: String(answers.line_type || '').trim(),
    van_count_band: String(answers.van_count_band || '').trim(),
    trade,
    services_offered: String(answers.services_offered || '').trim(),
    service_suburbs: String(answers.service_suburbs || '').trim(),
    business_hours: answers.business_hours ?? null,
    after_hours_preference: String(answers.after_hours_preference || '').trim(),
    booked_out_action: String(answers.booked_out_action || '').trim(),
    do_not_book_rules: String(answers.do_not_book_rules || '').trim(),
    google_calendar_id: String(answers.google_calendar_id || '').trim(),
    spoken_business_name: String(answers.spoken_business_name || '').trim(),
    after_hours_greeting: String(answers.after_hours_greeting || '').trim() || null,
    authorisation: true,
    authorisation_at: submittedAt,
    onboarding_submitted_at: submittedAt
  }

  const clientPatch = {}
  if (!String(existingClient.name || '').trim()) {
    clientPatch.name = tradingName || legalName
  }
  if (!String(existingClient.industry || '').trim() && trade) {
    clientPatch.industry = trade
  }
  if (!String(existingClient.main_contact_name || '').trim() && ownerName) {
    clientPatch.main_contact_name = ownerName
  }

  const dealTerms = {
    ...existingDealTerms,
    offer: existingDealTerms.offer || 'missed_call_booking',
    tier,
    billing_email: billingEmail || existingDealTerms.billing_email || '',
    status: existingDealTerms.status === 'draft' || !existingDealTerms.status ? 'contracted' : existingDealTerms.status,
    delivery
  }

  return { clientPatch, dealTerms, delivery, tier }
}

/** @param {Record<string, unknown>} delivery */
export function buildOnboardingTaskNotes(delivery) {
  return ONBOARDING_DELIVERY_TASKS.map((task) => ({
    ...task,
    notes: `onboarding_key:${task.key}\n${summariseDeliveryForTask(task.key, delivery)}`
  }))
}

/** @param {string} key @param {Record<string, unknown>} delivery */
function summariseDeliveryForTask(key, delivery) {
  switch (key) {
    case 'provision_number':
      return `Public number: ${delivery.public_number}\nCarrier: ${delivery.carrier}\nLine: ${delivery.line_type}`
    case 'configure_agent':
      return `Spoken name: ${delivery.spoken_business_name}\nTrade: ${delivery.trade}\nServices: ${delivery.services_offered}`
    case 'calendar_probe':
      return `Calendar: ${delivery.google_calendar_id}`
    case 'forwarding_setup':
      return `After hours: ${delivery.after_hours_preference}\nPublic number: ${delivery.public_number}`
    case 'go_live_test_call':
      return `Owner mobile: ${delivery.owner_mobile}\nPublic number: ${delivery.public_number}`
    case 'go_live_test_sms':
      return `Owner mobile: ${delivery.owner_mobile}`
    default:
      return ''
  }
}

export { WEEKDAYS }
