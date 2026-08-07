import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  CLIENT_ACTIVITY_COLUMNS,
  CLIENT_AD_SPEND_COLUMNS,
  CLIENT_CHANNEL_NOTE_COLUMNS,
  CLIENT_ISSUE_COLUMNS,
  CLIENT_LIST_COLUMNS,
  CLIENT_OFFER_COLUMNS,
  CLIENT_UPDATE_COLUMNS,
  PROJECT_LIST_COLUMNS,
  TASK_LIST_COLUMNS
} from '@/lib/list-columns'
import {
  normalizeClientRow,
  normalizeTags,
  nowIso,
  pickNextAction,
  recordClientActivity
} from '@/lib/client-data'
import { normalizeClientStatus } from '@/lib/client-pm'
import { computeProjectStats, emptyProjectStats } from '@/lib/project-stats'
import type {
  CompassClient,
  CompassClientActivity,
  CompassClientAdSpend,
  CompassClientChannelNote,
  CompassClientIssue,
  CompassClientOffer,
  CompassClientUpdate,
  CompassProject,
  CompassTask
} from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [
      clientRes,
      updatesRes,
      activityRes,
      issuesRes,
      offersRes,
      spendRes,
      notesRes,
      projectsRes,
      taskStatsRes
    ] = await Promise.all([
      supabase.from('compass_clients').select(CLIENT_LIST_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('compass_client_updates')
        .select(CLIENT_UPDATE_COLUMNS)
        .eq('client_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('compass_client_activity')
        .select(CLIENT_ACTIVITY_COLUMNS)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('compass_client_issues')
        .select(CLIENT_ISSUE_COLUMNS)
        .eq('client_id', id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('compass_client_offers')
        .select(CLIENT_OFFER_COLUMNS)
        .eq('client_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('compass_client_ad_spend')
        .select(CLIENT_AD_SPEND_COLUMNS)
        .eq('client_id', id)
        .order('spend_date', { ascending: false }),
      supabase
        .from('compass_client_channel_notes')
        .select(CLIENT_CHANNEL_NOTE_COLUMNS)
        .eq('client_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('compass_projects')
        .select(PROJECT_LIST_COLUMNS)
        .eq('client_id', id)
        .order('updated_at', { ascending: false }),
      supabase.from('compass_tasks').select('project_id,status').not('project_id', 'is', null)
    ])

    if (
      clientRes.error ||
      updatesRes.error ||
      activityRes.error ||
      issuesRes.error ||
      offersRes.error ||
      spendRes.error ||
      notesRes.error ||
      projectsRes.error ||
      taskStatsRes.error
    ) {
      return portalJson({ error: 'fetch_failed' }, { status: 500 })
    }
    if (!clientRes.data) return portalJson({ error: 'not_found' }, { status: 404 })

    const issues = (issuesRes.data ?? []) as CompassClientIssue[]
    const projects = ((projectsRes.data ?? []) as CompassProject[]).map((project) => {
      const stats =
        computeProjectStats(taskStatsRes.data ?? []).get(project.id) ?? emptyProjectStats()
      return {
        ...project,
        labels: Array.isArray(project.labels) ? project.labels : [],
        priority: typeof project.priority === 'number' ? project.priority : 0,
        health: project.health || 'no_updates',
        stats
      }
    })

    const projectIds = projects.map((project) => project.id)
    let tasks: CompassTask[] = []
    if (projectIds.length > 0) {
      const tasksRes = await supabase
        .from('compass_tasks')
        .select(TASK_LIST_COLUMNS)
        .in('project_id', projectIds)
        .order('updated_at', { ascending: false })
      if (tasksRes.error) return portalJson({ error: 'fetch_failed' }, { status: 500 })
      tasks = (tasksRes.data ?? []) as CompassTask[]
    }

    const client = normalizeClientRow(clientRes.data as CompassClient)
    const open = issues.filter((issue) => issue.status !== 'completed' && issue.status !== 'cancelled')

    return portalJsonCached({
      client: {
        ...client,
        next_action: pickNextAction(issues),
        open_issue_count: open.length
      },
      updates: (updatesRes.data ?? []) as CompassClientUpdate[],
      activity: (activityRes.data ?? []) as CompassClientActivity[],
      issues,
      offers: (offersRes.data ?? []) as CompassClientOffer[],
      adSpend: (spendRes.data ?? []) as CompassClientAdSpend[],
      channelNotes: (notesRes.data ?? []) as CompassClientChannelNote[],
      projects,
      tasks
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params

  let body: {
    name?: string
    industry?: string | null
    website?: string | null
    main_contact_name?: string | null
    main_contact_role?: string | null
    engagement_type?: string | null
    retainer_status?: string | null
    status?: string
    priority?: number
    health?: string
    summary?: string | null
    tags?: string[] | string
    notes?: string | null
    archive?: boolean
    update?: { body?: string; health?: string }
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const stamp = nowIso()
  const patch: Record<string, unknown> = {
    updated_at: stamp,
    mirrored_at: stamp
  }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return portalJson({ error: 'name_required' }, { status: 400 })
    patch.name = name
  }
  if (Object.prototype.hasOwnProperty.call(body, 'industry')) {
    patch.industry = body.industry?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'website')) {
    patch.website = body.website?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'main_contact_name')) {
    patch.main_contact_name = body.main_contact_name?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'main_contact_role')) {
    patch.main_contact_role = body.main_contact_role?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'engagement_type')) {
    patch.engagement_type = body.engagement_type?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'retainer_status')) {
    patch.retainer_status = body.retainer_status?.trim() || null
  }
  if (typeof body.status === 'string') patch.status = normalizeClientStatus(body.status)
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (typeof body.health === 'string') patch.health = body.health.trim() || 'no_updates'
  if (Object.prototype.hasOwnProperty.call(body, 'summary')) {
    patch.summary = body.summary?.trim() || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    patch.tags = normalizeTags(body.tags)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = body.notes ?? null
  }
  if (body.archive === true) {
    patch.archived_at = stamp
  }
  if (body.archive === false) {
    patch.archived_at = null
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_clients')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) return portalJson({ error: 'update_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })

    if (body.update?.body?.trim()) {
      const health = body.update.health?.trim() || body.health || data.health || 'on_track'
      const updateRow = {
        id: `cupdate-${crypto.randomUUID()}`,
        client_id: id,
        health,
        body: body.update.body.trim(),
        created_at: stamp,
        mirrored_at: stamp
      }
      const updateRes = await supabase.from('compass_client_updates').insert(updateRow)
      if (updateRes.error) {
        return portalJson({ error: 'update_failed', detail: updateRes.error.message }, { status: 400 })
      }
      await supabase
        .from('compass_clients')
        .update({ health, last_touch_at: stamp, updated_at: stamp, mirrored_at: stamp })
        .eq('id', id)
      await recordClientActivity(supabase, {
        clientId: id,
        action: 'update_posted',
        body: body.update.body.trim(),
        touch: false
      })
    } else if (body.archive === true) {
      await recordClientActivity(supabase, {
        clientId: id,
        action: 'archived',
        body: `Archived ${(data as CompassClient).name}`,
        touch: false
      })
    } else if (Object.keys(patch).length > 2) {
      await recordClientActivity(supabase, {
        clientId: id,
        action: 'profile_updated',
        body: 'Updated client profile',
        touch: true
      })
    }

    return portalJson(normalizeClientRow(data as CompassClient))
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const { id } = await context.params
  const stamp = nowIso()

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase
      .from('compass_clients')
      .update({ archived_at: stamp, updated_at: stamp, mirrored_at: stamp })
      .eq('id', id)
      .select('id,name')
      .maybeSingle()
    if (error) return portalJson({ error: 'delete_failed', detail: error.message }, { status: 400 })
    if (!data) return portalJson({ error: 'not_found' }, { status: 404 })

    await recordClientActivity(supabase, {
      clientId: id,
      action: 'archived',
      body: `Archived ${data.name}`,
      touch: false
    })

    return portalJson({ ok: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'delete_failed' }, { status: 500 })
  }
}
