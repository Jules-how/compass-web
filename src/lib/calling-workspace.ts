import { z } from 'zod'
import { dayKey, isOpen, localDateTimeToIso, restrictionReason, rhythmCommand, type RhythmCommand, type RhythmLead, type RhythmTask, type RhythmTouch } from '@/lib/outbound-rhythm'

export type CallingDetail = { lead: RhythmLead; tasks: RhythmTask[]; touches: RhythmTouch[]; historyLimit?: number }
export type CallingQueue = { leads: RhythmLead[]; tasks: RhythmTask[]; touches: RhythmTouch[]; partial: boolean; checkedAt: string }
export const CALLING_DRAFT_PREFIX = 'compass.calling.draft.v1:'
export const CALLING_ZONES = ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart']
export const callingDraftSchema = z.object({
  note: z.string().max(4000).default(''), outcome: z.string().default(''), person: z.string().max(250).default(''),
  disposition: z.enum(['unresolved', 'schedule', 'closed']).default('unresolved'),
  title: z.string().max(250).default(''), due: z.string().default(''), timezone: z.string().default(''),
  nextChannel: z.enum(['call', 'email', 'sms', 'other']).default('call'), agreed: z.boolean().default(false),
  smsBasis: z.string().max(1000).default(''), restriction: z.enum(['all', 'call', 'email', 'sms', 'unknown']).default('unknown'),
  completeTask: z.string().default(''), additional: z.boolean().default(false),
})
export type CallingDraft = z.infer<typeof callingDraftSchema>
export function newCallingDraft(lead?: RhythmLead): CallingDraft {
  return callingDraftSchema.parse({ timezone: lead?.rhythm_timezone || '' })
}
export function hasCallingDraft(draft: CallingDraft) {
  return Boolean(draft.note || draft.outcome || draft.person || draft.title || draft.due || draft.completeTask || draft.additional || draft.disposition !== 'unresolved')
}
export function parseStoredCallingDraft(raw: string | null, leadId: string): { draft: CallingDraft; pending: RhythmCommand | null } | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    const draft = callingDraftSchema.parse(value.draft)
    const pending = value.pending ? rhythmCommand.parse(value.pending) : null
    if (pending && (pending.operation !== 'capture' || pending.lead_id !== leadId)) return null
    return { draft, pending }
  } catch { return null }
}
export function callBlockReason(lead: RhythmLead) {
  if (lead.is_archived) return 'This contact is archived.'
  if (['fail', 'skip'].includes(lead.icp_status || '')) return 'Review installation fit before calling.'
  const restricted = restrictionReason(lead, 'call')
  if (restricted) return restricted
  const phone = String(lead.phone || '').replace(/[^+0-9]/g, '')
  if (!/^\+?\d{6,15}$/.test(phone)) return 'Review the saved phone number before calling.'
  return null
}
export function callingPhone(value: string | null | undefined) {
  if (!value) return 'Phone not recorded'
  const digits = value.replace(/[^0-9]/g, '').replace(/^61(?=\d{9}$)/, '0')
  if (/^04\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  if (/^0[2378]\d{8}$/.test(digits)) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6)}`
  if (/^1[38]00\d{6}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  return value
}
export function callingQueueStatus(lead: RhythmLead, tasks: RhythmTask[], touches: RhythmTouch[], now = new Date()) {
  const blocked = callBlockReason(lead)
  if (blocked) return { kind: 'held', label: blocked }
  const today = dayKey(now)
  if (touches.some(t => t.contact_id === lead.id && t.channel === 'call' && t.direction === 'outbound' && t.outcome !== 'next_step' && dayKey(t.contacted_at) === today)) return { kind: 'done', label: 'Called today' }
  if (tasks.some(t => t.lead_id === lead.id && t.outreach_channel === 'call' && isOpen(t))) return { kind: 'followup', label: 'Follow-up' }
  if (lead.rhythm_disposition === 'closed') return { kind: 'closed', label: 'No next action' }
  return { kind: 'ready', label: lead.rhythm_last_interaction_at || lead.last_outbound_at ? 'Previously contacted' : 'Ready to call' }
}
export function sortedCallingQueue(data: CallingQueue, now = new Date()) {
  const rank = (lead: RhythmLead) => {
    const s = callingQueueStatus(lead, data.tasks, data.touches, now)
    if (s.kind === 'held' || s.kind === 'closed') return 4
    if (s.kind === 'done') return 3
    if (data.tasks.some(t => t.lead_id === lead.id && t.outreach_channel === 'call' && isOpen(t) && t.outreach_state === 'accepted' && t.due && new Date(t.due) <= now)) return 0
    return s.kind === 'followup' ? 1 : 2
  }
  return [...data.leads].sort((a, b) => rank(a) - rank(b) || (a.company || a.name || '').localeCompare(b.company || b.name || ''))
}
export function nextCallingLead(data: CallingQueue, candidateIds: string[], now = new Date()) {
  return candidateIds.map(id => data.leads.find(lead => lead.id === id)).find(lead => lead && ['ready', 'followup'].includes(callingQueueStatus(lead, data.tasks, data.touches, now).kind))
}
export function callingMetrics(touches: RhythmTouch[], now = new Date()) {
  const day = dayKey(now)
  const calls = touches.filter(t => t.channel === 'call' && t.direction === 'outbound' && t.outcome !== 'next_step' && dayKey(t.contacted_at) === day)
  return { attempts: calls.length, conversations: calls.filter(t => t.outcome === 'decision_maker').length, meetings: calls.filter(t => t.outcome === 'meeting_agreed').length }
}
export function callingCapture(detail: CallingDetail, draft: CallingDraft, requestId: string, occurredAt: string): RhythmCommand {
  if (!draft.outcome) throw new Error('Choose the actual call outcome.')
  if (draft.disposition === 'schedule' && !draft.title.trim()) throw new Error('Add the next action you agreed or proposed.')
  if (draft.outcome === 'do_not_contact' && (draft.disposition === 'schedule' || (draft.disposition !== 'closed' && draft.title.trim()))) throw new Error('Save the contact restriction before scheduling another action.')
  const task = draft.completeTask ? detail.tasks.find(t => t.id === draft.completeTask && isOpen(t)) : null
  if (draft.completeTask && !task) throw new Error('That follow-up changed. Reload the contact and review the open actions.')
  const next = draft.disposition !== 'closed' && draft.title.trim() ? {
    title: draft.title.trim(), channel: draft.nextChannel, reason: draft.note.slice(0, 2000), timezone: draft.timezone,
    ...(draft.due ? { due: localDateTimeToIso(draft.due, draft.timezone) } : {}),
    state: draft.agreed && draft.due ? 'accepted' as const : 'proposed' as const,
    ...(draft.nextChannel === 'sms' ? { sms_basis: draft.smsBasis } : {}),
  } : undefined
  return rhythmCommand.parse({
    operation: 'capture', lead_id: detail.lead.id, revision: detail.lead.rhythm_revision,
    request_id: requestId, occurred_at: occurredAt, channel: 'call', direction: 'outbound', outcome: draft.outcome,
    note: draft.note, person_reached: draft.person, disposition: next?.due ? 'schedule' : draft.disposition,
    ...(draft.outcome === 'do_not_contact' ? { restriction: draft.restriction } : {}),
    ...(next ? { next } : {}),
    ...(task ? { task_id: task.id, expected_updated_at: task.updated_at, complete_task: true } : {}),
    additional: draft.additional,
  })
}
export type CallingFact = { kind: string; claim: string; url: string | null }
export function safeCallingUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : null } catch { return null }
}
/** Retain source claims verbatim; never manufacture profile estimates from industry averages. */
export function callingFacts(value: unknown): CallingFact[] {
  if (typeof value === 'string') {
    try { return callingFacts(JSON.parse(value)) } catch { return value.trim() ? [{ kind: 'Research', claim: value, url: null }] : [] }
  }
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const claim = typeof row.claim === 'string' ? row.claim : typeof row.text === 'string' ? row.text : ''
    return claim ? [{ kind: String(row.kind || 'Research').replaceAll('_', ' '), claim, url: safeCallingUrl(row.url || row.source_url) }] : []
  }).slice(0, 24)
  return Object.entries(value).flatMap(([key, item]) => {
    if (typeof item === 'string' && item.trim()) return [{ kind: key.replaceAll('_', ' '), claim: item, url: null }]
    if (item && typeof item === 'object' && !Array.isArray(item)) return callingFacts([{ kind: key, ...item }])
    return []
  }).slice(0, 24)
}
