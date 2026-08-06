import type { NextRequest } from 'next/server'
import { reorganizeBrainDumpSmart } from '@/lib/brain-dump-ai'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

type Body = {
  dump?: string
  existingTitles?: string[]
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    await requirePortalAccess({ operator: true })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await readBoundedJson(request, 16 * 1024)) as Body
  } catch {
    return portalJson({ error: 'invalid_request' }, { status: 400 })
  }

  const dump = typeof body.dump === 'string' ? body.dump : ''
  if (!dump.trim()) {
    return portalJson({ error: 'dump_required' }, { status: 400 })
  }

  const existingTitles = Array.isArray(body.existingTitles)
    ? body.existingTitles.filter((t): t is string => typeof t === 'string').slice(0, 40)
    : []

  try {
    const result = await reorganizeBrainDumpSmart(dump, existingTitles)
    return portalJson(result)
  } catch {
    return portalJson({ error: 'reorganize_failed' }, { status: 500 })
  }
}
