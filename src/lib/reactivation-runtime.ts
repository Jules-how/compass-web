import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  classifyInboundReply,
  clientTimezone,
  computeNextTouchAt,
  contactHasOutboundThisMonth,
  countClientMonthlyNewTouches,
  emitCapReachedEvent,
  emitReactivationEvent,
  monthBoundsInTimezone,
  renderReactivationTemplate,
  resolveBrokerName,
  firstName
} from '@/lib/reactivation'
import { loadReactivationPack } from '@/lib/reactivation-pack'
import { isSmsSuppressed, sendTwilioSms, suppressSms } from '@/lib/voice-twilio'

export type ReactivationSyncResult = {
  ok: boolean
  listsProcessed: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

function isWithinQuietHours(
  now: Date,
  quietHours: { start: string; end: string },
  timezone: string
): boolean {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const current = hour * 60 + minute
  const [sh, sm] = quietHours.start.split(':').map(Number)
  const [eh, em] = quietHours.end.split(':').map(Number)
  const start = sh * 60 + (sm || 0)
  const end = eh * 60 + (em || 0)
  return current >= start && current < end
}

export async function syncReactivationLists(
  supabase: SupabaseClient
): Promise<ReactivationSyncResult> {
  const result: ReactivationSyncResult = {
    ok: true,
    listsProcessed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: []
  }

  const { data: lists, error } = await supabase
    .from('compass_reactivation_lists')
    .select('id,client_id,pack_id,status,activated_at')
    .eq('status', 'active')

  if (error) {
    result.ok = false
    result.errors.push(error.message)
    return result
  }

  const capEmittedToday = new Set<string>()
  const monthlyCountByClient = new Map<string, number>()

  for (const list of lists ?? []) {
    result.listsProcessed += 1
    let pack
    try {
      pack = loadReactivationPack(list.pack_id)
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
      result.ok = false
      continue
    }

    const { data: client } = await supabase
      .from('compass_clients')
      .select('id,name,voice,deal_terms')
      .eq('id', list.client_id)
      .maybeSingle()
    if (!client) continue

    const voice = (client.voice ?? {}) as Record<string, unknown>
    const twilioNumber = String(voice.twilio_number ?? '').trim()
    if (!twilioNumber) {
      result.skipped += 1
      continue
    }

    const timezone = clientTimezone(voice)
    const now = new Date()
    const cap = pack.caps.monthly_contact_cap ?? 1000
    const { start: monthStart, end: monthEnd } = monthBoundsInTimezone(timezone, now)

    if (!monthlyCountByClient.has(list.client_id)) {
      monthlyCountByClient.set(
        list.client_id,
        await countClientMonthlyNewTouches(supabase, list.client_id, timezone, now)
      )
    }
    let monthlyNewTouches = monthlyCountByClient.get(list.client_id) ?? 0

    if (!isWithinQuietHours(now, pack.quiet_hours, timezone)) {
      result.skipped += 1
      continue
    }

    const { data: contacts } = await supabase
      .from('compass_reactivation_contacts')
      .select('id,name,mobile,email,touch_index,next_touch_at,payload,consent_basis')
      .eq('list_id', list.id)
      .eq('state', 'enrolled')
      .lte('next_touch_at', now.toISOString())
      .limit(50)

    for (const contact of contacts ?? []) {
      const touchIndex = contact.touch_index ?? 0
      const touch = pack.sequence.find((t) => t.touch_index === touchIndex)
      if (!touch) {
        await supabase
          .from('compass_reactivation_contacts')
          .update({ state: 'done', updated_at: now.toISOString() })
          .eq('id', contact.id)
        continue
      }

      if (touch.channel !== 'sms') {
        result.skipped += 1
        continue
      }

      const isMidSequence = touchIndex > 0
      const alreadyTouchedThisMonth = isMidSequence
        ? true
        : await contactHasOutboundThisMonth(supabase, contact.id, monthStart, monthEnd)

      if (!isMidSequence && !alreadyTouchedThisMonth && monthlyNewTouches >= cap) {
        if (!capEmittedToday.has(list.id)) {
          await emitCapReachedEvent(supabase, {
            clientId: list.client_id,
            listId: list.id,
            timezone,
            cap,
            count: monthlyNewTouches,
            now
          })
          capEmittedToday.add(list.id)
        }
        result.skipped += 1
        continue
      }

      if (await isSmsSuppressed(supabase, list.client_id, contact.mobile)) {
        await supabase
          .from('compass_reactivation_contacts')
          .update({ state: 'suppressed', updated_at: now.toISOString() })
          .eq('id', contact.id)
        result.skipped += 1
        continue
      }

      const payload = (contact.payload ?? {}) as Record<string, string>
      const brokerName = resolveBrokerName(client.name, client.deal_terms)
      const vars: Record<string, string> = {
        business_name: client.name,
        first_name: firstName(contact.name ?? ''),
        broker_name: payload.broker_name ?? brokerName,
        last_job_type: payload.enquiry_type ?? payload.last_job_type ?? 'your last job',
        published_number: String(voice.published_number ?? twilioNumber)
      }

      const body = renderReactivationTemplate(touch.template, vars)
      const sendResult = await sendTwilioSms({
        to: contact.mobile,
        from: twilioNumber,
        body
      })

      const msgId = `rmsg-${crypto.randomUUID()}`
      await supabase.from('compass_reactivation_messages').insert({
        id: msgId,
        contact_id: contact.id,
        direction: 'outbound',
        channel: 'sms',
        body,
        template_id: touch.template_id,
        sent_at: now.toISOString(),
        twilio_sid: sendResult.sid ?? null,
        status: sendResult.ok ? 'sent' : 'failed'
      })

      if (!sendResult.ok) {
        result.failed += 1
        result.errors.push(sendResult.error ?? 'send_failed')
        continue
      }

      if (touchIndex === 0 && !alreadyTouchedThisMonth) {
        monthlyNewTouches += 1
        monthlyCountByClient.set(list.client_id, monthlyNewTouches)
      }

      await emitReactivationEvent(supabase, {
        clientId: list.client_id,
        type: 'message.sent',
        nativeId: msgId,
        payload: {
          list_id: list.id,
          contact_id: contact.id,
          channel: 'sms',
          template_id: touch.template_id,
          touch_index: touchIndex
        }
      })

      const nextIndex = touchIndex + 1
      const nextTouch = pack.sequence.find((t) => t.touch_index === nextIndex)
      const baseDate = list.activated_at ? new Date(list.activated_at) : now

      if (!nextTouch) {
        await supabase
          .from('compass_reactivation_contacts')
          .update({
            touch_index: nextIndex,
            state: 'done',
            next_touch_at: null,
            last_event_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('id', contact.id)
      } else {
        const nextAt = computeNextTouchAt({
          baseDate,
          dayOffset: nextTouch.day_offset,
          quietHours: pack.quiet_hours,
          timezone
        })
        await supabase
          .from('compass_reactivation_contacts')
          .update({
            touch_index: nextIndex,
            next_touch_at: nextAt.toISOString(),
            last_event_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('id', contact.id)
      }

      result.sent += 1
    }
  }

  if (result.errors.length > 0 && result.sent === 0) result.ok = false
  return result
}

export async function handleReactivationInboundSms(
  supabase: SupabaseClient,
  input: {
    from: string
    to: string
    body: string
    twilioSid?: string
  }
): Promise<{ handled: boolean; reason?: string }> {
  const { data: clients } = await supabase
    .from('compass_clients')
    .select('id,name,voice')
    .not('voice', 'is', null)

  const match = (clients ?? []).find((c) => {
    const voice = (c.voice ?? {}) as Record<string, unknown>
    return String(voice.twilio_number ?? '').trim() === input.to.trim()
  })
  if (!match) return { handled: false, reason: 'unknown_number' }

  const { data: contacts } = await supabase
    .from('compass_reactivation_contacts')
    .select('id,list_id,name,mobile,state')
    .eq('mobile', input.from)
    .in('state', ['enrolled', 'pending', 'replied'])
    .order('updated_at', { ascending: false })
    .limit(5)

  const contact = (contacts ?? []).find((c) => c.mobile === input.from)
  if (!contact) return { handled: false, reason: 'no_contact' }

  const { data: list } = await supabase
    .from('compass_reactivation_lists')
    .select('id,client_id,pack_id')
    .eq('id', contact.list_id)
    .maybeSingle()
  if (!list || list.client_id !== match.id) return { handled: false, reason: 'list_mismatch' }

  const pack = loadReactivationPack(list.pack_id)
  const now = new Date().toISOString()
  const replyClass = classifyInboundReply(input.body, pack)

  await supabase.from('compass_reactivation_messages').insert({
    id: `rmsg-${crypto.randomUUID()}`,
    contact_id: contact.id,
    direction: 'inbound',
    channel: 'sms',
    body: input.body,
    template_id: null,
    sent_at: now,
    twilio_sid: input.twilioSid ?? null,
    status: 'received'
  })

  if (replyClass === 'stop') {
    await suppressSms(supabase, match.id, input.from, 'stop')
    await supabase
      .from('compass_reactivation_contacts')
      .update({ state: 'opted_out', next_touch_at: null, last_event_at: now, updated_at: now })
      .eq('id', contact.id)

    await emitReactivationEvent(supabase, {
      clientId: match.id,
      type: 'optout.honoured',
      nativeId: `optout-${contact.id}-${Date.now()}`,
      payload: { contact_id: contact.id, phone: input.from }
    })

    const voice = (match.voice ?? {}) as Record<string, unknown>
    const ack = renderReactivationTemplate(pack.stop_ack_template, {
      business_name: match.name,
      published_number: String(voice.published_number ?? input.to)
    })
    await sendTwilioSms({ to: input.from, from: input.to, body: ack })
    return { handled: true }
  }

  await supabase
    .from('compass_reactivation_contacts')
    .update({ state: 'replied', next_touch_at: null, last_event_at: now, updated_at: now })
    .eq('id', contact.id)

  const rule = pack.escalation_rules[replyClass] ?? pack.escalation_rules.default
  await emitReactivationEvent(supabase, {
    clientId: match.id,
    type: rule.event,
    nativeId: `reply-${contact.id}-${Date.now()}`,
    payload: {
      contact_id: contact.id,
      reply_class: replyClass,
      body: input.body.slice(0, 500)
    }
  })

  if (replyClass === 'book') {
    await emitReactivationEvent(supabase, {
      clientId: match.id,
      type: 'booking.requested',
      nativeId: `book-req-${contact.id}-${Date.now()}`,
      payload: { contact_id: contact.id, body: input.body.slice(0, 500) }
    })
  }

  if (rule.action === 'escalate') {
    const title = `${rule.task_title ?? 'Reactivation reply'} — ${match.name} / ${contact.name ?? contact.mobile}`
    await supabase.rpc('portal_operator_create_task_mutation', {
      p_task: {
        title: title.slice(0, 240),
        status: 'not-started',
        priority: rule.priority === 'urgent' ? 1 : 3,
        source: 'reactivation',
        notes: input.body.slice(0, 2000)
      }
    })
  }

  return { handled: true }
}
