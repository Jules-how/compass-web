import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import {
  seedCtas,
  seedExpressions,
  seedOffers,
  seedOpeners,
  seedStructures,
  seedSubjects,
  seedTemplates
} from '@/lib/outbound-seed'

export const dynamic = 'force-dynamic'

type SeedTable =
  | 'compass_outbound_offers'
  | 'compass_outbound_expressions'
  | 'compass_outbound_structures'
  | 'compass_outbound_ctas'
  | 'compass_outbound_subjects'
  | 'compass_outbound_openers'
  | 'compass_outbound_templates'

/**
 * POST /api/outbound/seed — insert baseline library rows when offers table is empty.
 * Idempotent: no-op if any offer already exists.
 */
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  try {
    await readBoundedJson(request, 1024)
  } catch {
    /* empty body ok */
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })
    const existing = await supabase
      .from('compass_outbound_offers')
      .select('id')
      .limit(1)
    if (existing.error) {
      return portalJson({ error: 'seed_failed', detail: existing.error.message }, { status: 500 })
    }
    if ((existing.data ?? []).length > 0) {
      return portalJson({ seeded: false, inserted: 0 })
    }

    const batches: Array<{ table: SeedTable; rows: Record<string, unknown>[] }> = [
      { table: 'compass_outbound_offers', rows: seedOffers() as unknown as Record<string, unknown>[] },
      {
        table: 'compass_outbound_expressions',
        rows: seedExpressions() as unknown as Record<string, unknown>[]
      },
      {
        table: 'compass_outbound_structures',
        rows: seedStructures() as unknown as Record<string, unknown>[]
      },
      { table: 'compass_outbound_ctas', rows: seedCtas() as unknown as Record<string, unknown>[] },
      {
        table: 'compass_outbound_subjects',
        rows: seedSubjects() as unknown as Record<string, unknown>[]
      },
      {
        table: 'compass_outbound_openers',
        rows: seedOpeners() as unknown as Record<string, unknown>[]
      },
      {
        table: 'compass_outbound_templates',
        rows: seedTemplates() as unknown as Record<string, unknown>[]
      }
    ]

    let inserted = 0
    for (const batch of batches) {
      if (batch.rows.length === 0) continue
      const { error, data } = await supabase.from(batch.table).insert(batch.rows).select('id')
      if (error) {
        return portalJson(
          { error: 'seed_failed', detail: `${batch.table}: ${error.message}`, inserted },
          { status: 400 }
        )
      }
      inserted += data?.length ?? batch.rows.length
    }

    return portalJson({ seeded: true, inserted })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'seed_failed' }, { status: 500 })
  }
}
