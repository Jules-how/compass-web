export type QboInvoiceKind = 'install_first_month' | 'monthly'
export type QboDealTier = 'vans_3' | 'vans_4_8'
export type QboDealStatus = 'draft' | 'contracted' | 'retainer_active' | 'paused' | 'ended'
export type QboDisplayState = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void'
export type QboBoardBucket = 'past' | 'due' | 'future'

export type DealTerms = {
  offer: string
  tier: QboDealTier
  install_aud: number
  monthly_aud: number
  gst_mode: 'exclusive'
  start_date: string | null
  term_days: number
  billing_email: string
  status: QboDealStatus
  amount_override: number | null
}
