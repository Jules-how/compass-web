import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  portalJsonCached,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { CLIENT_ISSUE_COLUMNS } from '@/lib/list-columns'
import {
  normalizeClientRow,
  normalizeTags,
  nowIso,
  pickNextAction,
  recordClientActivity,
  selectClientsWithCommsFallback
} from '@/lib/client-data'
import { normalizeClientStatus } from '@/lib/client-pm'
import type { CompassClient, CompassClientIssue } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const includeArchived = request.nextUrl.searchParams.get('archived') === '1'

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const [clientsRes, issuesRes] = await Promise.all([
      selectClientsWithCommsFallback((columns) => {
        let query = supabase.from('compass_clients').select(columns).order('name')
        if (!includeArchived) query = query.is('archived_at', null)
        return query
      }),
      supabase
        .from('compass_client_issues')
        .select(CLIENT_ISSUE_COLUMNS)
        .order('updated_at', { ascending: false })
    ])

    if (clientsRes.error || issuesRes.error) {
      return portalJson(
        {
          error: 'fetch_failed',
          detail: clientsRes.error?.message ?? issuesRes.error?.message
        },
        { status: 500 }
      )
    }

    const issues = (issuesRes.data ?? []) as CompassClientIssue[]
    const issuesByClient = new Map<string, CompassClientIssue[]>()
    for (const issue of issues) {
      const list = issuesByClient.get(issue.client_id) ?? []
      list.push(issue)
      issuesByClient.set(issue.client_id, list)
    }

    const clients = ((clientsRes.data ?? []) as CompassClient[]).map((row) => {
      const client = normalizeClientRow(row)
      const clientIssues = issuesByClient.get(client.id) ?? []
      const open = clientIssues.filter(
        (issue) => issue.status !== 'completed' && issue.status !== 'cancelled'
      )
      return {
        ...client,
        next_action: pickNextAction(clientIssues),
        open_issue_count: open.length
      }
    })

    return portalJsonCached({ clients })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

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
    summary?: string | null
    tags?: string[] | string
    notes?: string | null
  }
  try {
    body = (await readBoundedJson(request)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return portalJson({ error: 'name_required' }, { status: 400 })

  const stamp = nowIso()
  const row = {
    id: `client-${crypto.randomUUID()}`,
    name,
    industry: body.industry?.trim() || null,
    website: body.website?.trim() || null,
    main_contact_name: body.main_contact_name?.trim() || null,
    main_contact_role: body.main_contact_role?.trim() || null,
    engagement_type: body.engagement_type?.trim() || null,
    retainer_status: body.retainer_status?.trim() || null,
    status: normalizeClientStatus(body.status),
    priority: typeof body.priority === 'number' ? body.priority : 0,
    health: 'no_updates',
    summary: body.summary?.trim() || null,
    tags: normalizeTags(body.tags),
    notes: body.notes ?? null,
    archived_at: null,
    vault_dossier_id: null,
    portal_client_slug: null,
    last_touch_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    mirrored_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.from('compass_clients').insert(row).select('*').single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })

    await recordClientActivity(supabase, {
      clientId: row.id,
      action: 'created',
      body: `Created client ${name}`,
      touch: false
    })

    return portalJson(
      {
        ...normalizeClientRow(data as CompassClient),
        next_action: null,
        open_issue_count: 0
      },
      { status: 201 }
    )
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
