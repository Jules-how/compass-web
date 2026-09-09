import { nextContactTime, transition } from './rules'
import { validateAccount, type DeliveryStore } from './store'
import type { DeliveryContext, DeliveryProviders, Slot } from './types'

export class ProviderError extends Error {
  constructor(message: string, readonly uncertain = false, readonly retryable = false) { super(message) }
}

/** One bounded run. The scheduler wakes it; all durable state and leases are in Postgres. */
export async function runDeliveryWorker(options: {
  store: DeliveryStore; providers: DeliveryProviders; accountId?: string; limit?: number
  clock?: () => string; liveEnabled?: boolean; deadline?: number
}): Promise<{ processed: number; failed: number; deferred: number }> {
  const { store, providers } = options
  const clock = options.clock ?? (() => new Date().toISOString())
  const result = { processed: 0, failed: 0, deferred: 0 }
  for (let i = 0; i < Math.min(options.limit ?? 20, 50); i++) {
    if (options.deadline && Date.now() >= options.deadline) break
    const ctx = await store.claim(clock(), options.accountId)
    if (!ctx) break
    let dispatching = false
    try {
      validateAccount(ctx)
      if (ctx.account.mode === 'live' && !options.liveEnabled) {
        await store.finish(ctx, { status: 'pending', dueAt: new Date(Date.parse(clock()) + 300_000).toISOString(), error: 'live_delivery_disabled' }, clock())
        result.deferred++; continue
      }
      if (!await store.gate(ctx, false, clock())) {
        await store.finish(ctx, { status: 'cancelled', error: 'state_or_permission_changed' }, clock()); result.processed++; continue
      }
      const { job, enquiry } = ctx
      if (job.kind === 'sms') {
        const sendNow = clock()
        const sendAt = nextContactTime(sendNow, ctx.account.config.timezone, ctx.account.config.quietHours)
        if (Date.parse(sendAt) > Date.parse(sendNow)) {
          await store.finish(ctx, { status: 'pending', dueAt: sendAt }, clock()); result.deferred++; continue
        }
        // Persist dispatch intent before transport. A timeout/crash is reconciled, never blindly resent.
        if (!await store.gate(ctx, true, clock())) { await store.finish(ctx, { status: 'cancelled', error: 'state_changed_before_send' }, clock()); continue }
        dispatching = true
        const body = String(job.payload.body)
        const sent = await providers.sms(ctx, body)
        const saved = await store.finish(ctx, { message: { ...sent, body }, events: [{ type: 'sms.accepted', payload: { providerId: sent.id } }] }, clock())
        if (!saved) throw new ProviderError('lease_lost_after_send', true)
      } else if (job.kind === 'slots') {
        const slots = await providers.slots(ctx)
        await complete(store, ctx, transition(ctx, { slots }), clock())
      } else if (job.kind === 'book') {
        const slot = job.payload.slot as Slot
        if (!slot || !enquiry.state.offeredSlots.some(s => s.start === slot.start && s.end === slot.end) ||
            !enquiry.state.offersExpireAt || Date.parse(enquiry.state.offersExpireAt) < Date.parse(clock())) throw new ProviderError('slot_offer_expired')
        const bufferedEnd = new Date(Date.parse(slot.end) + ctx.account.config.bufferMinutes * 60_000).toISOString()
        if (!await store.reserve(ctx, slot.start, bufferedEnd, clock())) throw new ProviderError('slot_unavailable')
        if (!await store.gate(ctx, false, clock())) throw new ProviderError('booking_state_changed')
        const appointment = await providers.book(ctx, slot, String(job.payload.appointmentId))
        await complete(store, ctx, transition(ctx, { appointment }), clock())
      } else if (job.kind === 'cancel') {
        const appointment = enquiry.state.appointment
        if (appointment?.status === 'confirmed') await providers.cancel(ctx, appointment)
        await complete(store, ctx, transition(ctx), clock())
      } else if (job.kind === 'crm') {
        const synced = await providers.crm(ctx)
        const state = structuredClone(enquiry.state)
        state.crm = { status: synced.status === 'manual' ? 'manual_pending' : 'synced', reference: synced.id, updatedAt: clock(), owner: ctx.account.config.owner }
        await store.finish(ctx, {
          state,
          crm: ctx.account.mode === 'demo' ? { ...enquiry, externalId: synced.id, demonstration: true } : undefined,
          events: [{ type: synced.status === 'manual' ? 'crm.manual_reconciliation_required' : 'crm.synced', payload: synced }]
        }, clock())
      } else {
        await complete(store, ctx, transition(ctx), clock())
      }
      result.processed++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery_failed'
      const uncertain = dispatching || (error instanceof ProviderError && error.uncertain)
      const retry = !uncertain && error instanceof ProviderError && error.retryable && ctx.job.attempts < 4
      if (retry) {
        await store.finish(ctx, { status: 'pending', error: message, dueAt: new Date(Date.parse(clock()) + 60_000 * 2 ** ctx.job.attempts).toISOString() }, clock())
        result.deferred++
      } else {
        const state = structuredClone(ctx.enquiry.state)
        state.handoff = { reason: `${uncertain ? 'Uncertain provider result' : 'Delivery action failed'}: ${message}`, owner: ctx.account.config.owner, dueAt: clock() }
        await store.finish(ctx, { state, control: 'human', status: uncertain ? 'uncertain' : 'failed', error: message,
          events: [{ type: 'delivery.exception', payload: { jobId: ctx.job.id, reason: message, uncertain } }] }, clock())
        result.failed++
      }
    }
  }
  return result
}

async function complete(store: DeliveryStore, ctx: DeliveryContext, result: ReturnType<typeof transition>, now: string) {
  if (!await store.finish(ctx, result, now)) throw new ProviderError('lease_lost_before_commit', ctx.job.kind === 'book' || ctx.job.kind === 'cancel')
}
