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
 * POST /api/outbound/seed — upsert baseline + creator-source library rows.
 * Always upserts by id so new source catalogue rows land on existing DBs.
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

    let upserted = 0
    for (const batch of batches) {
      if (batch.rows.length === 0) continue
      // Chunk to stay under payload limits
      const chunkSize = 40
      for (let i = 0; i < batch.rows.length; i += chunkSize) {
        const chunk = batch.rows.slice(i, i + chunkSize)
        const { error, data } = await supabase
          .from(batch.table)
          .upsert(chunk, { onConflict: 'id' })
          .select('id')
        if (error) {
          return portalJson(
            { error: 'seed_failed', detail: `${batch.table}: ${error.message}`, upserted },
            { status: 400 }
          )
        }
        upserted += data?.length ?? chunk.length
      }
    }

    return portalJson({ seeded: true, inserted: upserted, upserted })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'seed_failed' }, { status: 500 })
  }
}
