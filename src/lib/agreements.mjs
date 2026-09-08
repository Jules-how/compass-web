/** Shared agreement validation and rendering. No provider calls or browser-only state. */
export const AGREEMENT_OFFER = 'installation-booking'
export const AGREEMENT_SCOPE =
  'Manage one agreed installation-enquiry stream through response, qualification, quote-appointment booking, reminders, human handoff, exception handling and outcome reporting.'
export const AGREEMENT_EXCLUSIONS =
  'Advertising spend or management, website rebuilds, SEO, custom integrations and additional enquiry streams are excluded unless expressly listed below.'
export function agreementDefaults(clientName = '') {
  return {
    clientName,
    clientEmail: '',
    supplier: 'Julian Howard trading as Switchflow',
    supplierAbn: '70833262837',
    monthlyAud: 2500,
    setupAud: '',
    gstMode: 'not_registered',
    serviceArea: 'Sydney',
    enquiryStream: '',
    scope: AGREEMENT_SCOPE,
    exclusions: AGREEMENT_EXCLUSIONS,
    successMeasure:
      'Eligible enquiries → contacted → qualified → booked → attended → quoted → won. Agree the baseline, qualified appointment definition and review window at kickoff. Attribution alone does not establish incremental results.',
    startDate: '',
    cancellation: '',
    paymentMethod: 'bank',
    bankInstructions: '',
    additionalTerms: '',
    billingTerms:
      'Setup and the first month are payable on acceptance. Monthly service renews on the payment anniversary.',
    termsReviewed: false,
  }
}
export function validateAgreement(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Agreement fields are required.')
  const out = agreementDefaults()
  for (const key of [
    'clientName',
    'clientEmail',
    'supplier',
    'supplierAbn',
    'serviceArea',
    'enquiryStream',
    'scope',
    'exclusions',
    'successMeasure',
    'startDate',
    'cancellation',
    'bankInstructions',
    'additionalTerms',
    'billingTerms',
  ]) {
    out[key] = typeof input[key] === 'string' ? input[key].trim() : ''
    if (out[key].length > 5000) throw new Error('Agreement text is too long.')
  }
  for (const key of [
    'clientName',
    'clientEmail',
    'supplier',
    'supplierAbn',
    'serviceArea',
    'enquiryStream',
    'scope',
    'successMeasure',
    'startDate',
    'cancellation',
    'billingTerms',
  ])
    if (!out[key])
      throw new Error(`Complete ${key} before preparing a signing link.`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.clientEmail))
    throw new Error('Enter the authorised signatory email.')
  if (!/^\d{11}$/.test(out.supplierAbn.replace(/\s/g, '')))
    throw new Error('Enter the supplier ABN (11 digits).')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(out.startDate) ||
    Number.isNaN(Date.parse(out.startDate)) ||
    new Date(out.startDate).toISOString().slice(0, 10) !== out.startDate
  )
    throw new Error('Enter a valid service start date.')
  for (const key of ['monthlyAud', 'setupAud']) {
    if (input[key] === '' || input[key] === null || input[key] === undefined)
      throw new Error(
        'Confirm both the monthly and setup amounts. Enter 0 explicitly if setup is waived.',
      )
    const n = Number(input[key])
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      n > 100000 ||
      (key === 'monthlyAud' && n === 0)
    )
      throw new Error('Invalid agreement amount.')
    out[key] = Math.round(n * 100) / 100
  }
  if (!['exclusive', 'inclusive', 'not_registered'].includes(input.gstMode))
    throw new Error('Confirm GST treatment before issuing an agreement.')
  out.gstMode = input.gstMode
  if (!['bank', 'stripe'].includes(input.paymentMethod))
    throw new Error('Choose a payment method.')
  out.paymentMethod = input.paymentMethod
  if (out.paymentMethod === 'bank' && !out.bankInstructions)
    throw new Error('Enter verified bank/Wise payment instructions.')
  if (input.termsReviewed !== true)
    throw new Error(
      'Review the commercial terms before preparing a signing link.',
    )
  out.termsReviewed = true
  if (
    out.paymentMethod === 'stripe' &&
    out.billingTerms !==
      'Setup and the first month are payable on acceptance. Monthly service renews on the payment anniversary.'
  )
    throw new Error(
      'Card checkout currently supports payment on acceptance and monthly anniversary billing. Use bank payment for a different agreed schedule.',
    )
  return out
}
export function totalCents(amount, gstMode) {
  return Math.round(Number(amount) * 100 * (gstMode === 'exclusive' ? 1.1 : 1))
}
export function moneyAud(amount) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount)
}
export function renderAgreement(t) {
  const tax =
    t.gstMode === 'exclusive'
      ? 'plus 10% GST'
      : t.gstMode === 'inclusive'
        ? 'including GST'
        : 'no GST charged (supplier not registered)'
  return `SWITCHFLOW — INSTALLATION BOOKING SERVICE AGREEMENT\n\nSupplier: ${t.supplier}\nABN: ${t.supplierAbn}\nClient: ${t.clientName}\nAuthorised signatory email: ${t.clientEmail}\nService start: ${t.startDate}\nService area: ${t.serviceArea}\nEnquiry stream: ${t.enquiryStream}\n\nSERVICE\n${t.scope}\n\nEXCLUSIONS\n${t.exclusions}\n\nFEES AND BILLING\nSetup: ${moneyAud(t.setupAud)} ${tax}.\nMonthly service: ${moneyAud(t.monthlyAud)} ${tax}.\n${t.billingTerms}\nPayment method: ${t.paymentMethod === 'stripe' ? 'Card checkout; monthly recurring card payments authorised by completing checkout.' : 'Bank transfer using the instructions displayed after acceptance.'}\n\nCLIENT RESPONSIBILITIES\nProvide agreed access, accurate service/qualification rules, real appointment availability, a human escalation contact and appointment/sales outcomes. Notify Switchflow of changes. Delivery dates depend on the agreed access and cooperation. Changes to scope or fees require written agreement.\n\nRESULTS AND REVIEW\n${t.successMeasure}\nNo appointment, attendance, sale, revenue or refund guarantee is made. Nothing in this agreement excludes rights or remedies that cannot lawfully be excluded.\n\nCANCELLATION\n${t.cancellation}\n\nACCOUNTS, DATA AND HANDOVER\nThe client retains ownership of its accounts and customer data. Access is limited to delivering this service. Protect credentials and confidential information. On termination, provide the client its data and agreed configuration/handover materials; any separately scoped work requires agreement.\n\nADDITIONAL AGREED TERMS\n${t.additionalTerms || 'None.'}\n\nELECTRONIC ACCEPTANCE\nBy typing your name and accepting, you confirm you are authorised to bind the client and agree to this document electronically. A dated record of the exact document and acceptance is retained. Keep a copy for your records.`
}
export function assertAcceptable(record, hash, now = Date.now()) {
  if (record.status === 'revoked')
    throw new Error('This agreement has been revoked.')
  if (record.documentHash !== hash)
    throw new Error(
      'The agreement changed. Reload and review it before accepting.',
    )
  if (record.status !== 'issued')
    throw new Error('This agreement has already been accepted.')
  if (Date.parse(record.expiresAt) <= now)
    throw new Error(
      'This signing link has expired. Ask Switchflow for a new agreement.',
    )
}
export function isPaidCheckout(session, record) {
  return (
    session?.payment_status === 'paid' &&
    session?.status === 'complete' &&
    session?.metadata?.agreement_id === record.id &&
    session?.metadata?.document_hash === record.documentHash &&
    session?.currency === 'aud' &&
    session?.amount_total ===
      totalCents(record.terms.monthlyAud, record.terms.gstMode) +
        totalCents(record.terms.setupAud, record.terms.gstMode)
  )
}
