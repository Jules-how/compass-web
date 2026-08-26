import { requireAgentAuth } from '@/lib/agent-auth'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'
import {
  isLegacyAgentLeadsRequest,
  parseAgentLeadColumns,
  parseLeadListFilters
} from '@/lib/leads-query'
import {
  AGENT_LEADS_BODY_MAX_BYTES,
  commitLeadRows,
  type LeadCommitInput
} from '@/lib/lead-commit'
import {
  clampAgentLeadLimit,
  loadLeadInventory,
  mapLegacyAgentLead,
  searchLeadContacts,
  streamLeadContacts
} from '@/lib/lead-search'
import type { SharedMarkBody } from '@/lib/lead-mark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_HOT_STATUS =
  'replied,interested,meeting_booked,not_interested,out_of_office,wrong_person,replied_positive,replied_negative'

/**
 * Agent lead search (Supabase lead_contacts).
 * Legacy: only status/limit/q → Instantly-hot lean shape (unchanged).
 * New: view=rows|counts + shared filter grammar + keyset cursor.
 */
export async function GET(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const url = new URL(request.url)
  const legacy = isLegacyAgentLeadsRequest(url.searchParams)

  try {
    const admin = getPortalAdminClient()

    if (legacy) {
      const statusParam = url.searchParams.get('status') || DEFAULT_HOT_STATUS
      const q = url.searchParams.get('q')?.trim() || ''
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40) || 40))
      const result = await searchLeadContacts(
        admin,
        {
          outbound_status: statusParam,
          q: q || undefined
        },
        { mode: 'agent', columns: 'lean', limit }
      )
      const statuses = statusParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      return portalJson({
        ok: true,
        count: result.leads.length,
        statuses,
        leads: result.leads.map((row) => mapLegacyAgentLead(row))
      })
    }

    const view = (url.searchParams.get('view') || 'rows').trim().toLowerCase()
    const filters = parseLeadListFilters(url.searchParams)
    if (!filters.outbound_status && url.searchParams.get('status')) {
      filters.outbound_status = url.searchParams.get('status') || undefined
    }

    if (view === 'counts') {
      const inventory = await loadLeadInventory(admin, filters.vertical)
      return portalJson({
        ok: true,
        view: 'counts',
        filters,
        ...inventory
      })
    }

    const columns = parseAgentLeadColumns(url.searchParams.get('columns'), 'lean')
    const limit = clampAgentLeadLimit(url.searchParams.get('limit'))
    const wantsNdjson = (request.headers.get('accept') || '')
      .toLowerCase()
      .includes('application/x-ndjson')

    if (wantsNdjson) {
      const stream = await streamLeadContacts(admin, filters, columns)
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ ok: true, total: stream.total, columns: stream.columns })}\n`
            )
          )
          try {
            for await (const lead of stream.iterator) {
              controller.enqueue(encoder.encode(`${JSON.stringify(lead)}\n`))
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ error: err instanceof Error ? err.message : 'stream_failed' })}\n`
              )
            )
          } finally {
            controller.close()
          }
        }
      })
      return new Response(body, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0'
        }
      })
    }

    const result = await searchLeadContacts(admin, filters, {
      mode: 'agent',
      columns,
      cursor: url.searchParams.get('cursor'),
      limit
    })
    return portalJson({
      ok: true,
      filters,
      columns: result.columns,
      count: result.count,
      total: result.total,
      next_cursor: result.next_cursor,
      leads: result.leads
    })
  } catch (err) {
    console.error('[agent/leads]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'list_failed' }, { status: 500 })
  }
}

/**
 * One-call bulk upsert-commit. No business row cap; 8MB body; 500-row write chunks.
 */
export async function POST(request: Request) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  let body: {
    defaults?: LeadCommitInput
    rows?: unknown
    on_conflict?: string
    mark?: SharedMarkBody
  }
  try {
    body = (await readBoundedJson(request, AGENT_LEADS_BODY_MAX_BYTES)) as typeof body
  } catch {
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  if (body.on_conflict && body.on_conflict !== 'email') {
    return portalJson({ error: 'on_conflict_email_only' }, { status: 400 })
  }
  const rows = Array.isArray(body.rows) ? (body.rows as LeadCommitInput[]) : []
  if (rows.length === 0) return portalJson({ error: 'rows_required' }, { status: 400 })

  try {
    const admin = getPortalAdminClient()
    const result = await commitLeadRows(admin, {
      defaults: body.defaults,
      rows,
      mark: body.mark,
      source: 'agent_commit'
    })
    return portalJson(result)
  } catch (err) {
    console.error('[agent/leads POST]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'commit_failed' }, { status: 500 })
  }
}
