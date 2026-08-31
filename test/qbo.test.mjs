import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  INSTALL_LINE_DESC,
  MONTHLY_LINE_DESC,
  QBO_CONFIRM_CREATE,
  QBO_GST_RATE,
  amountsFromTier,
  buildInvoiceLine,
  deriveInvoiceDisplayState,
  gstOnExclusive,
  inclusiveFromExclusive,
  invoiceBoardBucket,
  lineAmountExGst,
  monthlyPeriodsDue,
  parseDealTerms,
  spendGroupsFromPurchases
} from '../src/lib/qbo-invoice.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('tier amounts are exclusive of GST and match the locked offer', () => {
  assert.deepEqual(amountsFromTier('vans_3'), { installAud: 1997, monthlyAud: 1497 })
  assert.deepEqual(amountsFromTier('vans_4_8'), { installAud: 1997, monthlyAud: 1997 })
  assert.equal(lineAmountExGst({ kind: 'install_first_month', tier: 'vans_3' }), 1997)
  assert.equal(lineAmountExGst({ kind: 'monthly', tier: 'vans_3' }), 1497)
  assert.equal(lineAmountExGst({ kind: 'monthly', tier: 'vans_4_8' }), 1997)
  assert.equal(lineAmountExGst({ kind: 'install_first_month', tier: 'vans_3', amountOverride: 1800 }), 1800)
  assert.equal(lineAmountExGst({ kind: 'monthly', tier: 'vans_3', amountOverride: 1800 }), 1497)
  assert.equal(lineAmountExGst({ kind: 'monthly', tier: 'vans_3', monthlyAud: 1497, amountOverride: 1800 }), 1497)
})

test('amount_override applies only to the install invoice', () => {
  const terms = parseDealTerms({ tier: 'vans_3', amount_override: 1800, monthly_aud: 1497 })
  assert.equal(terms.amount_override, 1800)
  assert.equal(
    lineAmountExGst({
      kind: 'install_first_month',
      tier: terms.tier,
      amountOverride: terms.amount_override,
      installAud: terms.install_aud,
      monthlyAud: terms.monthly_aud
    }),
    1800
  )
  assert.equal(
    lineAmountExGst({
      kind: 'monthly',
      tier: terms.tier,
      amountOverride: terms.amount_override,
      installAud: terms.install_aud,
      monthlyAud: terms.monthly_aud
    }),
    1497
  )
  const monthlyLine = buildInvoiceLine({
    kind: 'monthly',
    tier: 'vans_4_8',
    amountOverride: 5000,
    monthlyAud: 1997,
    taxCodeId: 'GST',
    itemId: '13'
  })
  assert.equal(monthlyLine.Amount, 1997)
  const deal = read('src/lib/qbo-deal.ts')
  assert.match(deal, /kind === 'install_first_month' \? terms.amount_override : null/)
  assert.match(deal, /monthlyAud: terms.monthly_aud/)
  const client = read('src/lib/qbo.ts')
  assert.match(client, /kind === 'install_first_month' \? terms.amount_override : null/)
})

test('spend day replace recomputes groups from that day only', () => {
  const first = spendGroupsFromPurchases([
    {
      TxnDate: '2026-08-26',
      Line: [{ Amount: 40, AccountBasedExpenseLineDetail: { AccountRef: { name: 'Software' } } }]
    }
  ])
  assert.deepEqual(first.groups, [{ accountName: 'Software', amount: 40 }])
  assert.equal(first.totalAmt, 40)

  const replaced = spendGroupsFromPurchases([
    {
      TxnDate: '2026-08-26',
      Line: [
        { Amount: 25, AccountBasedExpenseLineDetail: { AccountRef: { name: 'Software' } } },
        { Amount: 10, AccountBasedExpenseLineDetail: { AccountRef: { name: 'Ads' } } }
      ]
    }
  ])
  assert.deepEqual(replaced.groups, [
    { accountName: 'Software', amount: 25 },
    { accountName: 'Ads', amount: 10 }
  ])
  assert.equal(replaced.totalAmt, 35)
  assert.notEqual(replaced.totalAmt, first.totalAmt + 35)

  const sync = read('src/lib/qbo-sync.ts')
  assert.match(sync, /listPurchasesOnDate/)
  assert.match(sync, /spendGroupsFromPurchases/)
  assert.doesNotMatch(sync, /merged/)
  assert.doesNotMatch(sync, /prevGroups/)
})

test('invoice lines stay exclusive; GST is 10 percent on top', () => {
  const install = buildInvoiceLine({
    kind: 'install_first_month',
    tier: 'vans_3',
    taxCodeId: 'GST',
    itemId: '12'
  })
  assert.equal(install.Description, INSTALL_LINE_DESC)
  assert.equal(install.Amount, 1997)
  assert.equal(install.SalesItemLineDetail.UnitPrice, 1997)
  assert.equal(install.SalesItemLineDetail.Qty, 1)
  assert.equal(install.SalesItemLineDetail.TaxCodeRef.value, 'GST')
  assert.equal(gstOnExclusive(1997), 199.7)
  assert.equal(inclusiveFromExclusive(1997), 2196.7)
  assert.equal(QBO_GST_RATE, 0.1)

  const monthly = buildInvoiceLine({
    kind: 'monthly',
    tier: 'vans_3',
    taxCodeId: 'GST',
    itemId: '13'
  })
  assert.equal(monthly.Description, MONTHLY_LINE_DESC)
  assert.equal(monthly.Amount, 1497)
  assert.equal(inclusiveFromExclusive(1497), 1646.7)
})

test('derived invoice display state mapping', () => {
  const today = '2026-08-26'
  const cases = [
    [{ emailStatus: 'NotSet', balance: 2196.7, totalAmt: 2196.7, dueDate: '2026-08-26' }, 'draft'],
    [{ emailStatus: 'NeedToSend', balance: 2196.7, totalAmt: 2196.7, dueDate: '2026-08-26' }, 'draft'],
    [{ emailStatus: 'EmailSent', balance: 2196.7, totalAmt: 2196.7, dueDate: '2026-08-28' }, 'sent'],
    [{ emailStatus: 'EmailSent', balance: 1000, totalAmt: 2196.7, dueDate: '2026-08-28' }, 'partial'],
    [{ emailStatus: 'EmailSent', balance: 0, totalAmt: 2196.7, dueDate: '2026-08-20' }, 'paid'],
    [{ emailStatus: 'NeedToSend', balance: 2196.7, totalAmt: 2196.7, dueDate: '2026-08-20' }, 'overdue'],
    [{ emailStatus: 'EmailSent', balance: 500, totalAmt: 2196.7, dueDate: '2026-08-20' }, 'overdue'],
    [{ emailStatus: 'EmailSent', balance: 0, totalAmt: 2196.7, voided: true }, 'void'],
    [{ emailStatus: 'NotSet', balance: 0, totalAmt: 2196.7, privateNote: 'Voided' }, 'void']
  ]
  for (const [input, expected] of cases) {
    assert.equal(deriveInvoiceDisplayState(input, today), expected, JSON.stringify(input))
  }
  assert.equal(invoiceBoardBucket('overdue', '2026-08-20', today), 'due')
  assert.equal(invoiceBoardBucket('sent', '2026-09-01', today), 'future')
  assert.equal(invoiceBoardBucket('paid', '2026-08-01', today), 'past')
})

test('monthly periods: start plus n months within 7 days and inside the term', () => {
  const periods = monthlyPeriodsDue({
    startDate: '2026-08-26',
    termDays: 90,
    todayYmd: '2026-09-20'
  })
  assert.equal(periods.length, 1)
  assert.equal(periods[0].billingPeriod, '2026-09')
  assert.equal(periods[0].periodDate, '2026-09-26')

  const later = monthlyPeriodsDue({
    startDate: '2026-08-26',
    termDays: 90,
    todayYmd: '2026-10-20'
  })
  assert.deepEqual(
    later.map((row) => row.billingPeriod),
    ['2026-09', '2026-10']
  )
})

test('deal terms default to the locked offer', () => {
  const terms = parseDealTerms({ tier: 'vans_4_8', start_date: '2026-08-26' })
  assert.equal(terms.offer, 'missed_call_booking')
  assert.equal(terms.gst_mode, 'exclusive')
  assert.equal(terms.install_aud, 1997)
  assert.equal(terms.monthly_aud, 1997)
  assert.equal(terms.term_days, 90)
  assert.equal(terms.status, 'draft')
})

test('QBO HTTP client is injectable and tests never call Intuit hosts', () => {
  const src = read('src/lib/qbo.ts')
  assert.match(src, /export type QboTransport/)
  assert.match(src, /transport\?: QboTransport/)
  assert.match(src, /input.transport \?\? fetch/)
  assert.match(src, /sandbox-quickbooks.api.intuit.com/)
  assert.match(src, /quickbooks.api.intuit.com/)
  assert.match(src, /encryptSecret/)
  assert.match(src, /QBO_REFRESH_SETTING_ID/)
})

test('webhook uses Intuit HMAC and cron includes qbo', () => {
  const webhook = read('src/app/api/qbo/webhook/route.ts')
  const sync = read('src/lib/agent-sync.ts')
  const invoices = read('src/app/api/clients/[id]/invoices/route.ts')
  assert.match(webhook, /verifyQboWebhookSignature/)
  assert.match(webhook, /intuit-signature/)
  assert.match(sync, /'qbo'/)
  assert.match(sync, /syncQboLedger/)
  assert.match(invoices, /requireSameOrigin/)
  assert.match(invoices, /createInvoice/)
  assert.ok(QBO_CONFIRM_CREATE.includes('posts to AR'))

  const body = '{"eventNotifications":[]}'
  const verifier = 'test-verifier'
  const digest = createHmac('sha256', verifier).update(body, 'utf8').digest('base64')
  assert.equal(typeof digest, 'string')
  assert.ok(digest.length > 10)
})

test('migrations 0060-0062 only add deal terms, qbo docs, and spend cache', () => {
  const m60 = read('supabase/migrations/0062_compass_client_deal_terms.sql')
  const m61 = read('supabase/migrations/0063_compass_qbo_docs.sql')
  const m62 = read('supabase/migrations/0064_compass_qbo_doc_meta.sql')
  assert.match(m60, /deal_terms jsonb/)
  assert.match(m60, /qbo_customer_id text/)
  assert.match(m61, /compass_qbo_docs/)
  assert.match(m61, /qbo_invoice_id/)
  assert.match(m61, /compass_qbo_docs_client_idx/)
  assert.match(m61, /compass_qbo_docs_invoice_idx/)
  assert.match(m62, /invoice_kind/)
  assert.match(m62, /compass_qbo_spend_days/)
  assert.match(m61, /portal_is_operator/)
})
