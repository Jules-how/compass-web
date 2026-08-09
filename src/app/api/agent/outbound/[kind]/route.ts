import { requireAgentAuth } from '@/lib/agent-auth'
import {
  buildOutboundInsert,
  compactOutboundRow,
  filterOutboundRows,
  isOutboundKind,
  LIBRARY_BODY_MAX_BYTES,
  OUTBOUND_KIND_TABLE,
  parseOutboundListQuery,
  type OutboundKind
} from '@/lib/agent-outbound'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalJson, readBoundedJson } from '@/lib/portal-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ kind: string }>
}

function resolveKind(raw: string): OutboundKind | Response {
  if (!isOutboundKind(raw)) return portalJson({ error: 'invalid_kind' }, { status: 400 })
  return raw
}

export async function GET(request: Request, context: Ctx) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const { kind: raw } = await context.params
  const kindOrErr = resolveKind(raw)
  if (kindOrErr instanceof Response) return kindOrErr
  const kind = kindOrErr
  const table = OUTBOUND_KIND_TABLE[kind]
  const filters = parseOutboundListQuery(new URL(request.url))

  try {
    const admin = getPortalAdminClient()
    const { data, error } = await admin.from(table).select('*').order('updated_at', { ascending: false })
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    const filtered = filterOutboundRows(kind, (data ?? []) as Record<string, unknown>[], filters)
    const items = filtered
      .slice(0, filters.limit)
      .map((row) => compactOutboundRow(kind, row, filters.full))
    return portalJson({
      ok: true,
      kind,
      full: filters.full,
      count: items.length,
      totalMatched: filtered.length,
      items
    })
  } catch (err) {
    console.error('[agent/outbound/list]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: Request, context: Ctx) {
  const authError = requireAgentAuth(request)
  if (authError) return authError

  const { kind: raw } = await context.params
  const kindOrErr = resolveKind(raw)
  if (kindOrErr instanceof Response) return kindOrErr
  const kind = kindOrErr
  const table = OUTBOUND_KIND_TABLE[kind]

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request, LIBRARY_BODY_MAX_BYTES)) as Record<string, unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('too large')) {
      return portalJson({ error: 'body_too_large' }, { status: 413 })
    }
    return portalJson({ error: 'invalid_json' }, { status: 400 })
  }

  const stamp = new Date().toISOString()
  const built = buildOutboundInsert(kind, body, stamp)
  if (!built.ok) return portalJson({ error: built.error }, { status: 400 })

  try {
    const admin = getPortalAdminClient()
    const { data, error } = await admin.from(table).insert(built.row).select('*').single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    return portalJson({ ok: true, item: data }, { status: 201 })
  } catch (err) {
    console.error('[agent/outbound/create]', err instanceof Error ? err.message : err)
    return portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
