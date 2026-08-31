import type { NextRequest } from 'next/server'
import Papa from 'papaparse'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  activateReactivationList,
  emitReactivationEvent,
  firstName,
  loadReactivationPack,
  mapReactivationRow,
  runHygiene,
  sampleMessages,
  type ReactivationImportRow,
  type ReactivationListCounts,
  rollupReactivationListCounts,
  resolveBrokerName
} from '@/lib/reactivation'
import { listReactivationPackIds } from '@/lib/reactivation-pack'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

function emptyCounts(): ReactivationListCounts {
  return { imported: 0, rejected: 0, no_consent: 0, eligible: 0 }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const url = new URL(_request.url)
    const listId = url.searchParams.get('listId')

    const clientRes = await supabase
      .from('compass_clients')
      .select('id,name,voice,deal_terms')
      .eq('id', clientId)
      .maybeSingle()
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const brokerName = resolveBrokerName(clientRes.data.name, clientRes.data.deal_terms)

    let listsQuery = supabase
      .from('compass_reactivation_lists')
      .select('id,pack_id,name,status,counts,compliance,activated_at,created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (listId) listsQuery = listsQuery.eq('id', listId)

    const { data: lists, error } = await listsQuery
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })

    const packs = listReactivationPackIds()
    const enriched = []

    for (const list of lists ?? []) {
      const baseCounts = (list.counts ?? emptyCounts()) as ReactivationListCounts
      const counts = await rollupReactivationListCounts(supabase, list.id, baseCounts)
      const consentPct =
        counts.imported > 0
          ? Math.round(((counts.imported - counts.no_consent) / counts.imported) * 100)
          : 0

      let pack
      try {
        pack = loadReactivationPack(list.pack_id)
      } catch {
        pack = null
      }

      const voice = (clientRes.data.voice ?? {}) as Record<string, unknown>
      const samples = pack
        ? sampleMessages(pack, {
            business_name: clientRes.data.name,
            first_name: 'Alex',
            broker_name: brokerName,
            last_job_type: 'plumbing repair',
            published_number: String(voice.published_number ?? voice.twilio_number ?? '')
          })
        : []

      const { data: rejects } = await supabase
        .from('compass_reactivation_contacts')
        .select('id,mobile,name,payload')
        .eq('list_id', list.id)
        .eq('state', 'suppressed')
        .limit(20)

      enriched.push({
        ...list,
        counts,
        consentPct,
        bonus_metric: pack?.bonus_metric ?? null,
        licensee_signoff_required: pack?.compliance_gate.licensee_signoff_required ?? false,
        sampleMessages: samples.filter((s) => s.channel === 'sms').slice(0, 3),
        rejectSample: (rejects ?? []).map((r) => ({
          id: r.id,
          mobile: r.mobile,
          name: r.name,
          reason: (r.payload as Record<string, unknown>)?.reject_reason
        }))
      })
    }

    return portalJsonCached({
      clientId,
      clientName: clientRes.data.name,
      packs,
      lists: enriched
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const clientRes = await supabase.from('compass_clients').select('id,name').eq('id', clientId).maybeSingle()
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const contentType = request.headers.get('content-type') ?? ''
    let packId = ''
    let listName = ''
    let rows: ReactivationImportRow[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      packId = String(form.get('pack_id') ?? '').trim()
      listName = String(form.get('name') ?? '').trim()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return portalJson({ error: 'file_required' }, { status: 400 })
      }
      const text = await file.text()
      const parsed = Papa.parse<ReactivationImportRow>(text, { header: true, skipEmptyLines: true })
      rows = parsed.data
      if (!listName) listName = file.name.replace(/\.csv$/i, '')
    } else {
      const body = (await readBoundedJson(request)) as {
        pack_id?: string
        name?: string
        rows?: ReactivationImportRow[]
      }
      packId = body.pack_id?.trim() ?? ''
      listName = body.name?.trim() ?? `Import ${new Date().toISOString().slice(0, 10)}`
      rows = body.rows ?? []
    }

    if (!packId) return portalJson({ error: 'pack_id_required' }, { status: 400 })
    if (rows.length === 0) return portalJson({ error: 'rows_required' }, { status: 400 })

    const pack = loadReactivationPack(packId)
    const listId = `rlist-${crypto.randomUUID()}`
    const stamp = new Date().toISOString()
    const counts = emptyCounts()
    counts.imported = rows.length

    const seenMobiles = new Set<string>()
    const contactRows: Array<Record<string, unknown>> = []
    const rejectRows: Array<{ mobile: string; reason: string }> = []

    for (const raw of rows) {
      const parsed = mapReactivationRow(raw, pack)
      const result = runHygiene(parsed, pack, seenMobiles)
      if (result.rejected) {
        counts.rejected += 1
        if (
          result.rejected.reason === 'no_consent' ||
          result.rejected.reason === 'invalid_consent_basis'
        ) {
          counts.no_consent += 1
        }
        rejectRows.push({
          mobile: parsed.mobile || '(none)',
          reason: result.rejected.reason
        })
        await emitReactivationEvent(supabase, {
          clientId,
          type:
            result.rejected.reason === 'no_consent' ||
            result.rejected.reason === 'invalid_consent_basis'
              ? 'consent.missing'
              : 'contact.rejected',
          nativeId: `reject-${listId}-${rejectRows.length}`,
          payload: { reason: result.rejected.reason, mobile: parsed.mobile }
        })
        continue
      }

      counts.eligible += 1
      contactRows.push({
        id: `rcontact-${crypto.randomUUID()}`,
        list_id: listId,
        name: result.eligible.name || null,
        mobile: result.eligible.mobile,
        email: result.eligible.email || null,
        last_touch_date: result.eligible.last_touch_date,
        segment: result.eligible.segment,
        consent_basis: result.eligible.consent_proof.basis,
        consent_proof: result.eligible.consent_proof,
        state: 'pending',
        touch_index: 0,
        payload: {
          source: result.eligible.source,
          enquiry_type: result.eligible.enquiry_type,
          first_name: firstName(result.eligible.name)
        },
        created_at: stamp,
        updated_at: stamp
      })
    }

    const { error: listError } = await supabase.from('compass_reactivation_lists').insert({
      id: listId,
      client_id: clientId,
      pack_id: packId,
      name: listName.slice(0, 200),
      status: counts.eligible > 0 ? 'review' : 'uploaded',
      counts,
      created_at: stamp,
      updated_at: stamp
    })
    if (listError) {
      return portalJson({ error: 'create_failed', detail: listError.message }, { status: 400 })
    }

    if (contactRows.length > 0) {
      const { error: contactError } = await supabase.from('compass_reactivation_contacts').insert(contactRows)
      if (contactError) {
        return portalJson({ error: 'contacts_failed', detail: contactError.message }, { status: 400 })
      }
    }

    await emitReactivationEvent(supabase, {
      clientId,
      type: 'list.imported',
      nativeId: listId,
      payload: { pack_id: packId, row_count: rows.length, eligible: counts.eligible, rejected: counts.rejected }
    })

    return portalJson({
      ok: true,
      listId,
      counts,
      rejects: rejectRows,
      consentPct:
        counts.imported > 0
          ? Math.round(((counts.imported - counts.no_consent) / counts.imported) * 100)
          : 0
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('reactivation_pack_not_found')) {
      return portalJson({ error: 'pack_not_found' }, { status: 400 })
    }
    return portalAccessResponse(err) ?? portalJson({ error: 'import_failed', detail: message }, { status: 500 })
  }
}
