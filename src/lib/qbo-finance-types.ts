import type { QboBoardBucket, QboDisplayState, QboInvoiceKind } from '@/lib/qbo-types'

export type FinanceInvoiceRow = {
  id: string
  client_id: string
  qbo_invoice_id: string
  doc_number: string | null
  due_date: string | null
  txn_date: string | null
  total_amt: number | null
  balance: number | null
  invoice_kind: QboInvoiceKind | null
  state: QboDisplayState
  client_name: string
  industry: string | null
  offer: string
  collected: number
  collected_on: string | null
  bucket: QboBoardBucket
}

export type FinanceSpendGroup = {
  accountName: string
  amount: number
}

export type FinancesPayload = {
  connected: boolean
  configured: boolean
  from: string
  to: string
  income: number
  spend: number
  profit: number
  projection90: number
  invoices: FinanceInvoiceRow[]
  board: Record<QboBoardBucket, FinanceInvoiceRow[]>
  spendGroups: FinanceSpendGroup[]
  clients: Array<{ id: string; name: string }>
  industries: string[]
  offers: string[]
}
