/** Pure QBO invoice helpers. Safe for node:test. No Intuit calls. */

export const QBO_GST_RATE = 0.1
export const QBO_INSTALL_AUD = 1997
export const QBO_MONTHLY_VANS_3 = 1497
export const QBO_MONTHLY_VANS_4_8 = 1997
export const QBO_TERM_DAYS = 90
export const QBO_OFFER_ID = 'booked-jobs-system'
export const INSTALL_LINE_DESC = 'Fill and capture: install + first 30 days'
export const MONTHLY_LINE_DESC = 'Fill and capture: monthly retainer'
export const QBO_CONFIRM_CREATE =
  'This creates a real invoice in QuickBooks (posts to AR). Send is a separate step.'

export function roundAud(value) {
  return Math.round(Number(value) * 100) / 100
}

export function amountsFromTier(tier) {
  if (tier === 'vans_4_8') {
    return { installAud: QBO_INSTALL_AUD, monthlyAud: QBO_MONTHLY_VANS_4_8 }
  }
  return { installAud: QBO_INSTALL_AUD, monthlyAud: QBO_MONTHLY_VANS_3 }
}

export function defaultDealTerms(partial = {}) {
  const tier = partial.tier === 'vans_4_8' ? 'vans_4_8' : 'vans_3'
  const amounts = amountsFromTier(tier)
  return {
    offer: typeof partial.offer === 'string' && partial.offer.trim() ? partial.offer.trim() : QBO_OFFER_ID,
    tier,
    install_aud: amounts.installAud,
    monthly_aud: amounts.monthlyAud,
    gst_mode: 'exclusive',
    start_date: typeof partial.start_date === 'string' ? partial.start_date : null,
    term_days: typeof partial.term_days === 'number' ? partial.term_days : QBO_TERM_DAYS,
    billing_email: typeof partial.billing_email === 'string' ? partial.billing_email : '',
    status: normalizeDealStatus(partial.status),
    amount_override:
      typeof partial.amount_override === 'number' && Number.isFinite(partial.amount_override)
        ? roundAud(partial.amount_override)
        : null
  }
}

export function normalizeDealStatus(value) {
  if (
    value === 'draft' ||
    value === 'contracted' ||
    value === 'retainer_active' ||
    value === 'paused' ||
    value === 'ended'
  ) {
    return value
  }
  return 'draft'
}

export function parseDealTerms(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultDealTerms()
  return defaultDealTerms(raw)
}

export function lineAmountExGst(input) {
  const amounts = amountsFromTier(input.tier)
  if (input.kind === 'monthly') {
    if (typeof input.monthlyAud === 'number' && Number.isFinite(input.monthlyAud)) {
      return roundAud(input.monthlyAud)
    }
    return amounts.monthlyAud
  }
  if (typeof input.amountOverride === 'number' && Number.isFinite(input.amountOverride)) {
    return roundAud(input.amountOverride)
  }
  if (typeof input.installAud === 'number' && Number.isFinite(input.installAud)) {
    return roundAud(input.installAud)
  }
  return amounts.installAud
}

export function gstOnExclusive(exGst) {
  return roundAud(Number(exGst) * QBO_GST_RATE)
}

export function inclusiveFromExclusive(exGst) {
  const ex = roundAud(exGst)
  return roundAud(ex + gstOnExclusive(ex))
}

export function buildInvoiceLine(input) {
  const unitPrice = lineAmountExGst(input)
  const description = input.kind === 'install_first_month' ? INSTALL_LINE_DESC : MONTHLY_LINE_DESC
  return {
    Amount: unitPrice,
    DetailType: 'SalesItemLineDetail',
    Description: description,
    SalesItemLineDetail: {
      ItemRef: { value: String(input.itemId) },
      UnitPrice: unitPrice,
      Qty: 1,
      TaxCodeRef: { value: String(input.taxCodeId) }
    }
  }
}

export function compassPrivateNote(kind, billingPeriod) {
  return `compass:${kind}:${billingPeriod}`
}

export function parseCompassPrivateNote(note) {
  const raw = String(note || '')
  const match = raw.match(/compass:(install_first_month|monthly):(\d{4}-\d{2})/)
  if (!match) return null
  return { kind: match[1], billingPeriod: match[2] }
}

export function billingPeriodFromYmd(ymd) {
  const s = String(ymd || '')
  return s.length >= 7 ? s.slice(0, 7) : ''
}

export function sydneyTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

export function addMonthsYmd(ymd, months) {
  const [year, month, day] = String(ymd).split('-').map(Number)
  if (!year || !month || !day) return ymd
  const date = new Date(year, month - 1, day)
  date.setMonth(date.getMonth() + months)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd).split('-').map(Number)
  if (!year || !month || !day) return ymd
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function ymdLessThan(a, b) {
  return String(a) < String(b)
}

/**
 * Display state from cached QBO fields. Void wins. Overdue wins over draft/sent.
 *
 * | Condition | State |
 * | EmailStatus NotSet or NeedToSend, balance > 0, not overdue | draft |
 * | EmailSent and balance === totalAmt | sent |
 * | 0 < balance < totalAmt, not overdue | partial |
 * | balance === 0 and not void | paid |
 * | balance > 0 and dueDate < Sydney today | overdue |
 * | voided flag / PrivateNote Voided | void |
 */
export function deriveInvoiceDisplayState(input, todayYmd = sydneyTodayYmd()) {
  const balance = Number(input.balance ?? 0)
  const totalAmt = Number(input.totalAmt ?? 0)
  const email = String(input.emailStatus || '')
  const due = input.dueDate ? String(input.dueDate).slice(0, 10) : ''
  const voided = Boolean(input.voided) || /voided/i.test(String(input.privateNote || ''))

  if (voided) return 'void'
  if (balance === 0 && totalAmt >= 0) return 'paid'
  if (balance > 0 && due && ymdLessThan(due, todayYmd)) return 'overdue'
  if (balance > 0 && totalAmt > 0 && balance < totalAmt) return 'partial'
  if (email === 'EmailSent' && balance === totalAmt && totalAmt > 0) return 'sent'
  if ((email === 'NotSet' || email === 'NeedToSend' || !email) && balance > 0) return 'draft'
  if (balance > 0 && totalAmt > 0 && balance < totalAmt) return 'partial'
  return balance > 0 ? 'draft' : 'paid'
}

export function invoiceBoardBucket(state, dueDate, todayYmd = sydneyTodayYmd()) {
  const due = dueDate ? String(dueDate).slice(0, 10) : ''
  if (state === 'void' || state === 'paid') {
    if (due && !ymdLessThan(due, todayYmd) && due !== todayYmd) return 'future'
    return 'past'
  }
  if (state === 'overdue') return 'due'
  if (due && due === todayYmd) return 'due'
  if (due && ymdLessThan(todayYmd, due)) return 'future'
  return 'past'
}

/** Recompute one spend day's groups from that day's Purchase rows. Never merge onto a prior cache. */
export function spendGroupsFromPurchases(purchases) {
  const groups = new Map()
  for (const purchase of purchases ?? []) {
    for (const line of purchase.Line ?? []) {
      const name = line.AccountBasedExpenseLineDetail?.AccountRef?.name || 'Unassigned'
      const amount = Number(line.Amount || 0)
      if (!Number.isFinite(amount) || amount === 0) continue
      groups.set(name, (groups.get(name) || 0) + amount)
    }
  }
  const list = [...groups.entries()].map(([accountName, amount]) => ({ accountName, amount }))
  const totalAmt = list.reduce((sum, row) => sum + row.amount, 0)
  return { groups: list, totalAmt }
}

export function monthlyPeriodsDue(input) {
  const start = String(input.startDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return []
  const termDays = typeof input.termDays === 'number' ? input.termDays : QBO_TERM_DAYS
  const today = input.todayYmd || sydneyTodayYmd()
  const horizon = addDaysYmd(today, 7)
  const termEnd = addDaysYmd(start, termDays)
  const out = []
  for (let n = 1; n < 36; n += 1) {
    const periodDate = addMonthsYmd(start, n)
    if (!ymdLessThan(periodDate, termEnd) && periodDate !== termEnd) break
    if (ymdLessThan(horizon, periodDate)) continue
    out.push({ n, periodDate, billingPeriod: billingPeriodFromYmd(periodDate) })
  }
  return out
}
