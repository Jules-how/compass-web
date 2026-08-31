import type { SupabaseClient } from '@supabase/supabase-js'

import {
  createQboClient,
  loadQboRefreshToken,
  loadSettingValue,
  normalizeDoc,
  QBO_DOC_COLUMNS,
  QBO_LAST_SYNC_SETTING_ID,
  resolveClientIdForQboCustomer,
  upsertDocFromInvoice,
  upsertSetting,
  viewFromDoc,
  type CompassQboDoc,
  type QboClientRecord
} from '@/lib/qbo'
import {
  addDaysYmd,
  monthlyPeriodsDue,
  spendGroupsFromPurchases,
  sydneyTodayYmd
} from '@/lib/qbo-invoice.mjs'
import { parseDealTerms } from '@/lib/qbo-deal'
import type { DealTerms } from '@/lib/qbo-types'

export type QboSyncResult = {
  ok: boolean
  invoices: number
  payments: number
  monthlyCreated: number
  activated: number
  spendDays: number
  error?: string
}

type ClientDealRow = QboClientRecord & {
  status?: string | null
  deal_terms?: unknown
}

export async function syncQboLedger(supabase: SupabaseClient): Promise<QboSyncResult> {
  const refresh = await loadQboRefreshToken(supabase)
  if (!refresh) {
    return { ok: true, invoices: 0, payments: 0, monthlyCreated: 0, activated: 0, spendDays: 0 }
  }

  const qbo = createQboClient({ supabase })
  const lastSync = (await loadSettingValue(supabase, QBO_LAST_SYNC_SETTING_ID)) || '2000-01-01T00:00:00Z'
  const result: QboSyncResult = {
    ok: true,
    invoices: 0,
    payments: 0,
    monthlyCreated: 0,
    activated: 0,
    spendDays: 0
  }

  try {
    const updated = await qbo.listUpdatedSince(lastSync)
    result.invoices = updated.invoices.length
    result.payments = updated.payments.length

    for (const invoice of updated.invoices) {
      const customerId = invoice.CustomerRef?.value
      const existing = invoice.Id
        ? await supabase
            .from('compass_qbo_docs')
            .select(QBO_DOC_COLUMNS)
            .eq('qbo_invoice_id', invoice.Id)
            .eq('doc_type', 'invoice')
            .maybeSingle()
        : { data: null, error: null }
      if (existing.error) throw new Error(existing.error.message)
      let clientId = existing.data ? String(existing.data.client_id) : ''
      if (!clientId && customerId) {
        clientId = (await resolveClientIdForQboCustomer(supabase, customerId)) || ''
      }
      if (!clientId || !invoice.Id) continue
      const prev = existing.data ? normalizeDoc(existing.data as Record<string, unknown>) : null
      const before = prev ? viewFromDoc(prev) : null
      const saved = await upsertDocFromInvoice(supabase, clientId, invoice)
      const after = viewFromDoc(saved)
      if (before?.state !== 'paid' && after.state === 'paid' && saved.invoice_kind === 'install_first_month') {
        await markInstallPaid(supabase, clientId)
        result.activated += 1
      }
    }

    for (const payment of updated.payments) {
      const paymentDate = payment.TxnDate
      const linked = payment.LinkedTxn ?? []
      for (const link of linked) {
        if (link.TxnType !== 'Invoice' || !link.TxnId) continue
        try {
          const fetched = await qbo.fetchInvoice(link.TxnId)
          const after = viewFromDoc(fetched)
          if (after.state === 'paid' && fetched.invoice_kind === 'install_first_month') {
            await markInstallPaid(supabase, fetched.client_id)
            result.activated += 1
          }
          if (paymentDate) {
            await upsertDocFromInvoice(
              supabase,
              fetched.client_id,
              {
                Id: fetched.qbo_invoice_id,
                Balance: fetched.balance ?? undefined,
                TotalAmt: fetched.total_amt ?? undefined,
                EmailStatus: fetched.email_status ?? undefined,
                DueDate: fetched.due_date ?? undefined,
                TxnDate: fetched.txn_date ?? undefined,
                SyncToken: fetched.sync_token ?? undefined,
                DocNumber: fetched.doc_number ?? undefined
              },
              { paymentDate }
            )
          }
        } catch {
          // Invoice may belong to a customer Compass does not track.
        }
      }
    }

    result.monthlyCreated = await raiseDueMonthlyInvoices(supabase, qbo)
    result.spendDays = await refreshSpendCache(supabase, qbo, lastSync)
    await upsertSetting(supabase, QBO_LAST_SYNC_SETTING_ID, new Date().toISOString())
  } catch (err) {
    result.ok = false
    result.error = err instanceof Error ? err.message : 'qbo_sync_failed'
  }

  return result
}

async function markInstallPaid(supabase: SupabaseClient, clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,status,deal_terms')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return
  const terms = parseDealTerms(data.deal_terms)
  const next: DealTerms = { ...terms, status: 'retainer_active' }
  await supabase
    .from('compass_clients')
    .update({
      status: 'active',
      deal_terms: next,
      updated_at: new Date().toISOString()
    })
    .eq('id', clientId)
}

async function raiseDueMonthlyInvoices(
  supabase: SupabaseClient,
  qbo: ReturnType<typeof createQboClient>
): Promise<number> {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name,qbo_customer_id,deal_terms,main_contact_name,status')
    .is('archived_at', null)
  if (error) throw new Error(error.message)

  const today = sydneyTodayYmd()
  let created = 0
  for (const row of (data ?? []) as ClientDealRow[]) {
    const terms = parseDealTerms(row.deal_terms)
    if (terms.status !== 'contracted' && terms.status !== 'retainer_active') continue
    if (!terms.start_date) continue
    const periods = monthlyPeriodsDue({
      startDate: terms.start_date,
      termDays: terms.term_days,
      todayYmd: today
    })
    if (periods.length === 0) continue

    const { data: docs, error: docsError } = await supabase
      .from('compass_qbo_docs')
      .select(QBO_DOC_COLUMNS)
      .eq('client_id', row.id)
      .eq('doc_type', 'invoice')
    if (docsError) throw new Error(docsError.message)
    const existing = new Set(
      ((docs ?? []) as CompassQboDoc[])
        .filter((doc) => doc.invoice_kind === 'monthly' && doc.billing_period)
        .map((doc) => doc.billing_period as string)
    )

    for (const period of periods) {
      if (existing.has(period.billingPeriod)) continue
      await qbo.createInvoice(row, 'monthly', {
        txnDate: period.periodDate,
        dueDate: period.periodDate,
        billingPeriod: period.billingPeriod
      })
      existing.add(period.billingPeriod)
      created += 1
    }
  }
  return created
}

async function refreshSpendCache(
  supabase: SupabaseClient,
  qbo: ReturnType<typeof createQboClient>,
  lastSync: string
): Promise<number> {
  const changed = await qbo.listPurchasesSince(lastSync)
  const dirtyDays = new Set<string>()
  for (const purchase of changed) {
    const day = purchase.TxnDate ? String(purchase.TxnDate).slice(0, 10) : ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dirtyDays.add(day)
  }
  if (dirtyDays.size === 0) return 0

  let wrote = 0
  for (const spendDate of dirtyDays) {
    const dayPurchases = await qbo.listPurchasesOnDate(spendDate)
    const { groups, totalAmt } = spendGroupsFromPurchases(dayPurchases)
    const { error } = await supabase.from('compass_qbo_spend_days').upsert({
      spend_date: spendDate,
      groups,
      total_amt: totalAmt,
      cached_at: new Date().toISOString()
    })
    if (error) throw new Error(error.message)
    wrote += 1
  }
  return wrote
}

export function collectedOnDoc(doc: CompassQboDoc): { amount: number; collectedOn: string | null } {
  const total = Number(doc.total_amt || 0)
  const balance = Number(doc.balance || 0)
  const collected = Math.max(0, total - balance)
  const paymentDate =
    typeof doc.metadata.lastPaymentDate === 'string' ? doc.metadata.lastPaymentDate : null
  const collectedOn = collected > 0 ? paymentDate || (balance === 0 ? doc.txn_date : paymentDate) : null
  return { amount: collected, collectedOn }
}

export function projectionForTerms(
  terms: DealTerms,
  existingPeriods: Set<string>,
  windowStart: string,
  windowEnd: string
): number {
  if (terms.status !== 'contracted' && terms.status !== 'retainer_active') return 0
  if (!terms.start_date) return 0
  const periods = monthlyPeriodsDue({
    startDate: terms.start_date,
    termDays: terms.term_days,
    todayYmd: addDaysYmd(windowEnd, -7)
  })
  let sum = 0
  for (const period of periods) {
    if (existingPeriods.has(period.billingPeriod)) continue
    if (period.periodDate < windowStart || period.periodDate > windowEnd) continue
    const ex = terms.monthly_aud
    sum += Math.round((ex + ex * 0.1) * 100) / 100
  }
  return sum
}
