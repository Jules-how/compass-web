import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'
import { projectInboundLead } from '@/lib/inbound-leads-ui'
import { LEAD_LIST_COLUMNS, LEAD_PAGE_SIZE, TASK_LIST_COLUMNS } from '@/lib/list-columns'
import {
  emptyInboxCounts,
  isAgentAttentionTask,
  isInstantlyInboundLead,
  parseInboxTab,
  projectAgentInboxItem,
  projectInstantlyInboxItem,
  projectWebsiteInboxItem,
  type InboxItem,
  type InboxPayload,
  type InboxTabCounts
} from '@/lib/inbox-ui'
import type { CompassTask, LeadContact } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Supabase = Awaited<ReturnType<typeof requirePortalAccess>>['supabase']

async function loadAgentItems(supabase: Supabase): Promise<InboxItem[]> {
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

  const merged = [...((blocked.data ?? []) as CompassTask[]), ...((completed.data ?? []) as CompassTask[])]
  const byId = new Map(merged.map((task) => [task.id, task]))
  return [...byId.values()]
    .filter(isAgentAttentionTask)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, LEAD_PAGE_SIZE)
    .map(projectAgentInboxItem)
}

async function loadInstantlyItems(supabase: Supabase): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from('lead_contacts')
    .select(LEAD_LIST_COLUMNS)
    .in('outbound_status', ['replied', 'interested', 'meeting_booked'])
    .order('updated_at', { ascending: false })
    .limit(LEAD_PAGE_SIZE)

  if (error) throw new Error(error.message)
  return ((data ?? []) as LeadContact[])
    .filter(isInstantlyInboundLead)
    .map(projectInstantlyInboxItem)
}

async function loadWebsiteItems(
  supabase: Supabase,
  sourceFilter?: string
): Promise<{ items: InboxItem[]; leads: ReturnType<typeof projectInboundLead>[] }> {
  let query = supabase
    .from('portal_inbound_leads')
    .select(
      'id,tenant_id,external_id,source,channel,name,email,phone,submitted_at,summary,created_at'
    )
    .order('submitted_at', { ascending: false })
    .limit(LEAD_PAGE_SIZE)

  if (sourceFilter) query = query.eq('source', sourceFilter)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const leads = ((data ?? []) as Record<string, unknown>[]).map(projectInboundLead)
  return { items: leads.map(projectWebsiteInboxItem), leads }
}

async function loadCounts(supabase: Supabase): Promise<InboxTabCounts> {
  const counts = emptyInboxCounts()
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const [blocked, completed, instantly, website] = await Promise.all([
    supabase
      .from('compass_tasks')
      .select('id', { count: 'exact', head: true })
      .is('parent_task_id', null)
      .eq('status', 'blocked'),
    supabase
      .from('compass_tasks')
      .select('id', { count: 'exact', head: true })
      .is('parent_task_id', null)
      .eq('status', 'completed')
      .gte('updated_at', since),
    supabase
      .from('lead_contacts')
      .select('id', { count: 'exact', head: true })
      .in('outbound_status', ['replied', 'interested', 'meeting_booked']),
    supabase.from('portal_inbound_leads').select('id', { count: 'exact', head: true })
  ])

  if (blocked.error) throw new Error(blocked.error.message)
  if (completed.error) throw new Error(completed.error.message)
  if (instantly.error) throw new Error(instantly.error.message)
  if (website.error) throw new Error(website.error.message)

  counts.agents = (blocked.count ?? 0) + (completed.count ?? 0)
  counts.gmails = 0
  counts.instantly = instantly.count ?? 0
  counts.leads = website.count ?? 0
  return counts
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const hasTab = url.searchParams.has('tab')
  const sourceFilter = url.searchParams.get('source') ?? undefined
  const countsOnly = !hasTab && !sourceFilter

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const counts = await loadCounts(supabase)
    const badgeTotal = counts.agents + counts.gmails + counts.instantly + counts.leads

    if (countsOnly) {
      const payload: InboxPayload = {
        tab: 'leads',
        items: [],
        total: badgeTotal,
        counts,
        badgeTotal,
        leads: []
      }
      return portalJsonCached(payload)
    }

    const tab = parseInboxTab(url.searchParams.get('tab'))
    let items: InboxItem[] = []
    let leads: ReturnType<typeof projectInboundLead>[] = []
    let total = counts[tab]

    if (tab === 'agents') {
      items = await loadAgentItems(supabase)
      total = counts.agents
    } else if (tab === 'gmails') {
      items = []
      total = 0
    } else if (tab === 'instantly') {
      items = await loadInstantlyItems(supabase)
      total = counts.instantly
    } else {
      const website = await loadWebsiteItems(supabase, sourceFilter)
      items = website.items
      leads = website.leads
      total = sourceFilter ? website.items.length : counts.leads
    }

    const payload: InboxPayload = {
      tab,
      items,
      total,
      counts,
      badgeTotal,
      leads
    }
    return portalJsonCached(payload)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
