import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { getPortalAdminClient } from '@/lib/portal-admin'
import {
  assertAcceptable,
  isPaidCheckout,
  renderAgreement,
  totalCents,
  validateAgreement,
} from '@/lib/agreements.mjs'
import type { ActiveOfferRevision } from '@/lib/offer-revisions'
import { appendEvidence } from '@/lib/events'

type Terms = ReturnType<typeof validateAgreement>
export type AgreementRecord = {
  id: string
  clientId: string
  offerKey: string
  offerRevisionId: string
  offerRevisionNumber: number
  offerSnapshot: Record<string, unknown>
  terms: Terms
  document: string
  documentHash: string
  status: 'issued' | 'signed' | 'revoked'
  createdAt: string
  expiresAt: string
  signature?: {
    name: string
    email: string
    acceptedAt: string
    ip: string
    userAgent: string
    documentHash: string
  }
  payment?: {
    method: 'bank' | 'stripe'
    status: 'pending' | 'paid'
    reference?: string
    paidAt?: string
  }
  checkout?: {
    id: string
    url: string
    generation: number
    customer?: string
    subscription?: string
  }
  updatedAt: string
}
function secret() {
  const s = process.env.COMPASS_AGENT_SECRET
  if (!s) throw new Error('Agreement signing is not configured.')
  return s
}
function cipherKey() {
  return createHash('sha256')
    .update('compass-agreement-storage-v1:' + secret())
    .digest()
}
function encode(value: unknown) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', cipherKey(), iv)
  const data = Buffer.concat([
    c.update(JSON.stringify(value), 'utf8'),
    c.final(),
  ])
  return [
    'v1',
    iv.toString('base64url'),
    c.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.')
}
function decode(value: string): AgreementRecord {
  const [v, iv, tag, data] = value.split('.')
  if (v !== 'v1') throw new Error('Unsupported agreement record.')
  const d = createDecipheriv(
    'aes-256-gcm',
    cipherKey(),
    Buffer.from(iv, 'base64url'),
  )
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return JSON.parse(
    Buffer.concat([
      d.update(Buffer.from(data, 'base64url')),
      d.final(),
    ]).toString(),
  )
}
const clientPrefix = (id: string) =>
  'commercial.agreement.' +
  createHash('sha256').update(id).digest('hex').slice(0, 16) +
  '.'
export function signingToken(id: string) {
  return (
    id +
    '~' +
    createHmac('sha256', secret())
      .update('sign-v1:' + id)
      .digest('base64url')
  )
}
function tokenId(token: string) {
  const [id, sig] = token.split('~')
  if (!/^commercial\.agreement\.[a-f0-9]{16}\.[a-f0-9-]{36}$/.test(id || ''))
    throw new Error('Signing link not found.')
  const expected = signingToken(id).split('~')[1]
  const a = Buffer.from(sig || '')
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new Error('Signing link not found.')
  return id
}
export function agreementUrl(record: AgreementRecord, origin: string) {
  return `${origin}/sign/${signingToken(record.id)}`
}
export async function getAgreement(id: string) {
  const { data, error } = await getPortalAdminClient()
    .from('compass_settings')
    .select('value,updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('Unable to read agreement.')
  if (!data) throw new Error('Signing link not found.')
  return {
    ...decode(String(data.value)),
    updatedAt: data.updated_at,
  } as AgreementRecord
}
export async function getAgreementByToken(token: string) {
  return getAgreement(tokenId(token))
}
export async function listAgreements(clientId: string) {
  const { data, error } = await getPortalAdminClient()
    .from('compass_settings')
    .select('value,updated_at')
    .like('id', clientPrefix(clientId) + '%')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw new Error('Unable to read agreements.')
  return (data || []).map(
    (r) =>
      ({
        ...decode(String(r.value)),
        updatedAt: r.updated_at,
      }) as AgreementRecord,
  )
}
async function change(
  record: AgreementRecord,
  patch: Partial<AgreementRecord>,
) {
  const stamp = new Date(
    Math.max(Date.now(), Date.parse(record.updatedAt) + 1),
  ).toISOString()
  const next = { ...record, ...patch, updatedAt: stamp }
  const { data, error } = await getPortalAdminClient()
    .from('compass_settings')
    .update({ value: encode(next), updated_at: stamp, mirrored_at: stamp })
    .eq('id', record.id)
    .eq('updated_at', record.updatedAt)
    .select('id')
  if (error) throw new Error('Unable to save agreement.')
  if (!data?.length)
    throw new Error('Agreement updated elsewhere. Reload before continuing.')
  return next
}
export function cardConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  )
}
export async function createAgreement(
  clientId: string,
  input: unknown,
  attribution: ActiveOfferRevision
) {
  if (
    !attribution?.revision?.id ||
    attribution.revision.snapshot_scope !== 'full' ||
    attribution.offerKey !== attribution.revision.snapshot.offer_key
  ) {
    throw new Error('A current full offer revision is required before issuing an agreement.')
  }
  const terms = validateAgreement(input)
  if (terms.paymentMethod === 'stripe' && !cardConfigured())
    throw new Error(
      'Connect Stripe and its webhook before issuing a card-payment agreement.',
    )
  const stamp = new Date().toISOString()
  const document = renderAgreement(terms)
  const record: AgreementRecord = {
    id: clientPrefix(clientId) + randomUUID(),
    clientId,
    offerKey: attribution.offerKey,
    offerRevisionId: attribution.revision.id,
    offerRevisionNumber: attribution.revision.version_no,
    offerSnapshot: attribution.revision.snapshot,
    terms,
    document,
    documentHash: createHash('sha256').update(document).digest('hex'),
    status: 'issued',
    createdAt: stamp,
    expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    updatedAt: stamp,
  }
  const { error } = await getPortalAdminClient()
    .from('compass_settings')
    .insert({
      id: record.id,
      value: encode(record),
      is_secret: 1,
      scope: 'commercial',
      updated_at: stamp,
      mirrored_at: stamp,
    })
  if (error) throw new Error('Unable to save agreement.')
  return getAgreement(record.id)
}
export async function revokeAgreement(record: AgreementRecord) {
  if (record.status !== 'issued')
    throw new Error(
      'Accepted agreements are preserved. Record any later termination separately.',
    )
  return change(record, { status: 'revoked' })
}
export async function acceptAgreement(
  record: AgreementRecord,
  input: {
    name?: string
    email?: string
    consent?: boolean
    documentHash?: string
  },
  request: Request,
) {
  assertAcceptable(record, input.documentHash)
  const name = input.name?.trim() || ''
  const email = input.email?.trim().toLowerCase() || ''
  if (
    name.length < 2 ||
    name.length > 200 ||
    email !== record.terms.clientEmail.toLowerCase() ||
    input.consent !== true
  )
    throw new Error(
      'Enter your full name and the specified signatory email, and confirm acceptance.',
    )
  const acceptedAt = new Date().toISOString()
  const next = await change(record, {
    status: 'signed',
    signature: {
      name,
      email,
      acceptedAt,
      documentHash: record.documentHash,
      ip: (request.headers.get('x-forwarded-for') || '')
        .split(',')[0]
        .slice(0, 100),
      userAgent: (request.headers.get('user-agent') || '').slice(0, 500),
    },
    payment: {
      method: record.terms.paymentMethod as 'bank' | 'stripe',
      status: 'pending',
    },
  })
  return next
}
export async function ensureSigningTasks(record: AgreementRecord) {
  if (record.status !== 'signed') return
  const admin = getPortalAdminClient()
  const engagementId = await ensureClientEngagement(record)
  const projectId =
    'project-signed-' +
    createHash('sha256').update(engagementId).digest('hex').slice(0, 24)
  const stamp = new Date().toISOString()
  const { error: pe } = await admin
    .from('compass_projects')
    .upsert(
      {
        id: projectId,
        name: `Installation booking — ${record.terms.clientName}`,
        client_id: record.clientId,
        status: 'planned',
        priority: 2,
        health: 'no_updates',
        labels: [record.offerKey, `offer-v${record.offerRevisionNumber}`, 'signed-client'],
        summary:
          'Signed agreement. Confirm payment and access before delivery. Build only the scoped workflow.',
        source: 'agreement-signing',
        external_id: engagementId,
        notes: `Engagement ${engagementId}. Agreement ${record.id}. Offer revision ${record.offerRevisionId}. ${record.terms.successMeasure}`,
        created_at: stamp,
        updated_at: stamp,
        mirrored_at: stamp,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  if (pe)
    throw new Error('Signed successfully; delivery task creation needs retry.')
  for (const [i, title] of [
    'Confirm payment and schedule kickoff',
    'Onboarding and baseline capture',
    'Enquiry-to-booking delivery workflow',
    'Client outcome reporting',
  ].entries()) {
    const { error } = await admin
      .from('compass_tasks')
      .upsert(
        {
          id: `task-sign-${projectId.slice(15)}-${i}`,
          title,
          project_id: projectId,
          status: i === 0 ? 'not-started' : 'blocked',
          priority: 2,
          source: 'agreement-signing',
          task_type: i === 0 ? 'ADMIN' : 'DELIVER',
          notes:
            i === 0
              ? 'Verify payment evidence and agree kickoff. Signing is not payment.'
              : `Begin after payment/access and scope are confirmed. Use engagement ${engagementId} and offer revision ${record.offerRevisionId}; track quality, client outcomes and delivery effort.`,
          created_at: stamp,
          updated_at: stamp,
          mirrored_at: stamp,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
    if (error)
      throw new Error(
        'Signed successfully; delivery task creation needs retry.',
      )
  }
}

export function engagementIdForAgreement(agreementId: string) {
  return `engagement-${createHash('sha256').update(agreementId).digest('hex').slice(0, 32)}`
}

export async function ensureClientEngagement(record: AgreementRecord) {
  if (!record.offerKey || !record.offerRevisionId || !record.offerSnapshot) {
    throw new Error(
      'This historical agreement has no pinned offer revision. Reissue it before onboarding or delivery.',
    )
  }
  const admin = getPortalAdminClient()
  const id = engagementIdForAgreement(record.id)
  const signedAt = record.signature?.acceptedAt
  if (!signedAt) throw new Error('A signed agreement is required for an engagement.')
  const status = record.payment?.status === 'paid' ? 'paid' : 'signed'
  const { error } = await admin.from('compass_client_engagements').upsert(
    {
      id,
      client_id: record.clientId,
      opportunity_id: null,
      offer_revision_id: record.offerRevisionId,
      offer_key: record.offerKey,
      agreement_id: record.id,
      agreement_document_hash: record.documentHash,
      accepted_terms: {
        agreement: record.terms,
        offer_revision: record.offerSnapshot,
      },
      status,
      signed_at: signedAt,
      paid_at: record.payment?.paidAt ?? null,
      created_at: signedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'agreement_id', ignoreDuplicates: true },
  )
  if (error) throw new Error('Agreement signed; client engagement creation needs retry.')

  if (status === 'paid') {
    const current = await admin
      .from('compass_client_engagements')
      .select('id,status')
      .eq('agreement_id', record.id)
      .maybeSingle()
    if (current.error) throw new Error('Unable to read client engagement.')
    if (current.data?.status === 'signed') {
      const paid = await admin
        .from('compass_client_engagements')
        .update({ status: 'paid', paid_at: record.payment?.paidAt, updated_at: new Date().toISOString() })
        .eq('id', current.data.id)
      if (paid.error) throw new Error('Payment recorded; client engagement update needs retry.')
    }
  }
  try {
    await appendEvidence(admin, {
      client_id: record.clientId,
      source: 'agreement',
      type: status === 'paid' ? 'commercial.payment.confirmed' : 'commercial.agreement.signed',
      offer: record.offerKey,
      offer_revision_id: record.offerRevisionId,
      engagement_id: id,
      native_id: `${record.id}:${status}`,
      payload: {
        agreement_id: record.id,
        document_hash: record.documentHash,
        signed_at: signedAt,
        paid_at: record.payment?.paidAt ?? null
      }
    })
  } catch {
    // The engagement is authoritative; evidence polling can repair this optional projection.
  }
  return id
}
export async function confirmBankPayment(
  record: AgreementRecord,
  reference: string,
) {
  if (record.status !== 'signed' || record.terms.paymentMethod !== 'bank')
    throw new Error('A signed bank-payment agreement is required.')
  if (reference.trim().length < 4)
    throw new Error(
      'Record the bank transaction reference after verifying receipt.',
    )
  if (record.payment?.status === 'paid') return record
  const next = await change(record, {
    payment: {
      method: 'bank',
      status: 'paid',
      reference: reference.trim().slice(0, 500),
      paidAt: new Date().toISOString(),
    },
  })
  await ensureClientEngagement(next)
  return next
}
async function stripe(
  path: string,
  params?: URLSearchParams,
  idempotency?: string,
) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not connected.')
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : {}),
      ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
    },
    body: params,
    cache: 'no-store',
  })
  const data = await res.json()
  if (!res.ok)
    throw new Error(
      'Payment provider could not complete this request. No payment has been assumed.',
    )
  return data
}
export async function beginCheckout(record: AgreementRecord, origin: string) {
  if (record.status !== 'signed' || record.terms.paymentMethod !== 'stripe')
    throw new Error('Accept the card-payment agreement first.')
  if (record.payment?.status === 'paid')
    throw new Error('This agreement is already paid.')
  let generation = record.checkout?.generation || 0
  if (record.checkout) {
    const existing = await stripe('checkout/sessions/' + record.checkout.id)
    if (existing.status === 'open') return existing.url
    if (existing.status === 'complete') {
      await reconcileCheckout(existing, record)
      throw new Error(
        'Checkout completed. Refresh the agreement for payment status.',
      )
    }
    generation++
  }
  const p = new URLSearchParams({
    mode: 'subscription',
    customer_email: record.terms.clientEmail,
    client_reference_id: record.id,
    success_url: agreementUrl(record, origin) + '?checkout=returned',
    cancel_url: agreementUrl(record, origin),
    'payment_method_types[0]': 'card',
    'metadata[agreement_id]': record.id,
    'metadata[document_hash]': record.documentHash,
    'subscription_data[metadata][agreement_id]': record.id,
    'line_items[0][price_data][currency]': 'aud',
    'line_items[0][price_data][unit_amount]': String(
      totalCents(record.terms.monthlyAud, record.terms.gstMode),
    ),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]':
      'Installation booking — monthly service',
    'line_items[0][quantity]': '1',
  })
  if (Number(record.terms.setupAud) > 0) {
    p.set('line_items[1][price_data][currency]', 'aud')
    p.set(
      'line_items[1][price_data][unit_amount]',
      String(totalCents(record.terms.setupAud, record.terms.gstMode)),
    )
    p.set(
      'line_items[1][price_data][product_data][name]',
      'Installation booking — agreed setup',
    )
    p.set('line_items[1][quantity]', '1')
  }
  const session = await stripe(
    'checkout/sessions',
    p,
    `${record.id}:checkout:${generation}`,
  )
  await change(record, {
    checkout: { id: session.id, url: session.url, generation },
  })
  return session.url
}
export async function reconcileCheckout(
  session: Record<string, any>,
  record?: AgreementRecord,
) {
  const current = record || (await getAgreement(session.metadata?.agreement_id))
  if (current.payment?.status === 'paid') return current
  if (!isPaidCheckout(session, current)) return current
  const next = await change(current, {
    payment: {
      method: 'stripe',
      status: 'paid',
      reference: session.id,
      paidAt: new Date().toISOString(),
    },
    checkout: {
      id: session.id,
      url: session.url || '',
      generation: current.checkout?.generation || 0,
      customer: session.customer,
      subscription: session.subscription,
    },
  })
  await ensureClientEngagement(next)
  return next
}
export async function refreshPayment(record: AgreementRecord) {
  if (record.checkout && record.payment?.status !== 'paid')
    return reconcileCheckout(
      await stripe('checkout/sessions/' + record.checkout.id),
      record,
    )
  return record
}
export function verifyStripeEvent(body: string, signature: string) {
  const key = process.env.STRIPE_WEBHOOK_SECRET
  if (!key) throw new Error('Stripe webhook is not configured.')
  const parts = signature.split(',')
  const time = parts.find((p) => p.startsWith('t='))?.slice(2) || ''
  if (!/^\d+$/.test(time) || Math.abs(Date.now() / 1000 - Number(time)) > 300)
    throw new Error('Invalid webhook signature.')
  const expected = createHmac('sha256', key)
    .update(time + '.' + body)
    .digest()
  const valid = parts
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const a = Buffer.from(p.slice(3), 'hex')
      return a.length === expected.length && timingSafeEqual(a, expected)
    })
  if (!valid) throw new Error('Invalid webhook signature.')
  return JSON.parse(body)
}
export function publicAgreement(r: AgreementRecord) {
  return {
    id: r.id,
    document: r.document,
    documentHash: r.documentHash,
    status: r.status,
    expiresAt: r.expiresAt,
    signature: r.signature
      ? {
          name: r.signature.name,
          email: r.signature.email,
          acceptedAt: r.signature.acceptedAt,
        }
      : null,
    payment: r.payment || null,
    paymentMethod: r.terms.paymentMethod,
    bankInstructions: r.status === 'signed' ? r.terms.bankInstructions : '',
    dueAud:
      (totalCents(r.terms.monthlyAud, r.terms.gstMode) +
        totalCents(r.terms.setupAud, r.terms.gstMode)) /
      100,
  }
}

/** Shared encrypted commercial storage; never exposed through public signing DTOs. */
export function sealCommercial(value: unknown) {
  return encode(value)
}
export function openCommercial<T>(value: string): T {
  return decode(value) as unknown as T
}

/** Read-only whole-business receipt summary; never attribute these to a lead cohort. */
export async function agreementOutcomeSummary(since: string) {
  const { data, error } = await getPortalAdminClient().from('compass_settings')
    .select('value').like('id', 'commercial.agreement.%').order('updated_at', { ascending: false }).limit(501)
  if (error) throw new Error('Commercial receipts unavailable')
  if ((data?.length || 0) > 500) throw new Error('Commercial receipt coverage exceeds this summary')
  const records = (data || []).map(r => decode(String(r.value))).filter(r => !r.clientId.startsWith('cs-demo-'))
  const signed = records.filter(r => r.signature?.acceptedAt && r.signature.acceptedAt >= since)
  const paid = records.filter(r => r.payment?.status === 'paid' && r.payment.paidAt && r.payment.paidAt >= since)
  return { signed: signed.length, paymentReceipts: paid.length,
    paidAud: paid.reduce((sum, r) => sum + (totalCents(r.terms.monthlyAud, r.terms.gstMode) + totalCents(r.terms.setupAud, r.terms.gstMode)) / 100, 0),
    scope: 'Whole business: recorded first-invoice payments, not cohort attribution or recurring revenue.' }
}
