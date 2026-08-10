import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { projectInboundLead } from '@/lib/inbound-leads-ui'
import { LEAD_LIST_COLUMNS, LEAD_PAGE_SIZE, TASK_LIST_COLUMNS } from '@/lib/list-columns'
import {
  countActionableBadge,
  emptyInboxChannels,
  isAgentAttentionTask,
  isInstantlyInboundLead,
  linkRelatedInboxItems,
  parseInboxTab,
  pickNeedsYou,
  projectAgentInboxItem,
  projectInstantlyInboxItem,
  projectWebsiteInboxItem,
  sortInboxItems,
  type InboxChannels,
  type InboxItem,
  type InboxPayload
} from '@/lib/inbox-ui'
import {
  buildTriageLookup,
  isLeadLifecycleActionable,
  isTriageActionable,
  type InboxTriageRow,
  type TriageLookup
} from '@/lib/inbox-triage'
import { INSTANTLY_INBOX_OUTBOUND_STATUSES } from '@/lib/instantly-leads-sync'
import { fetchInstantlyUnreadCount, resolveInstantlyApiKey } from '@/lib/instantly'
import type { CompassTask, LeadContact } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Supabase = Awaited<ReturnType<typeof requirePortalAccess>>['supabase']

const INBOUND_LEAD_SELECT =
  'id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at,lifecycle_status,lifecycle_updated_at'

async function loadTriageLookup(
  supabase: Supabase,
  pairs: Array<{ channel: 'agents' | 'instantly' | 'leads'; sourceId: string }>
): Promise<ReturnType<typeof buildTriageLookup>> {
  if (pairs.length === 0) return buildTriageLookup([])
  const sourceIds = [...new Set(pairs.map((p) => p.sourceId))]
  const { data, error } = await supabase
    .from('portal_inbox_triage')
    .select('id,channel,source_id,triage,snoozed_until,identity_key,updated_at,created_at')
    .in('source_id', sourceIds)

  if (error) {
    // Table may not exist yet in older environments — treat as empty triage.
    console.warn('[inbox] triage lookup failed', error.message)
    return buildTriageLookup([])
  }

  const wanted = new Set(pairs.map((p) => `${p.channel}:${p.sourceId}`))
  const rows = ((data ?? []) as InboxTriageRow[]).filter((row) =>
    wanted.has(`${row.channel}:${row.source_id}`)
  )
  return buildTriageLookup(rows)
}

async function fetchAgentTasks(supabase: Supabase): Promise<CompassTask[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const [blocked, completed] = await Promise.all([
    supabase
      .from('compass_tasks')
      .select(`${TASK_LIST_COLUMNS},notes,created_at`)
      .is('parent_task_id', null)
      .eq('status', 'blocked')
      .order('updated_at', { ascending: false })
      .limit(LEAD_PAGE_SIZE),
    supabase
      .from('compass_tasks')
      .select(`${TASK_LIST_COLUMNS},notes,created_at`)
      .is('parent_task_id', null)
      .eq('status', 'completed')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(LEAD_PAGE_SIZE)
  ])

  if (blocked.error) throw new Error(blocked.error.message)
  if (completed.error) throw new Error(completed.error.message)

  const merged = [
    ...((blocked.data ?? []) as CompassTask[]),
    ...((completed.data ?? []) as CompassTask[])
  ]
  const byId = new Map(merged.map((task) => [task.id, task]))
  return [...byId.values()].filter(isAgentAttentionTask)
}

function projectAgentItems(tasks: CompassTask[], lookup: TriageLookup): InboxItem[] {
  return sortInboxItems(
    tasks
      .map((task) => projectAgentInboxItem(task, lookup))
      .filter((item) => {
        // Completed reviews drop off once Done; blocked stay until Done/unblocked.
        if (item.agentStatus === 'completed' && item.triage === 'done') return false
        if (item.triage === 'done' && item.agentStatus !== 'blocked') return false
        if (item.triage === 'snoozed' && !isTriageActionable(item.triage, item.snoozedUntil)) {
          return false
        }
        return true
      })
      .slice(0, LEAD_PAGE_SIZE)
  )
}

async function fetchInstantlyLeads(supabase: Supabase): Promise<LeadContact[]> {
  const { data, error } = await supabase
    .from('lead_contacts')
    .select(LEAD_LIST_COLUMNS)
    .in('outbound_status', [...INSTANTLY_INBOX_OUTBOUND_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(LEAD_PAGE_SIZE)

  if (error) throw new Error(error.message)
  return ((data ?? []) as LeadContact[]).filter(isInstantlyInboundLead)
}

function projectInstantlyItems(leads: LeadContact[], lookup: TriageLookup): InboxItem[] {
  return sortInboxItems(
    leads
      .map((lead) => projectInstantlyInboxItem(lead, lookup))
      .filter((item) => {
        if (item.triage === 'done') return false
        if (item.triage === 'snoozed' && !isTriageActionable(item.triage, item.snoozedUntil)) {
          return false
        }
        return true
      })
  )
}

async function fetchWebsiteLeads(
  supabase: Supabase,
  sourceFilter?: string,
  includeHandled = false
): Promise<ReturnType<typeof projectInboundLead>[]> {
  let query = supabase
    .from('portal_inbound_leads')
    .select(INBOUND_LEAD_SELECT)
    .order('submitted_at', { ascending: false })
    .limit(LEAD_PAGE_SIZE)

  if (sourceFilter) query = query.eq('source', sourceFilter)
  if (!includeHandled) {
    query = query.in('lifecycle_status', ['new', 'contacted', 'qualified'])
  }

  const { data, error } = await query
  if (error) {
    // Fallback for DBs that have not applied lifecycle columns yet.
    if (/lifecycle_status/i.test(error.message)) {
      let legacy = supabase
        .from('portal_inbound_leads')
        .select(
          'id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at'
        )
        .order('submitted_at', { ascending: false })
        .limit(LEAD_PAGE_SIZE)
      if (sourceFilter) legacy = legacy.eq('source', sourceFilter)
      const retry = await legacy
      if (retry.error) throw new Error(retry.error.message)
      return ((retry.data ?? []) as Record<string, unknown>[]).map(projectInboundLead)
    }
    throw new Error(error.message)
  }

  return ((data ?? []) as Record<string, unknown>[]).map(projectInboundLead)
}

function projectWebsiteItems(
  leads: ReturnType<typeof projectInboundLead>[],
  lookup: TriageLookup,
  includeHandled = false
): InboxItem[] {
  return sortInboxItems(
    leads
      .map((lead) => projectWebsiteInboxItem(lead, lookup))
      .filter((item) => {
        if (!includeHandled && !isLeadLifecycleActionable(item.lifecycle)) return false
        if (item.triage === 'done') return false
        if (item.triage === 'snoozed' && !isTriageActionable(item.triage, item.snoozedUntil)) {
          return false
        }
        return true
      })
  )
}

async function loadAllChannelItems(supabase: Supabase): Promise<{
  agents: InboxItem[]
  instantly: InboxItem[]
  leads: InboxItem[]
  leadRows: ReturnType<typeof projectInboundLead>[]
}> {
  // Channel queries run in parallel; triage is a single batched lookup afterward.
  const [agentTasks, instantlyLeads, websiteLeads] = await Promise.all([
    fetchAgentTasks(supabase),
    fetchInstantlyLeads(supabase),
    fetchWebsiteLeads(supabase)
  ])

  const lookup = await loadTriageLookup(supabase, [
    ...agentTasks.map((task) => ({ channel: 'agents' as const, sourceId: task.id })),
    ...instantlyLeads.map((lead) => ({ channel: 'instantly' as const, sourceId: lead.id })),
    ...websiteLeads.map((lead) => ({ channel: 'leads' as const, sourceId: lead.id }))
  ])

  return {
    agents: projectAgentItems(agentTasks, lookup),
    instantly: projectInstantlyItems(instantlyLeads, lookup),
    leads: projectWebsiteItems(websiteLeads, lookup),
    leadRows: websiteLeads
  }
}

async function loadWebsiteItems(
  supabase: Supabase,
  sourceFilter?: string,
  includeHandled = false
): Promise<{ items: InboxItem[]; leads: ReturnType<typeof projectInboundLead>[] }> {
  const leads = await fetchWebsiteLeads(supabase, sourceFilter, includeHandled)
  const lookup = await loadTriageLookup(
    supabase,
    leads.map((lead) => ({ channel: 'leads' as const, sourceId: lead.id }))
  )
  return { items: projectWebsiteItems(leads, lookup, includeHandled), leads }
}

function buildChannels(agents: InboxItem[], instantly: InboxItem[], leads: InboxItem[]): InboxChannels {
  return { agents, instantly, leads }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const hasTab = url.searchParams.has('tab')
  const sourceFilter = url.searchParams.get('source') ?? undefined
  const includeHandled = url.searchParams.get('show') === 'all'
  // Default /api/inbox (no tab) used to strip items for the badge — but the
  // server already loaded every channel. Keep the full queues so nav prefetch
  // warms the Inbox panel and tab switches stay client-side.
  const countsOnly = !hasTab && !sourceFilter

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    // Instantly Unibox unread runs alongside DB work (was a serial waterfall).
    const instantlyKey = await resolveInstantlyApiKey(supabase)
    const [all, instantlyUnread] = await Promise.all([
      loadAllChannelItems(supabase),
      instantlyKey
        ? fetchInstantlyUnreadCount(instantlyKey).catch(() => null)
        : Promise.resolve(null)
    ])

    const linkedAgents = linkRelatedInboxItems([...all.agents, ...all.instantly, ...all.leads])
    const byId = new Map(linkedAgents.map((item) => [item.id, item]))
    const agents = all.agents.map((item) => byId.get(item.id) ?? item)
    const instantly = all.instantly.map((item) => byId.get(item.id) ?? item)
    const leads = all.leads.map((item) => byId.get(item.id) ?? item)

    const counts = countActionableBadge({ agents, instantly, leads })
    let badgeTotal = counts.agents + counts.instantly + counts.leads

    if (typeof instantlyUnread === 'number' && instantlyUnread > counts.instantly) {
      // Prefer mirror triage for accuracy; only lift Instantly tab count toward Unibox.
      counts.instantly = Math.max(counts.instantly, Math.min(instantlyUnread, LEAD_PAGE_SIZE))
      badgeTotal = counts.agents + counts.instantly + counts.leads
    }

    const needsYou = pickNeedsYou([...agents, ...instantly, ...leads])
    const channels = buildChannels(agents, instantly, leads)

    if (countsOnly) {
      const payload: InboxPayload = {
        tab: 'leads',
        items: leads,
        total: leads.length,
        counts,
        badgeTotal,
        needsYou,
        channels,
        leads: all.leadRows
      }
      return portalJsonCached(payload)
    }

    const tab = parseInboxTab(url.searchParams.get('tab'))
    let items: InboxItem[] = []
    let leadRows: ReturnType<typeof projectInboundLead>[] = all.leadRows
    let total = counts[tab]
    let responseChannels = channels

    if (tab === 'agents') {
      items = agents
      total = items.length
    } else if (tab === 'instantly') {
      items = instantly
      total = items.length
    } else {
      if (sourceFilter || includeHandled) {
        const website = await loadWebsiteItems(supabase, sourceFilter, includeHandled)
        items = linkRelatedInboxItems([...agents, ...instantly, ...website.items]).filter(
          (item) => item.tab === 'leads'
        )
        leadRows = website.leads
        responseChannels = {
          ...emptyInboxChannels(),
          agents,
          instantly,
          leads: items
        }
      } else {
        items = leads
      }
      total = items.length
    }

    const payload: InboxPayload = {
      tab,
      items,
      total,
      counts,
      badgeTotal,
      needsYou,
      channels: responseChannels,
      leads: leadRows
    }
    return portalJsonCached(payload)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
