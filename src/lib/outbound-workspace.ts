import type { CompassTask } from '@/lib/types'
import type { OutboundOverview, NextAction } from '@/lib/outbound-overview-core'
import { callingQueueStatus, sortedCallingQueue, type CallingQueue } from '@/lib/calling-workspace'
import { dayKey, isOpen, OUTCOMES, type RhythmLead } from '@/lib/outbound-rhythm'

export const OUTBOUND_TASK_SOURCE = 'compass-outbound'
export const workspaceCompany = (lead: RhythmLead) => lead.company || lead.name || 'Unnamed business'
export function workspaceDue(value: string | null | undefined, now = new Date()) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unscheduled'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(value)
  const today = dayKey(now)
  return date < today ? 'Overdue' : date === today ? 'Today' : 'Upcoming'
}
export function workspaceCalls(data: CallingQueue, now = new Date()) {
  return sortedCallingQueue(data, now).map(lead => {
    const status = callingQueueStatus(lead, data.tasks, data.touches, now)
    const task = data.tasks.filter(t => t.lead_id === lead.id && t.outreach_channel === 'call' && isOpen(t))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0]
    const group = status.kind === 'held' || status.kind === 'closed' ? 'Held'
      : status.kind === 'done' ? 'Called today' : task?.due ? workspaceDue(task.due, now) : 'Ready'
    return { lead, status, task, group, attention: ['Overdue', 'Today', 'Ready'].includes(group) }
  })
}
export function workspaceMotion(data: CallingQueue) {
  return data.leads.flatMap(lead => {
    const touches = data.touches.filter(t => t.contact_id === lead.id && t.outcome !== 'next_step' && Number.isFinite(Date.parse(t.contacted_at)))
      .sort((a, b) => Date.parse(b.contacted_at) - Date.parse(a.contacted_at))
    const latest = touches[0]
    if (lead.is_archived || lead.rhythm_disposition === 'closed' ||
      ['not_interested', 'do_not_contact'].includes(lead.outbound_status || '') ||
      ['not_interested', 'do_not_contact'].includes(latest?.outcome || '')) return []
    const tasks = data.tasks.filter(t => t.lead_id === lead.id && isOpen(t))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
    const next = tasks[0]
    const group = lead.outbound_status === 'meeting_booked' || ['meeting_agreed', 'lead_meeting_booked'].includes(latest?.outcome || '')
      ? 'Meeting booked' : lead.outbound_status === 'interested' ? 'Interested'
        : next ? 'Follow-up planned'
          : lead.rhythm_disposition === 'unresolved' || ['replied', 'out_of_office'].includes(lead.outbound_status || '')
            ? 'Needs next step' : null
    if (!group) return []
    const outcome = latest?.outcome ? OUTCOMES[latest.outcome as keyof typeof OUTCOMES] || latest.outcome.replaceAll('_', ' ') : null
    return [{ lead, group, next, latest, description: next?.title || outcome || 'Review the recorded conversation' }]
  })
}
export type WorkspaceTask = { id: string; title: string; due: string | null; status: string | null; task?: CompassTask; action?: NextAction }
export function workspaceTasks(tasks: CompassTask[], overview: OutboundOverview | undefined): WorkspaceTask[] {
  const actions = overview?.recommendations.filter(a => a.task_id && !a.lead_ids.length) || []
  const ids = new Set(actions.map(a => a.task_id))
  const campaigns = new Set(overview?.campaigns.map(c => c.id) || [])
  const rows = new Map<string, WorkspaceTask>()
  for (const task of tasks) {
    if (task.lead_id || task.outreach_channel || task.status === 'cancelled') continue
    if (task.source !== OUTBOUND_TASK_SOURCE && !ids.has(task.id) && !campaigns.has(task.operating_context?.campaign_id || '')) continue
    rows.set(task.id, { id: task.id, title: task.title, due: task.due, status: task.status, task, action: actions.find(a => a.task_id === task.id) })
  }
  for (const action of actions) {
    if (!rows.has(action.task_id!) && !tasks.some(t => t.id === action.task_id)) rows.set(action.task_id!, { id: action.task_id!, title: action.title, due: action.due || null, status: null, action })
  }
  const rank = (row: WorkspaceTask) => { const n = actions.findIndex(a => a.task_id === row.id); return n < 0 ? actions.length : n }
  return [...rows.values()].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || rank(a) - rank(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title))
}
