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
  deriveCopyArchiveComponents,
  emptyCopyArchivePerformance,
  isValidSequence,
  normalizeTags
} from '@/lib/outbound-copy'
import { outboundNowIso, parseLibraryFilters, filterLibraryRows } from '@/lib/outbound-api'

export const dynamic = 'force-dynamic'

const TABLE = 'compass_outbound_copy_archive'

function tagsFromBody(value: unknown): string[] {
  return normalizeTags(value)
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const filters = parseLibraryFilters(request)
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) return portalJson({ error: 'fetch_failed', detail: error.message }, { status: 500 })
    const rows = filterLibraryRows(
      (data ?? []) as Record<string, unknown>[],
      filters,
      ['name', 'offer_key', 'structure_id', 'notes']
    )
    return portalJsonCached({ items: rows })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let body: Record<string, unknown>
  try {
    body = (await readBoundedJson(request)) as Record<string, unknown>
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const structure_id = typeof body.structure_id === 'string' ? body.structure_id.trim() : ''
  if (!name || !structure_id) return portalJson({ error: 'fields_required' }, { status: 400 })
  if (!isValidSequence(body.sequence)) return portalJson({ error: 'invalid_sequence' }, { status: 400 })

  const stamp = outboundNowIso()
  const offer_key =
    typeof body.offer_key === 'string' ? body.offer_key.trim() || null : null
  const opener_mode =
    typeof body.opener_mode === 'string' ? body.opener_mode.trim() || null : null
  const components =
    body.components && typeof body.components === 'object'
      ? body.components
      : deriveCopyArchiveComponents(body.sequence as never, {
          offer_key,
          opener_mode
        })
  const performance =
    body.performance && typeof body.performance === 'object'
      ? body.performance
      : emptyCopyArchivePerformance()

  const row = {
    id: `archive-${crypto.randomUUID()}`,
    name,
    source: typeof body.source === 'string' ? body.source : 'saved',
    source_id: typeof body.source_id === 'string' ? body.source_id : null,
    vertical_tags: tagsFromBody(body.vertical_tags),
    location_tags: tagsFromBody(body.location_tags),
    offer_key,
    structure_id,
    opener_mode,
    sequence: body.sequence,
    components,
    performance,
    last_used_at: typeof body.last_used_at === 'string' ? body.last_used_at : null,
    first_used_at: typeof body.first_used_at === 'string' ? body.first_used_at : stamp,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    archived: false,
    created_at: stamp,
    updated_at: stamp
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
    if (error) return portalJson({ error: 'create_failed', detail: error.message }, { status: 400 })
    return portalJson(data, { status: 201 })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'create_failed' }, { status: 500 })
  }
}
