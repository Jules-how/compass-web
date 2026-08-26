import type { NextRequest } from 'next/server'

import {
  createQboClient,
  loadQboRefreshToken,
  normalizeDoc,
  QBO_DOC_COLUMNS,
  viewFromDoc,
  type QboClientRecord
} from '@/lib/qbo'
import { sydneyTodayYmd } from '@/lib/qbo-invoice.mjs'
import type { QboInvoiceKind } from '@/lib/qbo-types'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadClient(supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'], id: string) {
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name,qbo_customer_id,deal_terms,main_contact_name')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as QboClientRecord | null
}

async function listCached(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  clientId: string
) {
  const { data, error } = await supabase
    .from('compass_qbo_docs')
    .select(QBO_DOC_COLUMNS)
    .eq('client_id', clientId)
    .order('txn_date', { ascending: false })
  if (error) throw new Error(error.message)
  const today = sydneyTodayYmd()
  return (data ?? []).map((row) => viewFromDoc(normalizeDoc(row as Record<string, unknown>), today))
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const client = await loadClient(supabase, id)
    if (!client) return portalJson({ error: 'not_found' }, { status: 404 })
    const connected = Boolean(await loadQboRefreshToken(supabase))
    if (connected) {
      const qbo = createQboClient({ supabase })
      const { data: docs } = await supabase
        .from('compass_qbo_docs')
        .select('qbo_invoice_id,doc_type')
        .eq('client_id', id)
        .eq('doc_type', 'invoice')
      for (const doc of docs ?? []) {
        try {
          await qbo.fetchInvoice(String(doc.qbo_invoice_id))
        } catch {
          // Keep cache if Intuit is briefly unavailable.
        }
      }
    }
    return portalJson({ connected, invoices: await listCached(supabase, id) })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  let body: { kind?: QboInvoiceKind; txnDate?: string; dueDate?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }
  const kind = body.kind === 'monthly' ? 'monthly' : 'install_first_month'
  const today = sydneyTodayYmd()
  const txnDate = body.txnDate || today
  const dueDate = body.dueDate || txnDate

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const client = await loadClient(supabase, id)
    if (!client) return portalJson({ error: 'not_found' }, { status: 404 })
    if (!(await loadQboRefreshToken(supabase))) {
      return portalJson({ error: 'qbo_not_connected' }, { status: 409 })
    }
    const qbo = createQboClient({ supabase })
    const invoice = await qbo.createInvoice(client, kind, { txnDate, dueDate })
    return portalJson({ invoice: viewFromDoc(invoice, today) })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  let body: {
    action?: 'send' | 'void' | 'credit_memo'
    invoiceId?: string
    amount?: number
    memo?: string
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const client = await loadClient(supabase, id)
    if (!client) return portalJson({ error: 'not_found' }, { status: 404 })
    if (!(await loadQboRefreshToken(supabase))) {
      return portalJson({ error: 'qbo_not_connected' }, { status: 409 })
    }
    if (!body.invoiceId) return portalJson({ error: 'invoice_id_required' }, { status: 400 })
    const qbo = createQboClient({ supabase })
    const today = sydneyTodayYmd()
    if (body.action === 'send') {
      return portalJson({ invoice: viewFromDoc(await qbo.sendInvoice(body.invoiceId), today) })
    }
    if (body.action === 'void') {
      return portalJson({ invoice: viewFromDoc(await qbo.voidInvoice(body.invoiceId), today) })
    }
    if (body.action === 'credit_memo') {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return portalJson({ error: 'amount_required' }, { status: 400 })
      }
      const memo = body.memo?.trim() || 'Guarantee refund'
      return portalJson({
        invoice: viewFromDoc(await qbo.createCreditMemo(client, body.invoiceId, amount, memo), today)
      })
    }
    return portalJson({ error: 'unknown_action' }, { status: 400 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}
