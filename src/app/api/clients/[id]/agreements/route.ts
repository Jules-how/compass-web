import { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/portal-http'
import {
  agreementUrl,
  cardConfigured,
  confirmBankPayment,
  createAgreement,
  ensureSigningTasks,
  getAgreement,
  listAgreements,
  refreshPayment,
  revokeAgreement,
} from '@/lib/agreement-server'
import { getActiveOfferRevision } from '@/lib/offer-revisions'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
async function authorise(id: string) {
  const { supabase } = await requirePortalAccess({ operator: true })
  const { data, error } = await supabase
    .from('compass_clients')
    .select('id,name')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) throw new Error('Client not found.')
  return data
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params
    await authorise(id)
    const records = await listAgreements(id)
    return portalJson({
      agreements: records.map((r) => ({
        ...r,
        url: agreementUrl(r, request.nextUrl.origin),
      })),
      cardConfigured: cardConfigured(),
    })
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        {
          error: e instanceof Error ? e.message : 'Unable to load agreements.',
        },
        { status: 400 },
      )
    )
  }
}
export async function POST(request: NextRequest, context: Context) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    const { id } = await context.params
    await authorise(id)
    const body = (await readBoundedJson(request)) as {
      action?: string
      agreementId?: string
      terms?: unknown
      reference?: string
    }
    if (body.action === 'create') {
      const { supabase } = await requirePortalAccess({ operator: true })
      const record = await createAgreement(id, body.terms, await getActiveOfferRevision(supabase))
      return portalJson(
        {
          agreement: {
            ...record,
            url: agreementUrl(record, request.nextUrl.origin),
          },
        },
        { status: 201 },
      )
    }
    if (!body.agreementId) throw new Error('Choose an agreement.')
    let record = await getAgreement(body.agreementId)
    if (record.clientId !== id)
      throw new Error('Agreement does not belong to this client.')
    if (body.action === 'revoke') record = await revokeAgreement(record)
    else if (body.action === 'bank_paid')
      record = await confirmBankPayment(record, body.reference || '')
    else if (body.action === 'refresh') {
      record = await refreshPayment(record)
      await ensureSigningTasks(record)
    } else throw new Error('Unknown agreement action.')
    return portalJson({ agreement: record })
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        {
          error: e instanceof Error ? e.message : 'Unable to update agreement.',
        },
        { status: 400 },
      )
    )
  }
}
