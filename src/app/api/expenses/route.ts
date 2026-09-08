import { requirePortalAccess } from '@/lib/portal-access'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { sealCommercial, openCommercial } from '@/lib/agreement-server'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/portal-http'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Expense = {
  id: string
  date: string
  vendor: string
  amountAud: number
  category: string
  account: string
  reference: string
  receiptUrl: string
  notes: string
  createdAt: string
}
export async function GET(request: Request) {
  try {
    await requirePortalAccess({ operator: true })
    const raw = Number(new URL(request.url).searchParams.get('page') || 0)
    const page = Number.isInteger(raw) && raw >= 0 ? raw : 0
    const { data, error, count } = await getPortalAdminClient()
      .from('compass_settings')
      .select('value', { count: 'exact' })
      .like('id', 'commercial.expense.%')
      .order('id', { ascending: false })
      .range(page * 100, page * 100 + 99)
    if (error) throw new Error('Unable to load expenses.')
    return portalJson({
      expenses: (data || []).map((x) =>
        openCommercial<Expense>(String(x.value)),
      ),
      page,
      total: count || 0,
    })
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : 'Unable to load expenses.' },
        { status: 400 },
      )
    )
  }
}
export async function POST(request: Request) {
  const origin = requireSameOrigin(request)
  if (origin) return origin
  try {
    await requirePortalAccess({ operator: true })
    const b = (await readBoundedJson(request, 12000)) as Partial<Expense> & {
      requestId?: string
    }
    if (!b.requestId || !/^[a-f0-9-]{36}$/.test(b.requestId))
      throw new Error('A valid expense request ID is required.')
    if (
      !b.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      Number.isNaN(Date.parse(b.date)) ||
      new Date(b.date).toISOString().slice(0, 10) !== b.date
    )
      throw new Error('Enter a valid expense date.')
    const amount = Number(b.amountAud)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000)
      throw new Error('Enter the actual positive AUD amount paid.')
    if (
      !b.vendor?.trim() ||
      !b.category?.trim() ||
      !b.account?.trim() ||
      !b.reference?.trim()
    )
      throw new Error(
        'Enter vendor, category, account and transaction/receipt reference.',
      )
    if (b.receiptUrl) {
      const url = new URL(b.receiptUrl)
      if (!['https:', 'http:'].includes(url.protocol))
        throw new Error('Receipt link must be an HTTP(S) URL.')
    }
    const stamp = new Date().toISOString()
    const row: Expense = {
      id: `commercial.expense.${b.date}.${b.requestId}`,
      date: b.date,
      vendor: b.vendor.trim().slice(0, 200),
      amountAud: Math.round(amount * 100) / 100,
      category: b.category.trim().slice(0, 100),
      account: b.account.trim().slice(0, 100),
      reference: b.reference.trim().slice(0, 300),
      receiptUrl: b.receiptUrl?.slice(0, 2000) || '',
      notes: b.notes?.slice(0, 3000) || '',
      createdAt: stamp,
    }
    const { error } = await getPortalAdminClient()
      .from('compass_settings')
      .insert({
        id: row.id,
        value: sealCommercial(row),
        is_secret: 1,
        scope: 'commercial',
        updated_at: stamp,
        mirrored_at: stamp,
      })
    if (error) {
      if (error.code === '23505') {
        const { data: existing, error: readError } =
          await getPortalAdminClient()
            .from('compass_settings')
            .select('value')
            .eq('id', row.id)
            .single()
        if (readError || !existing)
          throw new Error('Unable to verify saved expense.')
        const saved = openCommercial<Expense>(String(existing.value))
        if (
          JSON.stringify({ ...saved, createdAt: '' }) !==
          JSON.stringify({ ...row, createdAt: '' })
        )
          throw new Error(
            'This request already saved different expense details. Reload before recording another expense.',
          )
        return portalJson({ expense: saved })
      }
      throw new Error('Unable to save expense.')
    }
    return portalJson({ expense: row }, { status: 201 })
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : 'Unable to save expense.' },
        { status: 400 },
      )
    )
  }
}
