import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  inboxIdentityKey,
  newTriageId,
  parseInboxChannel,
  parseInboxTriage,
  parseLeadLifecycle,
  type InboxChannel,
  type InboxTriageState,
  type LeadLifecycleStatus
} from '@/lib/inbox-triage'

export const dynamic = 'force-dynamic'

type TriageBody = {
  channel?: string
  sourceId?: string
  triage?: string
  snoozedUntil?: string | null
  identityKey?: string | null
  email?: string | null
  phone?: string | null
  /** Optional lead lifecycle update (leads channel only). */
  lifecycle?: string
}

function snoozeDefaultIso(hours = 24): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

export async function PATCH(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: TriageBody
  try {
    body = (await readBoundedJson(request)) as TriageBody
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const channel = parseInboxChannel(body.channel)
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : ''
  const triage = parseInboxTriage(body.triage)
  if (!channel || !sourceId || !triage) {
    return portalJson({ error: 'invalid_triage' }, { status: 400 })
  }

  let snoozedUntil: string | null = null
  if (triage === 'snoozed') {
    const raw = body.snoozedUntil
    if (typeof raw === 'string' && raw.trim()) {
      const ts = Date.parse(raw)
      if (Number.isNaN(ts)) return portalJson({ error: 'invalid_snoozed_until' }, { status: 400 })
      snoozedUntil = new Date(ts).toISOString()
    } else {
      snoozedUntil = snoozeDefaultIso(24)
    }
  }

  const identityKey =
    (typeof body.identityKey === 'string' && body.identityKey.trim()) ||
    inboxIdentityKey(body.email, body.phone)

  const lifecycle =
    channel === 'leads' && body.lifecycle != null ? parseLeadLifecycle(body.lifecycle) : null
  if (body.lifecycle != null && channel === 'leads' && !lifecycle) {
    return portalJson({ error: 'invalid_lifecycle' }, { status: 400 })
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const now = new Date().toISOString()
    const row = {
      id: newTriageId(channel, sourceId),
      channel,
      source_id: sourceId,
      triage,
      snoozed_until: snoozedUntil,
      identity_key: identityKey,
      updated_at: now
    }

    const { data, error } = await supabase
      .from('portal_inbox_triage')
      .upsert(row, { onConflict: 'channel,source_id' })
      .select('id,channel,source_id,triage,snoozed_until,identity_key,updated_at,created_at')
      .single()

    if (error) {
      return portalJson({ error: 'triage_failed', detail: error.message }, { status: 400 })
    }

    let leadLifecycle: LeadLifecycleStatus | null = null
    if (lifecycle) {
      // Discarding a lead also marks triage done.
      const nextTriage: InboxTriageState = lifecycle === 'discarded' ? 'done' : triage
      if (nextTriage !== triage) {
        await supabase
          .from('portal_inbox_triage')
          .upsert(
            {
              ...row,
              triage: nextTriage,
              snoozed_until: null,
              updated_at: now
            },
            { onConflict: 'channel,source_id' }
          )
      }

      const { data: lead, error: leadError } = await supabase
        .from('portal_inbound_leads')
        .update({
          lifecycle_status: lifecycle,
          lifecycle_updated_at: now
        })
        .eq('id', sourceId)
        .select('id,lifecycle_status,lifecycle_updated_at')
        .maybeSingle()

      if (leadError) {
        return portalJson({ error: 'lifecycle_failed', detail: leadError.message }, { status: 400 })
      }
      if (lead) {
        leadLifecycle = lifecycle
      }
    }

    return portalJson({
      ok: true,
      triage: data,
      lifecycle: leadLifecycle
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'triage_failed' }, { status: 500 })
  }
}

/** Convenience POST alias for clients that prefer POST. */
export async function POST(request: NextRequest) {
  return PATCH(request)
}

export type { InboxChannel, InboxTriageState }
