import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  filterLibraryRows,
  parseLibraryFilters,
  type LibraryTable
} from '@/lib/outbound-api'
import { portalAccessResponse, portalJson, portalJsonCached } from '@/lib/portal-http'

export const dynamic = 'force-dynamic'

const TABLES: Array<{
  key: string
  table: LibraryTable
  searchKeys: string[]
  orderCol: string
}> = [
  {
    key: 'offers',
    table: 'compass_outbound_offers',
    searchKeys: ['name', 'pack_summary', 'notes', 'offer_key'],
    orderCol: 'updated_at'
  },
  {
    key: 'expressions',
    table: 'compass_outbound_expressions',
    searchKeys: ['label', 'body', 'notes'],
    orderCol: 'updated_at'
  },
  {
    key: 'structures',
    table: 'compass_outbound_structures',
    searchKeys: ['label', 'notes'],
    orderCol: 'updated_at'
  },
  {
    key: 'ctas',
    table: 'compass_outbound_ctas',
    searchKeys: ['label', 'body', 'notes'],
    orderCol: 'updated_at'
  },
  {
    key: 'subjects',
    table: 'compass_outbound_subjects',
    searchKeys: ['label', 'pattern', 'notes'],
    orderCol: 'updated_at'
  },
  {
    key: 'openers',
    table: 'compass_outbound_openers',
    searchKeys: ['label', 'notes'],
    orderCol: 'updated_at'
  },
  {
    key: 'templates',
    table: 'compass_outbound_templates',
    searchKeys: ['label', 'notes'],
    orderCol: 'updated_at'
  }
]

/** GET /api/outbound/library — all library kinds in one round-trip. */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const filters = parseLibraryFilters(request)

    const settled = await Promise.all(
      TABLES.map(async ({ key, table, searchKeys, orderCol }) => {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .order(orderCol, { ascending: false })
        if (error) {
          return { key, error: error.message, items: [] as Record<string, unknown>[] }
        }
        const items = filterLibraryRows(
          (data ?? []) as Record<string, unknown>[],
          filters,
          searchKeys
        )
        return { key, error: null as string | null, items }
      })
    )

    const failed = settled.find((row) => row.error)
    if (failed?.error) {
      return portalJson(
        { error: 'fetch_failed', detail: `${failed.key}: ${failed.error}` },
        { status: 500 }
      )
    }

    const payload: Record<string, unknown> = {}
    for (const row of settled) payload[row.key] = row.items
    return portalJsonCached(payload)
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'fetch_failed' }, { status: 500 })
  }
}
