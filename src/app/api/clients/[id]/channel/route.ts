import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { CLIENT_AD_SPEND_COLUMNS, CLIENT_CHANNEL_NOTE_COLUMNS, CLIENT_OFFER_COLUMNS } from '@/lib/list-columns'
import { nowIso, recordClientActivity } from '@/lib/client-data'
import {
  CLIENT_CHANNELS,
  CLIENT_OFFER_STATUSES,
  type ClientChannel,
  type ClientOfferStatus
} from '@/lib/client-pm'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

function normalizeChannel(value: string | null | undefined, fallback: ClientChannel = 'meta'): ClientChannel {
  if (value && (CLIENT_CHANNELS as readonly string[]).includes(value)) {
    return value as ClientChannel
  }
  return fallback
}

function normalizeOfferStatus(value: string | null | undefined): ClientOfferStatus {
  if (value && (CLIENT_OFFER_STATUSES as readonly string[]).includes(value)) {
    return value as ClientOfferStatus
  }
  return 'draft'
}

async function assertClient(supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'], clientId: string) {
  const res = await supabase.from('compass_clients').select('id').eq('id', clientId).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return Boolean(res.data)
}

export async function POST(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: {
    kind?: 'offer' | 'ad_spend' | 'note'
    channel?: string
    title?: string
    description?: string | null
    status?: string
    amount?: number | null
    currency?: string
    spend_date?: string
    campaign_name?: string | null
    notes?: string | null
    body?: string
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const kind = body.kind
  if (!kind) return portalJson({ error: 'kind_required' }, { status: 400 })

  const stamp = nowIso()
  const channel = normalizeChannel(body.channel, kind === 'note' ? 'other' : 'meta')

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    if (!(await assertClient(supabase, clientId))) {
      return portalJson({ error: 'not_found' }, { status: 404 })
    }

    if (kind === 'offer') {
      const title = body.title?.trim()
      if (!title) return portalJson({ error: 'title_required' }, { status: 400 })
      const row = {
        id: `coffer-${crypto.randomUUID()}`,
        client_id: clientId,
        channel,
        title,
        description: body.description?.trim() || null,
        status: normalizeOfferStatus(body.status),
        amount: typeof body.amount === 'number' ? body.amount : null,
        currency: body.currency?.trim() || 'AUD',
        created_at: stamp,
        updated_at: stamp
      }
      const { data, error } = await supabase
        .from('compass_client_offers')
        .insert(row)
        .select(CLIENT_OFFER_COLUMNS)
        .single()
      if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'offer_created',
        body: `Added ${channel} offer: ${title}`
      })
      return portalJson(data, { status: 201 })
    }

    if (kind === 'ad_spend') {
      const spendDate = body.spend_date?.trim()
      if (!spendDate) return portalJson({ error: 'spend_date_required' }, { status: 400 })
      if (channel !== 'meta' && channel !== 'google') {
        return portalJson({ error: 'invalid_channel' }, { status: 400 })
      }
      const row = {
        id: `cspend-${crypto.randomUUID()}`,
        client_id: clientId,
        channel,
        spend_date: spendDate,
        amount: typeof body.amount === 'number' ? body.amount : 0,
        currency: body.currency?.trim() || 'AUD',
        campaign_name: body.campaign_name?.trim() || null,
        notes: body.notes?.trim() || null,
        created_at: stamp,
        updated_at: stamp
      }
      const { data, error } = await supabase
        .from('compass_client_ad_spend')
        .insert(row)
        .select(CLIENT_AD_SPEND_COLUMNS)
        .single()
      if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'ad_spend_logged',
        body: `Logged ${channel} spend on ${spendDate}`
      })
      return portalJson(data, { status: 201 })
    }

    const noteBody = body.body?.trim()
    if (!noteBody) return portalJson({ error: 'body_required' }, { status: 400 })
    const row = {
      id: `cnote-${crypto.randomUUID()}`,
      client_id: clientId,
      channel,
      body: noteBody,
      created_at: stamp
    }
    const { data, error } = await supabase
      .from('compass_client_channel_notes')
      .insert(row)
      .select(CLIENT_CHANNEL_NOTE_COLUMNS)
      .single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    await recordClientActivity(supabase, {
      clientId,
      action: 'channel_note',
      body: noteBody
    })
    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: {
    kind?: 'offer' | 'ad_spend'
    id?: string
    title?: string
    description?: string | null
    status?: string
    amount?: number | null
    currency?: string
    spend_date?: string
    campaign_name?: string | null
    notes?: string | null
    channel?: string
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const kind = body.kind
  const rowId = body.id?.trim()
  if (!kind || !rowId) return portalJson({ error: 'id_required' }, { status: 400 })
  const stamp = nowIso()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    if (kind === 'offer') {
      const patch: Record<string, unknown> = { updated_at: stamp }
      if (typeof body.title === 'string') {
        const title = body.title.trim()
        if (!title) return portalJson({ error: 'title_required' }, { status: 400 })
        patch.title = title
      }
      if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        patch.description = body.description?.trim() || null
      }
      if (typeof body.status === 'string') patch.status = normalizeOfferStatus(body.status)
      if (Object.prototype.hasOwnProperty.call(body, 'amount')) {
        patch.amount = typeof body.amount === 'number' ? body.amount : null
      }
      if (typeof body.currency === 'string') patch.currency = body.currency.trim() || 'AUD'
      if (typeof body.channel === 'string') patch.channel = normalizeChannel(body.channel)

      const { data, error } = await supabase
        .from('compass_client_offers')
        .update(patch)
        .eq('id', rowId)
        .eq('client_id', clientId)
        .select(CLIENT_OFFER_COLUMNS)
        .maybeSingle()
      if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
      if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
      await recordClientActivity(supabase, {
        clientId,
        action: 'offer_updated',
        body: `Updated offer: ${data.title}`
      })
      return portalJson(data)
    }

    const patch: Record<string, unknown> = { updated_at: stamp }
    if (typeof body.spend_date === 'string') patch.spend_date = body.spend_date
    if (typeof body.amount === 'number') patch.amount = body.amount
    if (typeof body.currency === 'string') patch.currency = body.currency.trim() || 'AUD'
    if (Object.prototype.hasOwnProperty.call(body, 'campaign_name')) {
      patch.campaign_name = body.campaign_name?.trim() || null
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
      patch.notes = body.notes?.trim() || null
    }
    if (typeof body.channel === 'string') {
      const channel = normalizeChannel(body.channel)
      if (channel !== 'meta' && channel !== 'google') {
        return portalJson({ error: 'invalid_channel' }, { status: 400 })
      }
      patch.channel = channel
    }

    const { data, error } = await supabase
      .from('compass_client_ad_spend')
      .update(patch)
      .eq('id', rowId)
      .eq('client_id', clientId)
      .select(CLIENT_AD_SPEND_COLUMNS)
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })
    await recordClientActivity(supabase, {
      clientId,
      action: 'ad_spend_updated',
      body: `Updated ${data.channel} spend on ${data.spend_date}`
    })
    return portalJson(data)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id: clientId } = await context.params

  let body: { kind?: 'offer' | 'ad_spend' | 'note'; id?: string }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const kind = body.kind
  const rowId = body.id?.trim()
  if (!kind || !rowId) return portalJson({ error: 'id_required' }, { status: 400 })

  const table =
    kind === 'offer'
      ? 'compass_client_offers'
      : kind === 'ad_spend'
        ? 'compass_client_ad_spend'
        : 'compass_client_channel_notes'

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { error } = await supabase.from(table).delete().eq('id', rowId).eq('client_id', clientId)
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    await recordClientActivity(supabase, {
      clientId,
      action: `${kind}_deleted`,
      body: `Deleted ${kind.replace('_', ' ')}`
    })
    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
