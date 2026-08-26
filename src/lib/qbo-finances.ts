import type { SupabaseClient } from '@supabase/supabase-js'

import { collectedOnDoc, projectionForTerms } from '@/lib/qbo-sync'
import {
  loadQboRefreshToken,
  normalizeDoc,
  QBO_DOC_COLUMNS,
  viewFromDoc,
  type CompassQboDoc
} from '@/lib/qbo'
import {
  addDaysYmd,
  invoiceBoardBucket,
  sydneyTodayYmd
} from '@/lib/qbo-invoice.mjs'
import { parseDealTerms } from '@/lib/qbo-deal'
import type { QboBoardBucket } from '@/lib/qbo-types'
import type { FinanceInvoiceRow, FinanceSpendGroup, FinancesPayload } from '@/lib/qbo-finance-types'

export type { FinanceInvoiceRow, FinanceSpendGroup, FinancesPayload }

export async function loadFinances(input: {
  supabase: SupabaseClient
  clientId?: string | null
  industry?: string | null
  offer?: string | null
  from?: string | null
  to?: string | null
}): Promise<FinancesPayload> {
  const configured = Boolean(process.env.QBO_CLIENT_ID?.trim() && process.env.QBO_CLIENT_SECRET?.trim())
  const connected = Boolean(await loadQboRefreshToken(input.supabase))
  const today = sydneyTodayYmd()
  const from = input.from || addDaysYmd(today, -90)
  const to = input.to || addDaysYmd(today, 90)

  const empty: FinancesPayload = {
    connected,
    configured,
    from,
    to,
    income: 0,
    spend: 0,
    profit: 0,
    projection90: 0,
    invoices: [],
    board: { past: [], due: [], future: [] },
    spendGroups: [],
    clients: [],
    industries: [],
    offers: []
  }
  if (!connected) return empty

  const { data: clients, error: clientError } = await input.supabase
    .from('compass_clients')
    .select('id,name,industry,deal_terms,archived_at')
    .is('archived_at', null)
    .order('name')
  if (clientError) throw new Error(clientError.message)

  const clientRows = (clients ?? []) as Array<{
    id: string
    name: string
    industry: string | null
    deal_terms: unknown
  }>
  const industries = [
    ...new Set(clientRows.map((row) => row.industry).filter((value): value is string => Boolean(value)))
  ]
  const offers = [
    ...new Set(clientRows.map((row) => parseDealTerms(row.deal_terms).offer).filter(Boolean))
  ]

  const filteredClients = clientRows.filter((row) => {
    if (input.clientId && row.id !== input.clientId) return false
    if (input.industry && (row.industry || '') !== input.industry) return false
    if (input.offer && parseDealTerms(row.deal_terms).offer !== input.offer) return false
    return true
  })
  const clientIds = new Set(filteredClients.map((row) => row.id))
  const clientById = new Map(filteredClients.map((row) => [row.id, row]))

  const { data: docs, error: docsError } = await input.supabase
    .from('compass_qbo_docs')
    .select(QBO_DOC_COLUMNS)
    .eq('doc_type', 'invoice')
    .order('due_date', { ascending: true })
  if (docsError) throw new Error(docsError.message)

  const cachedDocs = (docs ?? [])
    .map((row) => normalizeDoc(row as Record<string, unknown>))
    .filter((doc) => clientIds.has(doc.client_id))

  const invoices: FinanceInvoiceRow[] = cachedDocs.map((doc) => {
    const view = viewFromDoc(doc)
    const client = clientById.get(doc.client_id)
    const collected = collectedOnDoc(doc)
    return {
      id: view.id,
      client_id: view.client_id,
      qbo_invoice_id: view.qbo_invoice_id,
      doc_number: view.doc_number,
      due_date: view.due_date,
      txn_date: view.txn_date,
      total_amt: view.total_amt,
      balance: view.balance,
      invoice_kind: view.invoice_kind,
      state: view.state,
      client_name: client?.name ?? 'Client',
      industry: client?.industry ?? null,
      offer: parseDealTerms(client?.deal_terms).offer,
      collected: collected.amount,
      collected_on: collected.collectedOn,
      bucket: invoiceBoardBucket(view.state, view.due_date, today)
    }
  })

  const board: Record<QboBoardBucket, FinanceInvoiceRow[]> = { past: [], due: [], future: [] }
  for (const invoice of invoices) board[invoice.bucket].push(invoice)

  const income = invoices.reduce((sum, invoice) => {
    if (!invoice.collected_on) return sum
    if (invoice.collected_on < from || invoice.collected_on > to) return sum
    return sum + invoice.collected
  }, 0)

  const { data: spendDays, error: spendError } = await input.supabase
    .from('compass_qbo_spend_days')
    .select('spend_date,groups,total_amt')
    .gte('spend_date', from)
    .lte('spend_date', today)
  if (spendError) throw new Error(spendError.message)

  const spendMap = new Map<string, number>()
  let spend = 0
  for (const day of spendDays ?? []) {
    spend += Number(day.total_amt || 0)
    for (const group of (Array.isArray(day.groups) ? day.groups : []) as FinanceSpendGroup[]) {
      if (!group.accountName) continue
      spendMap.set(group.accountName, (spendMap.get(group.accountName) || 0) + Number(group.amount || 0))
    }
  }
  const spendGroups = [...spendMap.entries()]
    .map(([accountName, amount]) => ({ accountName, amount }))
    .sort((a, b) => b.amount - a.amount)

  const windowEnd = addDaysYmd(today, 90)
  const docsByClient = new Map<string, CompassQboDoc[]>()
  for (const doc of cachedDocs) {
    const list = docsByClient.get(doc.client_id) ?? []
    list.push(doc)
    docsByClient.set(doc.client_id, list)
  }

  let projection90 = invoices
    .filter((invoice) => invoice.state !== 'void' && invoice.state !== 'paid')
    .filter((invoice) => {
      const due = invoice.due_date || ''
      return due >= today && due <= windowEnd
    })
    .reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0)

  for (const client of filteredClients) {
    const terms = parseDealTerms(client.deal_terms)
    const periods = new Set(
      (docsByClient.get(client.id) ?? [])
        .filter((doc) => doc.invoice_kind === 'monthly' && doc.billing_period)
        .map((doc) => doc.billing_period as string)
    )
    projection90 += projectionForTerms(terms, periods, today, windowEnd)
  }

  return {
    connected,
    configured,
    from,
    to,
    income,
    spend,
    profit: income - spend,
    projection90,
    invoices,
    board,
    spendGroups,
    clients: filteredClients.map((row) => ({ id: row.id, name: row.name })),
    industries,
    offers
  }
}
