import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { projectInboundLead } from '@/lib/inbound-leads-ui'
import { LEAD_LIST_COLUMNS, TASK_LIST_COLUMNS } from '@/lib/list-columns'
import {
  countActionableBadge, linkRelatedInboxItems, parseInboxTab, pickNeedsYou,
  projectAgentInboxItem, projectInstantlyInboxItem, projectWebsiteInboxItem, sortInboxItems,
  type InboxItem, type InboxPayload
} from '@/lib/inbox-ui'
import { buildTriageLookup, type InboxTriageRow } from '@/lib/inbox-triage'
import { INSTANTLY_INBOX_OUTBOUND_STATUSES } from '@/lib/instantly-leads-sync'
import type { CompassTask, LeadContact } from '@/lib/types'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 100

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const params = new URL(request.url).searchParams
    const page = Math.max(0, Math.min(10000, Number(params.get('page')) || 0))
    const offset = Math.floor(page) * PAGE_SIZE
    const [tasks, contacts, enquiries] = await Promise.all([
      supabase.from('compass_tasks').select(`${TASK_LIST_COLUMNS},execution_contract`)
        .is('parent_task_id', null).in('status', ['blocked', 'completed'])
        .order('updated_at', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE),
      supabase.from('lead_contacts').select(LEAD_LIST_COLUMNS)
        .in('outbound_status', [...INSTANTLY_INBOX_OUTBOUND_STATUSES])
        .eq('is_archived', false).order('updated_at', { ascending: false }).order('id')
        .range(offset, offset + PAGE_SIZE),
      supabase.from('portal_inbound_leads')
        .select('id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at,lifecycle_status,lifecycle_updated_at')
        .order('submitted_at', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE)
    ])
    for (const result of [tasks, contacts, enquiries]) if (result.error) throw new Error(result.error.message)
    const hasMore = [tasks, contacts, enquiries].some((r) => (r.data?.length || 0) > PAGE_SIZE)
    const taskRows = (tasks.data || []).slice(0, PAGE_SIZE) as CompassTask[]
    const leadRows = (contacts.data || []).slice(0, PAGE_SIZE) as LeadContact[]
    const inboundRows = (enquiries.data || []).slice(0, PAGE_SIZE).map(projectInboundLead)
    const ids = [...taskRows, ...leadRows, ...inboundRows].map((r) => r.id)
    const [triage, touches] = await Promise.all([
      ids.length ? supabase.from('portal_inbox_triage')
        .select('id,channel,source_id,triage,snoozed_until,identity_key,updated_at,created_at')
        .in('source_id', ids) : Promise.resolve({ data: [], error: null }),
      leadRows.length ? supabase.from('lead_outreach_touches')
        .select('contact_id,contacted_at,note,outcome,request_payload')
        .in('contact_id', leadRows.map((r) => r.id))
        .in('outcome', ['reply_received', 'auto_reply_received', 'reply_observed'])
        .order('contacted_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null })
    ])
    // Never turn a failed triage read into a fresh unread backlog.
    if (triage.error) throw new Error(triage.error.message)
    if (touches.error) throw new Error(touches.error.message)
    const lookup = buildTriageLookup((triage.data || []) as InboxTriageRow[])
    const evidence = new Map<string, { at: string; note: string | null; outcome: string }>()
    for (const touch of touches.data || []) {
      if (touch.request_payload?.at_verified !== true) continue
      const previous = evidence.get(touch.contact_id)
      if (!previous || (previous.at === touch.contacted_at && !previous.note && touch.note)) evidence.set(touch.contact_id, {
        at: touch.contacted_at, note: touch.note, outcome: touch.outcome
      })
    }
    const linked = linkRelatedInboxItems([
      ...taskRows.map((row) => projectAgentInboxItem(row, lookup)),
      ...leadRows.map((row) => projectInstantlyInboxItem(row, lookup, Date.now(), evidence.get(row.id))),
      ...inboundRows.map((row) => projectWebsiteInboxItem(row, lookup))
    ])
    const channel = (key: string): InboxItem[] => sortInboxItems(linked.filter((r) => r.tab === key))
    const channels = { agents: channel('agents'), instantly: channel('instantly'), leads: channel('leads') }
    const counts = countActionableBadge(channels)
    const tab = parseInboxTab(params.get('tab'))
    const payload: InboxPayload = {
      tab, items: channels[tab], total: channels[tab].length, channels, counts,
      badgeTotal: counts.agents + counts.instantly + counts.leads,
      needsYou: pickNeedsYou(linked), leads: inboundRows,
      checkedAt: new Date().toISOString(), partial: hasMore || (touches.data?.length || 0) === 1000,
      nextPage: hasMore ? Math.floor(page) + 1 : null
    }
    return portalJsonCached(payload)
  } catch (err) {
    const accessError = portalAccessResponse(err)
    if (accessError) return accessError
    console.error('[inbox] source read failed', err instanceof Error ? err.message : 'Unknown source error')
    return portalJson({ error: 'Unable to read inbox sources. Retry to see current items.' }, { status: 500 })
  }
}
