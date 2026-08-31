# QuickBooks Online (Compass)

Compass is not a second ledger. The AU QuickBooks company file owns invoices, credit memos, payments, and expenses. Compass stores QBO ids plus a cache of status fields so the operator UI can show draft / sent / partial / paid / overdue / void.

## One time setup (Jules)

1. **Company file.** AU file, GST registered, tax exclusive pricing.
2. **GST.** Confirm the income tax code is GST 10%. Compass queries TaxCode at connect time and caches the id in `compass_settings` (`integrations.qbo.gst_tax_code`).
3. **Items.** Create two service items:
   - `Install`
   - `Monthly retainer`
   Both exclusive of GST, income account as you already use.
4. **Invoice template.** Footer must show PayID, Wise, and bank transfer (BSB / account). No card language. Terms: Due on receipt.
5. **Bank feed.** Connect the operating account so payments land on invoices without Compass inventing cash.
6. **Intuit developer app.**
   - Create an app at [developer.intuit.com](https://developer.intuit.com).
   - Accounting scope only (`com.intuit.quickbooks.accounting`).
   - Redirect URI must match `QBO_REDIRECT_URI` exactly, including `https://…/api/qbo/callback`.
   - Copy Client ID and Client Secret.
   - Webhook: URL `https://<host>/api/qbo/webhook`, verifier token into `QBO_WEBHOOK_VERIFIER`. Subscribe to Invoice, Payment, CreditMemo.
7. **Env vars** (Vercel + local `.env.local`):

```
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=https://<host>/api/qbo/callback
QBO_ENV=sandbox
QBO_WEBHOOK_VERIFIER=
```

`QBO_ENV` is `sandbox` or `production`. Hosts: `sandbox-quickbooks.api.intuit.com` / `quickbooks.api.intuit.com`.

8. **Migrations.** Apply `0062_compass_client_deal_terms.sql`, `0063_compass_qbo_docs.sql`, `0064_compass_qbo_doc_meta.sql` on the hosted Supabase project.
9. **Connect.** Settings → QuickBooks Online → Connect. Grant the AU company. Compass then caches the GST tax code and item ids.
10. **Offer lock.** $1,997 install + first 30 days (one line). Then $1,497 / mo (≤3 vans) or $1,997 / mo (4–8 vans) from month 2. All exclusive of GST. 90 day term. Guarantee refunds are QBO credit memos.

## How the integration works

| Action | What Compass does |
| --- | --- |
| Connect | OAuth2 authorization code. Refresh token is encrypted in `compass_settings` the same way ad / calendar tokens are. Realm id stored beside it. |
| Deal terms | `compass_clients.deal_terms` jsonb (tier, dates, billing email, status). Amounts derive from tier. Not invoice truth. |
| Raise invoice | UI confirm, then POST creates a real QBO Invoice (posts to AR immediately). EmailStatus `NotSet`. Send is a later call. |
| Install line | One line: `Missed-call booking: install + first 30 days` at `install_aud` exclusive, TaxCodeRef = cached GST 10%. |
| Monthly line | One line: `Missed-call booking: monthly retainer` at `monthly_aud` exclusive. |
| Send / void / credit memo | PATCH hits QBO. Void and credit memo are real QBO operations. |
| Webhook | `/api/qbo/webhook` checks `intuit-signature` with `QBO_WEBHOOK_VERIFIER`, then refreshes cache. |
| Daily cron | `qbo` is in `ALL_AGENT_SYNC_SOURCES`. Pulls Invoice + Payment updated since last run. Writes `compass_qbo_docs`. |
| Install paid | When an install invoice becomes paid: `compass_clients.status = active` and `deal_terms.status = retainer_active`. |
| Monthly cron | For `contracted` / `retainer_active` clients, if `start_date + n months` is within 7 days (Sydney) and no invoice exists for that period, create an unsent monthly invoice. |
| Finances | Income = collected (`totalAmt - balance`) dated by payment date, else txn date when balance is 0. Spend = QBO Purchase lines grouped by account name (daily cache). Profit = income − spend. 90 day projection = unpaid balances due in the window + contracted retainers with no invoice yet. No pipeline weighting. No hand entered amounts. |

## Display state

See `deriveInvoiceDisplayState` in `src/lib/qbo-invoice.mjs`. Void wins. Overdue wins over draft / sent when `dueDate` is before today in Australia/Sydney.

## Operator routes

- `GET /api/qbo/connect` and `GET /api/qbo/callback` (operator cookie)
- `GET|DELETE /api/qbo/settings`
- `GET /api/qbo/finances`
- `POST /api/qbo/webhook` (Intuit signature, not operator cookie)
- `GET|PATCH /api/clients/:id/deal-terms`
- `GET|POST|PATCH /api/clients/:id/invoices`
