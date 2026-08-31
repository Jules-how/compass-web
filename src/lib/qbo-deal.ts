import {
  defaultDealTerms as defaultDealTermsRaw,
  lineAmountExGst,
  parseDealTerms as parseDealTermsRaw
} from '@/lib/qbo-invoice.mjs'
import type { DealTerms, QboInvoiceKind } from '@/lib/qbo-types'

export function defaultDealTerms(partial?: Partial<DealTerms> & Record<string, unknown>): DealTerms {
  return defaultDealTermsRaw(partial ?? {}) as DealTerms
}

export function parseDealTerms(raw: unknown): DealTerms {
  return parseDealTermsRaw(raw) as DealTerms
}

/** Install may use amount_override. Monthly always uses deal_terms.monthly_aud. */
export function lineAmountForDeal(kind: QboInvoiceKind, terms: DealTerms): number {
  return lineAmountExGst({
    kind,
    tier: terms.tier,
    amountOverride: kind === 'install_first_month' ? terms.amount_override : null,
    monthlyAud: terms.monthly_aud,
    installAud: terms.install_aud
  })
}
