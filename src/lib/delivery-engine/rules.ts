import { isOptOut } from './config'
import type { DeliveryContext, DeliveryState, Facts, PendingJob, Slot, Stage, Transition } from './types'

const addHours = (now: string, hours: number) => new Date(Date.parse(now) + hours * 3600_000).toISOString()
const terminal = new Set<Stage>(['won', 'lost', 'invalid'])

/** Extract bounded facts only. No customer text is executed or used as an instruction. */
export function interpret(body: string, state: DeliveryState, suburbs: string[]): { facts: Facts; intent: string; slotIndex?: number } {
  const text = body.trim(); const lower = text.toLowerCase(); const facts: Facts = {}
  if (isOptOut(text)) return { facts, intent: 'stop' }
  if (/\b(?:price|cost|quote amount|rebate|warranty|kilowatt|kw|sizing|technical|finance|discount)\b/i.test(text)) return { facts, intent: 'human' }
  if (/\b(?:human|person|call me|speak to|phone me)\b/i.test(text)) return { facts, intent: 'human' }
  if (/\b(?:reschedule|change (?:the |my )?(?:time|appointment)|can(?:not|'t) make|another (?:time|day))\b/i.test(text)) return { facts, intent: 'reschedule' }
  if (/\bcancel\b/i.test(text)) return { facts, intent: 'cancel' }
  if (/\b(?:not interested|no thanks|no thank you|already sorted|no longer need)\b/i.test(text)) return { facts, intent: 'decline' }
  if (/^(?:option |slot )?[12]$/.test(lower) && state.offeredSlots.length) return { facts, intent: 'choose', slotIndex: Number(lower.slice(-1)) - 1 }
  // Suburb names must be a complete answer; “West Ryde” must not match “Ryde”.
  const namedSuburb = suburbs.find(s => lower.replace(/[.!]$/, '') === s.toLowerCase())
  if (namedSuburb) facts.suburb = namedSuburb
  const suburbLabel = text.match(/(?:^|[,;\n])\s*suburb\s*:\s*([^,;\n]+)/i)
  if (suburbLabel) facts.suburb = suburbLabel[1].trim()
  if (/\b(?:ducted)\b/i.test(text) && /\b(?:replace|replacement|replacing|old|upgrade)\b/i.test(text)) facts.service = 'ducted_replacement'
  if (/\b(?:repair|service only|commercial|refrigeration)\b/i.test(text)) facts.service = 'other'
  if (/\b(?:i own|we own|owner|homeowner|authorised|authorized)\b/i.test(text)) facts.homeowner = true
  if (/\b(?:renting|tenant|not (?:the )?owner|no authority)\b/i.test(text)) facts.homeowner = false
  const time = text.match(/\b(?:today|tomorrow|(?:this|next) (?:week|month)|within \d+ (?:weeks?|months?)|\d+ (?:weeks?|months?))\b/i)
  if (time) facts.timeframe = time[0]
  const address = text.match(/(?:^|[,;\n])\s*address\s*:\s*([^;\n]+)/i)
  if (address) facts.address = address[1].trim().slice(0, 240)
  if (state.awaiting) {
    if (state.awaiting === 'homeowner' && /^(?:yes|no)[.!\s]*$/i.test(text)) facts.homeowner = /^yes/i.test(text)
    if (state.awaiting === 'service' && /^(?:yes|replacement|ducted replacement)[.!\s]*$/i.test(text)) facts.service = 'ducted_replacement'
    if (state.awaiting === 'service' && /^no[.!\s]*$/i.test(text)) facts.service = 'other'
    if (state.awaiting === 'suburb' && /^[a-z '\-]{2,80}$/i.test(text)) facts.suburb = text
    if (state.awaiting === 'timeframe' && text.length >= 3 && text.length <= 120) facts.timeframe = text
    if (state.awaiting === 'address' && /^\d+[a-z]?\s+\S+/i.test(text) && text.length <= 240) facts.address = text
  }
  return { facts, intent: Object.keys(facts).length ? 'answer' : 'unknown' }
}

export function transition(context: DeliveryContext, input?: Record<string, unknown>): Transition {
  const { now, enquiry, account, job } = context
  const state = structuredClone(enquiry.state)
  const result: Transition = { state, jobs: [], events: [] }
  const data = input ?? job.payload
  const enqueue = (kind: PendingJob['kind'], payload: Record<string, unknown>, dueAt = now, key: string = kind, guarded = true) => {
    result.jobs.push({ kind, payload, dueAt, key: `${job.id}:${key}`, guarded })
  }
  const event = (type: string, payload: Record<string, unknown> = {}) => result.events.push({ type, payload })
  const stage = (value: Stage) => { state.stage = value; state.milestones[value] ??= now }
  const say = (body: string) => enqueue('sms', { body: `${account.config.businessName}: ${body} Reply STOP to opt out.` })
  const handoff = (reason: string, acknowledge = true) => {
    result.control = 'human'
    state.handoff = { reason, owner: account.config.owner, dueAt: addHours(now, 2) }
    state.offeredSlots = []; delete state.offersExpireAt
    event('human.handoff', state.handoff)
    // This acknowledgement is sent only while this same handoff still owns the enquiry.
    if (acknowledge) enqueue('sms', { body: `${account.config.businessName}: I’ve passed your request to our office for a callback. Reply STOP to opt out.`, handoffAck: true })
  }
  const followup = () => {
    const offset = account.config.followupHours[state.followups]
    const hours = offset === undefined ? undefined : offset - (account.config.followupHours[state.followups - 1] ?? 0)
    if (hours !== undefined) enqueue('followup', {}, addHours(now, hours), `followup-${state.followups}`)
  }
  const qualify = () => {
    if (state.facts.service && state.facts.service !== account.config.service) {
      stage('invalid'); event('lead.ineligible', { reason: 'service' }); handoff('Enquiry is outside the agreed installation category'); return
    }
    if (state.facts.suburb && !account.config.suburbs.some(s => s.toLowerCase() === state.facts.suburb!.toLowerCase())) {
      stage('invalid'); event('lead.ineligible', { reason: 'service_area' }); handoff('Property is outside the agreed service area'); return
    }
    if (state.facts.homeowner === false) { handoff('Confirm the person has authority to arrange an assessment'); return }
    const questions: Array<[keyof Facts, string]> = [
      ['service', 'Are you looking to replace an existing ducted air-conditioning system?'],
      ['suburb', 'Which suburb is the property in?'],
      ['homeowner', 'Are you the homeowner or authorised to arrange the assessment?'],
      ['timeframe', 'When are you hoping to replace the system?'],
      ['address', 'What is the property’s street address?']
    ]
    const missing = questions.find(([key]) => state.facts[key] === undefined || state.facts[key] === '')
    if (missing) { state.awaiting = missing[0]; say(missing[1]); followup(); return }
    delete state.awaiting
    stage('qualified'); event('lead.qualified', { facts: state.facts })
    enqueue('slots', {})
  }

  if (job.kind === 'intake') {
    event('lead.created', { attribution: enquiry.attribution, demonstration: account.mode === 'demo' })
    if (!enquiry.consent.sms) { handoff('No recorded SMS permission', false); return result }
    qualify(); return result
  }
  if (job.kind === 'message') {
    const body = String(data.body ?? '')
    state.lastInboundAt = now; state.followups = 0
    event('sms.received', { providerId: data.providerId })
    const parsed = interpret(body, state, account.config.suburbs)
    if (data.stop === true || parsed.intent === 'stop') { result.control = 'stopped'; event('contact.opted_out'); return result }
    state.milestones.engaged ??= now
    if (enquiry.control !== 'active') { event('human.reply_received'); return result }
    if (parsed.intent === 'human') { handoff('Homeowner requested a person or asked a commercial/technical question'); return result }
    if (parsed.intent === 'decline') { stage('lost'); result.control = 'human'; event('lead.declined'); return result }
    if (parsed.intent === 'cancel') {
      if (state.appointment?.status === 'confirmed') enqueue('cancel', { appointment: state.appointment }, now, 'cancel', false)
      else handoff('Cancellation requested without a confirmed appointment')
      return result
    }
    if (parsed.intent === 'reschedule') {
      if (state.appointment?.status !== 'confirmed') { handoff('Rescheduling requested without a confirmed appointment'); return result }
      enqueue('slots', { reschedule: true }); return result
    }
    if (parsed.intent === 'choose') {
      const slot = state.offeredSlots[parsed.slotIndex!]
      if (!slot || !state.offersExpireAt || Date.parse(state.offersExpireAt) < Date.parse(now)) {
        state.offeredSlots = []; say('Those options have expired. I’ll check fresh availability.'); enqueue('slots', {}); return result
      }
      stage('booking_pending'); event('booking.selected', { slot })
      enqueue('book', { slot, appointmentId: state.appointment?.status === 'confirmed' ? state.appointment.id : job.id.replace(/-/g, '') }); return result
    }
    if (terminal.has(state.stage)) { handoff('New reply on a closed enquiry'); return result }
    if (state.appointment?.status === 'confirmed' && !state.offeredSlots.length) { handoff('Reply to an existing booking needs office review'); return result }
    if (parsed.intent === 'unknown') {
      if (state.offeredSlots.length) { say('Please reply 1 or 2 to choose an offered assessment time, or ask for a callback.'); followup() }
      else handoff('Could not confidently understand the reply')
      return result
    }
    state.facts = { ...state.facts, ...parsed.facts }; stage('engaged')
    event('qualification.updated', { facts: parsed.facts, source: data.providerId })
    qualify(); return result
  }
  if (job.kind === 'slots') {
    const slots = (data.slots as Slot[]).slice(0, 2)
    if (!slots.length) { handoff('No suitable assessment appointments available'); return result }
    state.offeredSlots = slots; state.offersExpireAt = addHours(now, 1)
    event('booking.offered', { slots, expiresAt: state.offersExpireAt })
    say(`${state.appointment?.status === 'confirmed' ? 'Your current booking stays in place until a new time is confirmed. ' : ''}Assessment options: ${slots.map((s, i) => `${i + 1}: ${s.label}`).join('; ')}. Reply ${slots.length === 1 ? '1' : '1 or 2'}. Options expire in one hour.`)
    followup(); return result
  }
  if (job.kind === 'book') {
    const previous = state.appointment
    state.appointment = data.appointment as DeliveryState['appointment']; state.offeredSlots = []; delete state.offersExpireAt
    stage('booked'); event(previous?.status === 'confirmed' ? 'appointment.rescheduled' : 'appointment.created', { appointment: state.appointment })
    // An inbound STOP/takeover during the provider request cannot undo a booking: retain it for reconciliation, suppress its SMS.
    say(`Your installation assessment is confirmed for ${state.appointment!.slot.label} at ${state.facts.address}. Reply “reschedule” or “cancel appointment” if needed.`)
    const reminderAt = new Date(Date.parse(state.appointment!.slot.start) - 24 * 3600_000).toISOString()
    if (Date.parse(reminderAt) > Date.parse(now)) enqueue('reminder', { appointmentId: state.appointment!.id, start: state.appointment!.slot.start }, reminderAt)
    enqueue('crm', {}, now, 'crm', false); return result
  }
  if (job.kind === 'cancel') {
    if (state.appointment) state.appointment.status = 'cancelled'
    state.offeredSlots = []; stage('qualified'); event('appointment.cancelled')
    say('Your assessment has been cancelled. Reply if you would like the office to arrange another time.')
    enqueue('crm', {}, now, 'crm', false); return result
  }
  if (job.kind === 'followup') {
    if (terminal.has(state.stage) || state.appointment?.status === 'confirmed' || state.followups >= account.config.followupHours.length) return result
    state.followups += 1
    say('Would you still like help arranging your ducted-replacement assessment? Reply here or ask for an office callback.')
    event('followup.queued', { attempt: state.followups }); followup(); return result
  }
  if (job.kind === 'reminder') {
    if (state.appointment?.status !== 'confirmed' || state.appointment.id !== data.appointmentId || state.appointment.slot.start !== data.start || Date.parse(state.appointment.slot.start) <= Date.parse(now)) return result
    say(`A reminder of your installation assessment on ${state.appointment.slot.label}. Reply “reschedule” if needed.`); return result
  }
  if (job.kind === 'operator') {
    const action = data.action
    if (action === 'takeover') handoff(String(data.reason || 'Operator took over'), false)
    if (action === 'resolve') {
      if (state.handoff) state.handoff.resolvedAt = now
      event('human.resolved', { actor: data.actor })
    }
    if (action === 'resume') {
      result.control = 'active'; if (state.handoff) state.handoff.resolvedAt = now
      event('automation.resumed', { actor: data.actor })
      if (!terminal.has(state.stage) && state.appointment?.status !== 'confirmed') qualify()
    }
    if (action === 'send') enqueue('sms', { body: String(data.body), humanSend: true })
    if (action === 'crm_reconciled') {
      state.crm = { status: 'manual_done', reference: String(data.recordId), updatedAt: now, owner: account.config.owner }
      event('crm.manually_reconciled', { recordId: data.recordId, evidence: data.evidence, actor: data.actor })
    }
    return result
  }
  if (job.kind === 'outcome') {
    const value = data.stage as Stage
    validateOutcome(state, data, now)
    stage(value); state.milestones[value] = String(data.occurredAt)
    if (typeof data.value === 'number') { state.outcomeValue = data.value; state.outcomeCurrency = 'AUD' }
    event(`outcome.${value}`, { evidence: data.evidence, actor: data.actor, occurredAt: data.occurredAt, value: data.value })
    enqueue('crm', {}, now, 'crm', false); return result
  }
  return result
}

export function validateOutcome(state: DeliveryState, data: Record<string, unknown>, now: string) {
  const value = data.stage as Stage
  if (!['attended','quoted','won','lost'].includes(value) || !data.evidence || !data.occurredAt) throw new Error('Outcome requires stage, timestamp and evidence')
  const occurredAt = Date.parse(String(data.occurredAt))
  if (!Number.isFinite(occurredAt) || occurredAt > Date.parse(now)) throw new Error('Outcome time must be valid and cannot be in the future')
  if (value !== 'lost' && state.appointment?.status !== 'confirmed') throw new Error('No confirmed assessment to reconcile')
  if (value === 'attended' && occurredAt < Date.parse(state.appointment!.slot.start)) throw new Error('Attendance cannot precede the assessment')
  if (value === 'quoted' && (!state.milestones.attended || occurredAt < Date.parse(state.milestones.attended))) throw new Error('Record attendance before quote')
  if (value === 'won' && (!state.milestones.quoted || occurredAt < Date.parse(state.milestones.quoted))) throw new Error('Record quote before win')
  const order = ['attended','quoted','won']
  if (value !== 'lost' && order.indexOf(value) < order.indexOf(state.stage)) throw new Error('Outcome cannot move backwards')
}

export function nextContactTime(now: string, timezone: string, window: [number, number]): string {
  let cursor = new Date(now)
  for (let i = 0; i < 48 * 60; i++) {
    const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(cursor))
    if (hour >= window[0] && hour < window[1]) return cursor.toISOString()
    cursor = new Date(cursor.getTime() + 60_000)
  }
  throw new Error('Invalid contact window')
}
