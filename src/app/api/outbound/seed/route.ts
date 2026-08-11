import type { NextRequest } from 'next/server'
import { requirePortalAccess } from '@/lib/portal-access'
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin
} from '@/lib/portal-http'
import { OUTBOUND_LIBRARY_SEED_VERSION } from '@/lib/outbound-library-seed-version'
import {
  seedCtas,
  seedExpressions,
  seedInventoryCounts,
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

type SeedBatch = { table: SeedTable; rows: Record<string, unknown>[] }

const ID_CHUNK = 100
const UPSERT_CHUNK = 40

function seedBatches(): SeedBatch[] {
  return [
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
}

async function existingIds(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase'],
  table: SeedTable,
  ids: string[]
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    const { data, error } = await supabase.from(table).select('id').in('id', chunk)
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const row of data ?? []) {
      if (row && typeof (row as { id?: string }).id === 'string') {
        found.add((row as { id: string }).id)
      }
    }
  }
  return found
}

async function catalogueLooksSeeded(
  supabase: Awaited<ReturnType<typeof requirePortalAccess>>['supabase']
): Promise<boolean> {
  const expected = seedInventoryCounts()
  const checks: Array<{ table: SeedTable; min: number; sentinel: string }> = [
    {
      table: 'compass_outbound_subjects',
      min: expected.subjects,
      sentinel: 'subj-passthrough'
    },
    {
      table: 'compass_outbound_ctas',
      min: expected.ctas,
      sentinel: 'cta-outline-permission'
    },
    {
      table: 'compass_outbound_offers',
      min: expected.offers,
      sentinel: 'offer-growth-system'
    }
  ]

  const results = await Promise.all(
    checks.map(async ({ table, min, sentinel }) => {
      const [{ count, error: countError }, { data, error: rowError }] = await Promise.all([
        supabase.from(table).select('id', { count: 'exact', head: true }),
        supabase.from(table).select('id').eq('id', sentinel).maybeSingle()
      ])
      if (countError || rowError) return false
      return (count ?? 0) >= min && Boolean(data?.id)
    })
  )
  return results.every(Boolean)
}

/**
 * POST /api/outbound/seed — ensure baseline + creator-source library rows exist.
 * Default: only insert missing ids (fast on warm DBs). Pass `{ force: true }` to
 * re-upsert every seed row (content refresh).
 */
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  let force = false
  try {
    const body = (await readBoundedJson(request, 1024)) as { force?: unknown }
    force = body?.force === true
  } catch {
    /* empty body ok */
  }

  try {
    const { supabase } = await requirePortalAccess({ operator: true })

    if (!force && (await catalogueLooksSeeded(supabase))) {
      return portalJson({
        seeded: false,
        inserted: 0,
        upserted: 0,
        skipped: true,
        missing: 0,
        force: false,
        version: OUTBOUND_LIBRARY_SEED_VERSION
      })
    }

    const batches = seedBatches()

    let upserted = 0
    let missingTotal = 0

    const plans = await Promise.all(
      batches.map(async (batch) => {
        if (batch.rows.length === 0) {
          return { batch, toWrite: [] as Record<string, unknown>[] }
        }
        if (force) {
          return { batch, toWrite: batch.rows }
        }
        const ids = batch.rows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
        const present = await existingIds(supabase, batch.table, ids)
        const toWrite = batch.rows.filter(
          (row) => typeof row.id === 'string' && !present.has(row.id)
        )
        return { batch, toWrite }
      })
    )

    for (const { batch, toWrite } of plans) {
      missingTotal += toWrite.length
      if (toWrite.length === 0) continue
      for (let i = 0; i < toWrite.length; i += UPSERT_CHUNK) {
        const chunk = toWrite.slice(i, i + UPSERT_CHUNK)
        const { error, data } = await supabase
          .from(batch.table)
          .upsert(chunk, { onConflict: 'id' })
          .select('id')
        if (error) {
          return portalJson(
            {
              error: 'seed_failed',
              detail: `${batch.table}: ${error.message}`,
              upserted,
              version: OUTBOUND_LIBRARY_SEED_VERSION
            },
            { status: 400 }
          )
        }
        upserted += data?.length ?? chunk.length
      }
    }

    return portalJson({
      seeded: upserted > 0,
      inserted: upserted,
      upserted,
      skipped: upserted === 0,
      missing: missingTotal,
      force,
      version: OUTBOUND_LIBRARY_SEED_VERSION
    })
  } catch (err) {
    return portalAccessResponse(err) ?? portalJson({ error: 'seed_failed' }, { status: 500 })
  }
}
