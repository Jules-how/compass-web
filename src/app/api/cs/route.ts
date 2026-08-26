import type { NextRequest } from 'next/server'

import { requirePortalAccess } from '@/lib/portal-access'
import { portalAccessResponse, portalJson, portalJsonCached, requireSameOrigin } from '@/lib/portal-http'
import { demoBoardForInspect, runCsDept } from '@/lib/cs-dept/run'
import { roiProjection } from '@/lib/cs-dept/engine.mjs'
import type { CsBoard } from '@/lib/cs-dept/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function withRoi(board: CsBoard) {
  return {
    ...board,
    roi: board.artifacts.filter((row) => row.kind === 'weekly_summary').map(roiProjection)
  }
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('client')?.trim() || null
  const forceDemo = request.nextUrl.searchParams.get('demo') === '1'

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const board = forceDemo
      ? demoBoardForInspect()
      : await runCsDept(supabase, { includeDemo: true, persist: false })
    const scoped = clientId
      ? {
          ...board,
          cards: board.cards.filter((card) => card.client.id === clientId),
          snapshots: board.snapshots.filter((row) => row.client_id === clientId),
          artifacts: board.artifacts.filter((row) => row.client_id === clientId),
          counts: {
            ...board.counts,
            clients: board.cards.filter((card) => card.client.id === clientId).length
          }
        }
      : board
    return portalJsonCached(withRoi(scoped), {}, 15)
  } catch (err) {
    const access = portalAccessResponse(err)
    if (access) return access
    return portalJsonCached(withRoi(demoBoardForInspect()), {}, 15)
  }
}

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const board = await runCsDept(supabase, { includeDemo: true, persist: true })
    return portalJson({ ok: true, ...withRoi(board) })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'cs_run_failed' }, { status: 500 })
  }
}
