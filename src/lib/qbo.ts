import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { decryptSecret, encryptSecret } from '@/lib/ad-token-crypto'
import {
  billingPeriodFromYmd,
  buildInvoiceLine,
  compassPrivateNote,
  deriveInvoiceDisplayState,
  parseCompassPrivateNote,
  sydneyTodayYmd
} from '@/lib/qbo-invoice.mjs'
import { parseDealTerms } from '@/lib/qbo-deal'
import type { DealTerms, QboDisplayState, QboInvoiceKind } from '@/lib/qbo-types'

export const QBO_REFRESH_SETTING_ID = 'integrations.qbo.refresh_token'
export const QBO_REALM_SETTING_ID = 'integrations.qbo.realm_id'
export const QBO_GST_TAX_SETTING_ID = 'integrations.qbo.gst_tax_code'
export const QBO_ITEM_INSTALL_SETTING_ID = 'integrations.qbo.item_install'
export const QBO_ITEM_MONTHLY_SETTING_ID = 'integrations.qbo.item_monthly'
export const QBO_LAST_SYNC_SETTING_ID = 'integrations.qbo.last_sync_at'
export const QBO_SCOPE = 'com.intuit.quickbooks.accounting'

export const QBO_DOC_COLUMNS =
  'id,client_id,qbo_invoice_id,qbo_credit_memo_id,doc_number,doc_type,email_status,balance,total_amt,due_date,txn_date,sync_token,cached_at,created_at,invoice_kind,billing_period,metadata'

export type QboEnvName = 'sandbox' | 'production'
export type QboTransport = (input: string, init?: RequestInit) => Promise<Response>
export type QboDocType = 'invoice' | 'credit_memo'

export type QboClientRecord = {
  id: string
  name: string
  qbo_customer_id?: string | null
  deal_terms?: unknown
  main_contact_name?: string | null
}

export type CompassQboDoc = {
  id: string
  client_id: string
  qbo_invoice_id: string
  qbo_credit_memo_id: string | null
  doc_number: string | null
  doc_type: QboDocType
  email_status: string | null
  balance: number | null
  total_amt: number | null
  due_date: string | null
  txn_date: string | null
  sync_token: string | null
  cached_at: string
  created_at: string
  invoice_kind: QboInvoiceKind | null
  billing_period: string | null
  metadata: Record<string, unknown>
}

export type QboDocView = CompassQboDoc & {
  state: QboDisplayState
}

export type { DealTerms, QboDisplayState, QboInvoiceKind }

type QboRef = { value?: string; name?: string }
export type QboInvoiceJson = {
  Id?: string
  DocNumber?: string
  SyncToken?: string
  EmailStatus?: string
  Balance?: number | string
  TotalAmt?: number | string
  DueDate?: string
  TxnDate?: string
  PrivateNote?: string
  CustomerRef?: QboRef
  Line?: unknown[]
}
type QboCreditMemoJson = QboInvoiceJson
export type QboPaymentJson = {
  Id?: string
  TxnDate?: string
  TotalAmt?: number | string
  LinkedTxn?: Array<{ TxnId?: string; TxnType?: string }>
}
export type QboPurchaseJson = {
  TxnDate?: string
  Line?: Array<{
    Amount?: number | string
    AccountBasedExpenseLineDetail?: { AccountRef?: QboRef }
  }>
}
type QboQueryBody = {
  QueryResponse?: {
    Invoice?: QboInvoiceJson[]
    CreditMemo?: QboCreditMemoJson[]
    Payment?: QboPaymentJson[]
    Purchase?: QboPurchaseJson[]
    Customer?: Array<{ Id?: string; DisplayName?: string }>
    TaxCode?: Array<{ Id?: string; Name?: string; Active?: boolean }>
    Item?: Array<{ Id?: string; Name?: string; Type?: string; Active?: boolean }>
  }
  Fault?: { Error?: Array<{ Message?: string; Detail?: string }> }
}

export function qboOAuthConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID?.trim() && process.env.QBO_CLIENT_SECRET?.trim())
}

export function qboEnvName(): QboEnvName {
  return process.env.QBO_ENV?.trim() === 'production' ? 'production' : 'sandbox'
}

export function qboApiHost(): string {
  return qboEnvName() === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}

export function qboRedirectUri(origin: string): string {
  return process.env.QBO_REDIRECT_URI?.trim() || `${origin}/api/qbo/callback`
}

export function qboAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.QBO_CLIENT_ID?.trim()
  if (!clientId) throw new Error('qbo_not_configured')
  const url = new URL('https://appcenter.intuit.com/connect/oauth2')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', QBO_SCOPE)
  url.searchParams.set('state', state)
  return url.toString()
}

function basicAuthHeader(): string {
  const id = process.env.QBO_CLIENT_ID?.trim()
  const secret = process.env.QBO_CLIENT_SECRET?.trim()
  if (!id || !secret) throw new Error('qbo_not_configured')
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}

export async function exchangeQboCode(input: {
  code: string
  redirectUri: string
  transport?: QboTransport
}): Promise<{ refreshToken: string; realmId?: string }> {
  const transport = input.transport ?? fetch
  const res = await transport('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string
    realmId?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.refresh_token) {
    throw new Error(body.error_description || body.error || 'qbo_token_exchange_failed')
  }
  return { refreshToken: body.refresh_token, realmId: body.realmId }
}

export async function loadQboRefreshToken(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('compass_settings')
    .select('value')
    .eq('id', QBO_REFRESH_SETTING_ID)
    .maybeSingle()
  const raw = typeof data?.value === 'string' ? data.value.trim() : ''
  if (!raw) return null
  try {
    return decryptSecret(raw)
  } catch {
    return raw
  }
}

export async function loadSettingValue(supabase: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await supabase.from('compass_settings').select('value').eq('id', id).maybeSingle()
  const raw = data?.value
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') return JSON.stringify(raw)
  return null
}

export async function upsertSetting(
  supabase: SupabaseClient,
  id: string,
  value: string,
  secret = false
): Promise<void> {
  const stamp = new Date().toISOString()
  const { error } = await supabase.from('compass_settings').upsert({
    id,
    value,
    is_secret: secret ? 1 : 0,
    scope: 'integrations',
    updated_at: stamp,
    mirrored_at: stamp
  })
  if (error) throw new Error(error.message)
}

export async function saveQboConnection(
  supabase: SupabaseClient,
  input: { refreshToken: string; realmId: string }
): Promise<void> {
  await upsertSetting(supabase, QBO_REFRESH_SETTING_ID, encryptSecret(input.refreshToken), true)
  await upsertSetting(supabase, QBO_REALM_SETTING_ID, input.realmId)
}

export async function clearQboConnection(supabase: SupabaseClient): Promise<void> {
  await supabase
    .from('compass_settings')
    .delete()
    .in('id', [
      QBO_REFRESH_SETTING_ID,
      QBO_REALM_SETTING_ID,
      QBO_GST_TAX_SETTING_ID,
      QBO_ITEM_INSTALL_SETTING_ID,
      QBO_ITEM_MONTHLY_SETTING_ID
    ])
}

export function verifyQboWebhookSignature(rawBody: string, signature: string | null): boolean {
  const verifier = process.env.QBO_WEBHOOK_VERIFIER?.trim()
  if (!verifier || !signature) return false
  const digest = createHmac('sha256', verifier).update(rawBody, 'utf8').digest('base64')
  const a = Buffer.from(digest)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function accessTokenFromRefresh(refreshToken: string, transport: QboTransport): Promise<string> {
  const res = await transport('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || 'qbo_refresh_failed')
  }
  return body.access_token
}

function qboErrorMessage(body: QboQueryBody | { Fault?: QboQueryBody['Fault'] }, fallback: string) {
  const first = body.Fault?.Error?.[0]
  return first?.Detail || first?.Message || fallback
}

export function createQboClient(input: { supabase: SupabaseClient; transport?: QboTransport }) {
  const supabase = input.supabase
  const transport = input.transport ?? fetch

  async function companyFetch(path: string, init?: RequestInit, retry = true): Promise<Response> {
    const refresh = await loadQboRefreshToken(supabase)
    const realmId = await loadSettingValue(supabase, QBO_REALM_SETTING_ID)
    if (!refresh || !realmId) throw new Error('qbo_not_connected')
    const token = await accessTokenFromRefresh(refresh, transport)
    const url = `${qboApiHost()}/v3/company/${encodeURIComponent(realmId)}${path}`
    const res = await transport(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    })
    if (res.status === 401 && retry) {
      return companyFetch(path, init, false)
    }
    return res
  }

  async function query<T extends keyof NonNullable<QboQueryBody['QueryResponse']>>(
    sql: string,
    key: T
  ): Promise<NonNullable<NonNullable<QboQueryBody['QueryResponse']>[T]>> {
    const res = await companyFetch(`/query?query=${encodeURIComponent(sql)}&minorversion=73`)
    const body = (await res.json().catch(() => ({}))) as QboQueryBody
    if (!res.ok) throw new Error(qboErrorMessage(body, `qbo_query_failed (${res.status})`))
    const rows = body.QueryResponse?.[key]
    return (rows ?? []) as NonNullable<NonNullable<QboQueryBody['QueryResponse']>[T]>
  }

  async function cacheTaxAndItems(): Promise<{ taxCodeId: string; installItemId: string; monthlyItemId: string }> {
    let taxCodeId = await loadSettingValue(supabase, QBO_GST_TAX_SETTING_ID)
    if (!taxCodeId) {
      const codes = await query('select * from TaxCode', 'TaxCode')
      const gst =
        codes.find((row) => /^gst$/i.test(String(row.Name || ''))) ||
        codes.find((row) => /gst/i.test(String(row.Name || '')) && row.Active !== false)
      if (!gst?.Id) throw new Error('qbo_gst_tax_code_missing')
      taxCodeId = gst.Id
      await upsertSetting(supabase, QBO_GST_TAX_SETTING_ID, taxCodeId)
    }

    let installItemId = await loadSettingValue(supabase, QBO_ITEM_INSTALL_SETTING_ID)
    let monthlyItemId = await loadSettingValue(supabase, QBO_ITEM_MONTHLY_SETTING_ID)
    if (!installItemId || !monthlyItemId) {
      const items = await query("select * from Item where Active = true", 'Item')
      const install =
        items.find((row) => /^install$/i.test(String(row.Name || ''))) ||
        items.find((row) => String(row.Type || '') === 'Service')
      const monthly =
        items.find((row) => /^monthly retainer$/i.test(String(row.Name || ''))) ||
        items.find((row) => /retainer/i.test(String(row.Name || ''))) ||
        install
      if (!install?.Id || !monthly?.Id) throw new Error('qbo_items_missing')
      installItemId = install.Id
      monthlyItemId = monthly.Id
      await upsertSetting(supabase, QBO_ITEM_INSTALL_SETTING_ID, installItemId)
      await upsertSetting(supabase, QBO_ITEM_MONTHLY_SETTING_ID, monthlyItemId)
    }
    return { taxCodeId, installItemId, monthlyItemId }
  }

  async function ensureCustomer(client: QboClientRecord): Promise<string> {
    if (client.qbo_customer_id) return client.qbo_customer_id
    const safeName = client.name.replace(/'/g, "\\'")
    const existing = await query(`select * from Customer where DisplayName = '${safeName}'`, 'Customer')
    let id = existing[0]?.Id
    if (!id) {
      const terms = parseDealTerms(client.deal_terms)
      const res = await companyFetch('/customer?minorversion=73', {
        method: 'POST',
        body: JSON.stringify({
          DisplayName: client.name,
          CompanyName: client.name,
          PrimaryEmailAddr: terms.billing_email ? { Address: terms.billing_email } : undefined
        })
      })
      const body = (await res.json().catch(() => ({}))) as { Customer?: { Id?: string } } & QboQueryBody
      if (!res.ok || !body.Customer?.Id) {
        throw new Error(qboErrorMessage(body, `qbo_customer_create_failed (${res.status})`))
      }
      id = body.Customer.Id
    }
    const { error } = await supabase
      .from('compass_clients')
      .update({ qbo_customer_id: id, updated_at: new Date().toISOString() })
      .eq('id', client.id)
    if (error) throw new Error(error.message)
    return id
  }

  async function createInvoice(
    client: QboClientRecord,
    kind: QboInvoiceKind,
    dates: { txnDate: string; dueDate: string; billingPeriod?: string }
  ): Promise<CompassQboDoc> {
    const customerId = await ensureCustomer(client)
    const refs = await cacheTaxAndItems()
    const terms = parseDealTerms(client.deal_terms)
    const itemId = kind === 'install_first_month' ? refs.installItemId : refs.monthlyItemId
    const billingPeriod = dates.billingPeriod || billingPeriodFromYmd(dates.txnDate)
    const line = buildInvoiceLine({
      kind,
      tier: terms.tier,
      amountOverride: kind === 'install_first_month' ? terms.amount_override : null,
      monthlyAud: terms.monthly_aud,
      installAud: terms.install_aud,
      taxCodeId: refs.taxCodeId,
      itemId
    })
    const res = await companyFetch('/invoice?minorversion=73', {
      method: 'POST',
      body: JSON.stringify({
        CustomerRef: { value: customerId },
        TxnDate: dates.txnDate,
        DueDate: dates.dueDate,
        EmailStatus: 'NotSet',
        PrivateNote: compassPrivateNote(kind, billingPeriod),
        BillEmail: terms.billing_email ? { Address: terms.billing_email } : undefined,
        Line: [line]
      })
    })
    const body = (await res.json().catch(() => ({}))) as { Invoice?: QboInvoiceJson } & QboQueryBody
    if (!res.ok || !body.Invoice?.Id) {
      throw new Error(qboErrorMessage(body, `qbo_invoice_create_failed (${res.status})`))
    }
    return upsertDocFromInvoice(supabase, client.id, body.Invoice, { kind, billingPeriod })
  }

  async function sendInvoice(id: string): Promise<CompassQboDoc> {
    const current = await fetchInvoice(id)
    const res = await companyFetch(`/invoice/${encodeURIComponent(id)}/send?minorversion=73`, {
      method: 'POST'
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as QboQueryBody
      throw new Error(qboErrorMessage(body, `qbo_invoice_send_failed (${res.status})`))
    }
    return fetchInvoice(id).catch(() => current)
  }

  async function voidInvoice(id: string): Promise<CompassQboDoc> {
    const current = await fetchInvoice(id)
    const res = await companyFetch('/invoice?operation=void&minorversion=73', {
      method: 'POST',
      body: JSON.stringify({ Id: id, SyncToken: current.sync_token || '0', sparse: true })
    })
    const body = (await res.json().catch(() => ({}))) as { Invoice?: QboInvoiceJson } & QboQueryBody
    if (!res.ok) throw new Error(qboErrorMessage(body, `qbo_invoice_void_failed (${res.status})`))
    const invoice = body.Invoice ?? {
      Id: id,
      SyncToken: current.sync_token ?? undefined,
      PrivateNote: 'Voided'
    }
    return upsertDocFromInvoice(supabase, current.client_id, invoice, {
      kind: current.invoice_kind,
      billingPeriod: current.billing_period,
      voided: true
    })
  }

  async function createCreditMemo(
    client: QboClientRecord,
    invoiceId: string,
    amount: number,
    memo: string
  ): Promise<CompassQboDoc> {
    const customerId = await ensureCustomer(client)
    const refs = await cacheTaxAndItems()
    const invoice = await fetchInvoice(invoiceId)
    const res = await companyFetch('/creditmemo?minorversion=73', {
      method: 'POST',
      body: JSON.stringify({
        CustomerRef: { value: customerId },
        PrivateNote: memo,
        Line: [
          {
            Amount: amount,
            DetailType: 'SalesItemLineDetail',
            Description: memo,
            SalesItemLineDetail: {
              ItemRef: { value: refs.installItemId },
              UnitPrice: amount,
              Qty: 1,
              TaxCodeRef: { value: refs.taxCodeId }
            }
          }
        ]
      })
    })
    const body = (await res.json().catch(() => ({}))) as { CreditMemo?: QboCreditMemoJson } & QboQueryBody
    if (!res.ok || !body.CreditMemo?.Id) {
      throw new Error(qboErrorMessage(body, `qbo_credit_memo_failed (${res.status})`))
    }
    return upsertDocFromInvoice(supabase, client.id, body.CreditMemo, {
      kind: invoice.invoice_kind,
      billingPeriod: invoice.billing_period,
      docType: 'credit_memo',
      creditMemoId: body.CreditMemo.Id,
      invoiceId
    })
  }

  async function fetchInvoice(id: string): Promise<CompassQboDoc> {
    const res = await companyFetch(`/invoice/${encodeURIComponent(id)}?minorversion=73`)
    const body = (await res.json().catch(() => ({}))) as { Invoice?: QboInvoiceJson } & QboQueryBody
    if (!res.ok || !body.Invoice?.Id) {
      throw new Error(qboErrorMessage(body, `qbo_invoice_fetch_failed (${res.status})`))
    }
    const existing = await loadDocByQboInvoiceId(supabase, id)
    const parsed = parseCompassPrivateNote(body.Invoice.PrivateNote) as {
      kind: QboInvoiceKind
      billingPeriod: string
    } | null
    return upsertDocFromInvoice(supabase, existing?.client_id ?? '', body.Invoice, {
      kind: existing?.invoice_kind ?? parsed?.kind ?? null,
      billingPeriod: existing?.billing_period ?? parsed?.billingPeriod ?? null,
      voided: Boolean((existing?.metadata as { voided?: boolean } | undefined)?.voided)
    })
  }

  async function listUpdatedSince(ts: string): Promise<{
    invoices: QboInvoiceJson[]
    payments: QboPaymentJson[]
  }> {
    const stamp = ts.replace('T', ' ').replace(/\.\d+Z$/, '')
    const safe = stamp.includes("'") ? stamp.replace(/'/g, "\\'") : stamp
    const [invoices, payments] = await Promise.all([
      query(`select * from Invoice where MetaData.LastUpdatedTime > '${safe}'`, 'Invoice'),
      query(`select * from Payment where MetaData.LastUpdatedTime > '${safe}'`, 'Payment')
    ])
    return { invoices, payments }
  }

  async function listPurchasesSince(ts: string): Promise<QboPurchaseJson[]> {
    const stamp = ts.replace('T', ' ').replace(/\.\d+Z$/, '')
    const safe = stamp.replace(/'/g, "\\'")
    return query(`select * from Purchase where MetaData.LastUpdatedTime > '${safe}'`, 'Purchase')
  }

  async function listPurchasesOnDate(ymd: string): Promise<QboPurchaseJson[]> {
    const day = String(ymd).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return []
    return query(`select * from Purchase where TxnDate = '${day}'`, 'Purchase')
  }

  return {
    cacheTaxAndItems,
    ensureCustomer,
    createInvoice,
    sendInvoice,
    voidInvoice,
    createCreditMemo,
    fetchInvoice,
    listUpdatedSince,
    listPurchasesSince,
    listPurchasesOnDate,
    companyFetch
  }
}

export async function loadDocByQboInvoiceId(
  supabase: SupabaseClient,
  qboInvoiceId: string
): Promise<CompassQboDoc | null> {
  const { data, error } = await supabase
    .from('compass_qbo_docs')
    .select(QBO_DOC_COLUMNS)
    .eq('qbo_invoice_id', qboInvoiceId)
    .eq('doc_type', 'invoice')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? normalizeDoc(data) : null
}

export function normalizeDoc(row: Record<string, unknown>): CompassQboDoc {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  return {
    id: String(row.id),
    client_id: String(row.client_id ?? ''),
    qbo_invoice_id: String(row.qbo_invoice_id ?? ''),
    qbo_credit_memo_id: row.qbo_credit_memo_id ? String(row.qbo_credit_memo_id) : null,
    doc_number: row.doc_number ? String(row.doc_number) : null,
    doc_type: row.doc_type === 'credit_memo' ? 'credit_memo' : 'invoice',
    email_status: row.email_status ? String(row.email_status) : null,
    balance: row.balance == null ? null : Number(row.balance),
    total_amt: row.total_amt == null ? null : Number(row.total_amt),
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    txn_date: row.txn_date ? String(row.txn_date).slice(0, 10) : null,
    sync_token: row.sync_token ? String(row.sync_token) : null,
    cached_at: String(row.cached_at ?? ''),
    created_at: String(row.created_at ?? ''),
    invoice_kind:
      row.invoice_kind === 'install_first_month' || row.invoice_kind === 'monthly'
        ? row.invoice_kind
        : null,
    billing_period: row.billing_period ? String(row.billing_period) : null,
    metadata
  }
}

export function viewFromDoc(doc: CompassQboDoc, todayYmd = sydneyTodayYmd()): QboDocView {
  return {
    ...doc,
    state: deriveInvoiceDisplayState(
      {
        emailStatus: doc.email_status,
        balance: doc.balance,
        totalAmt: doc.total_amt,
        dueDate: doc.due_date,
        voided: Boolean(doc.metadata.voided),
        privateNote: typeof doc.metadata.privateNote === 'string' ? doc.metadata.privateNote : null
      },
      todayYmd
    )
  }
}

export async function upsertDocFromInvoice(
  supabase: SupabaseClient,
  clientId: string,
  invoice: QboInvoiceJson,
  extras: {
    kind?: QboInvoiceKind | null
    billingPeriod?: string | null
    voided?: boolean
    docType?: QboDocType
    creditMemoId?: string
    invoiceId?: string
    paymentDate?: string
  } = {}
): Promise<CompassQboDoc> {
  const qboInvoiceId = extras.invoiceId || invoice.Id
  if (!qboInvoiceId) throw new Error('qbo_invoice_id_missing')
  const parsed = parseCompassPrivateNote(invoice.PrivateNote)
  const docType = extras.docType ?? 'invoice'
  const existing = await supabase
    .from('compass_qbo_docs')
    .select(QBO_DOC_COLUMNS)
    .eq(docType === 'credit_memo' ? 'qbo_credit_memo_id' : 'qbo_invoice_id', extras.creditMemoId || qboInvoiceId)
    .eq('doc_type', docType)
    .maybeSingle()

  const now = new Date().toISOString()
  const prev = existing.data ? normalizeDoc(existing.data) : null
  const metadata = {
    ...(prev?.metadata ?? {}),
    privateNote: invoice.PrivateNote ?? prev?.metadata.privateNote ?? null,
    voided: extras.voided || Boolean(prev?.metadata.voided) || /voided/i.test(String(invoice.PrivateNote || '')),
    customerId: invoice.CustomerRef?.value ?? prev?.metadata.customerId ?? null,
    lastPaymentDate: extras.paymentDate ?? prev?.metadata.lastPaymentDate ?? null
  }
  const resolvedClientId = clientId || prev?.client_id || ''
  if (!resolvedClientId) {
    throw new Error('qbo_doc_client_missing')
  }

  const row = {
    id: prev?.id ?? `qbo-doc-${crypto.randomUUID()}`,
    client_id: resolvedClientId,
    qbo_invoice_id: qboInvoiceId,
    qbo_credit_memo_id: extras.creditMemoId ?? prev?.qbo_credit_memo_id ?? null,
    doc_number: invoice.DocNumber ?? prev?.doc_number ?? null,
    doc_type: docType,
    email_status: invoice.EmailStatus ?? prev?.email_status ?? null,
    balance: invoice.Balance == null ? prev?.balance ?? null : Number(invoice.Balance),
    total_amt: invoice.TotalAmt == null ? prev?.total_amt ?? null : Number(invoice.TotalAmt),
    due_date: invoice.DueDate ?? prev?.due_date ?? null,
    txn_date: invoice.TxnDate ?? prev?.txn_date ?? null,
    sync_token: invoice.SyncToken ?? prev?.sync_token ?? null,
    cached_at: now,
    created_at: prev?.created_at ?? now,
    invoice_kind:
      extras.kind ??
      (parsed?.kind === 'install_first_month' || parsed?.kind === 'monthly' ? parsed.kind : null) ??
      prev?.invoice_kind ??
      null,
    billing_period: extras.billingPeriod ?? parsed?.billingPeriod ?? prev?.billing_period ?? null,
    metadata
  }

  const { data, error } = await supabase
    .from('compass_qbo_docs')
    .upsert(row)
    .select(QBO_DOC_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return normalizeDoc(data as Record<string, unknown>)
}

export async function resolveClientIdForQboCustomer(
  supabase: SupabaseClient,
  qboCustomerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id')
    .eq('qbo_customer_id', qboCustomerId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ? String(data.id) : null
}
