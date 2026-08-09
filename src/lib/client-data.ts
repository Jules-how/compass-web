import type { SupabaseClient } from '@supabase/supabase-js'
import { isOpenClientIssue } from '@/lib/client-pm'
import { CLIENT_LIST_COLUMNS, CLIENT_LIST_COLUMNS_CORE } from '@/lib/list-columns'
import type { CompassClientIssue } from '@/lib/types'

export function nowIso(): string {
  return new Date().toISOString()
}

/** PostgREST/Postgres when a column or relation from a later migration is missing. */
export function isMissingDbObjectError(message: string | null | undefined): boolean {
  return Boolean(message && /does not exist|schema cache/i.test(message))
}

type ClientSelectResult = {
  data: unknown
  error: { message: string } | null
}

/**
 * Select client rows with full CRM+comms columns, falling back to core CRM
 * columns when migration 0031 (comms_summary*) has not been applied yet.
 */
export async function selectClientsWithCommsFallback(
  run: (columns: string) => PromiseLike<ClientSelectResult>
): Promise<ClientSelectResult> {
  const full = await run(CLIENT_LIST_COLUMNS)
  if (full.error && isMissingDbObjectError(full.error.message)) {
    return run(CLIENT_LIST_COLUMNS_CORE)
  }
  return full
}

export function normalizeTags(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30)
  }
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 30)
}

export function normalizeClientRow<
  T extends {
    tags?: unknown
    priority?: unknown
    health?: string | null
    industry?: string | null
    vertical?: string | null
    comms_summary?: string | null
    comms_summary_at?: string | null
    comms_summary_source?: string | null
  }
>(
  row: T
): T & {
  tags: string[]
  priority: number
  health: string
  industry: string | null
  comms_summary: string | null
  comms_summary_at: string | null
  comms_summary_source: string | null
} {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    priority: typeof row.priority === 'number' ? row.priority : 0,
    health: row.health || 'no_updates',
    // Legacy desktop rows store vertical instead of industry.
    industry: row.industry?.trim() || row.vertical?.trim() || null,
    comms_summary: row.comms_summary?.trim() || null,
    comms_summary_at: row.comms_summary_at || null,
    comms_summary_source: row.comms_summary_source || null
  }
}

export function pickNextAction(issues: CompassClientIssue[]): string | null {
  const open = issues
    .filter((issue) => isOpenClientIssue(issue.status))
    .sort((a, b) => {
      // Lower priority number is higher urgency (1 urgent before 4 low), but 0 = none.
      const rank = (p: number) => (p === 0 ? 99 : p)
      const byPriority = rank(a.priority || 0) - rank(b.priority || 0)
      if (byPriority !== 0) return byPriority
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  return open[0]?.title ?? null
}

export async function recordClientActivity(
  supabase: SupabaseClient,
  input: {
    clientId: string
    action: string
    body: string
    actor?: string
    touch?: boolean
  }
) {
  const stamp = nowIso()
  const activity = {
    id: `cact-${crypto.randomUUID()}`,
    client_id: input.clientId,
    actor: input.actor ?? 'operator',
    action: input.action,
    body: input.body,
    created_at: stamp
  }
  await supabase.from('compass_client_activity').insert(activity)
  if (input.touch !== false) {
    await supabase
      .from('compass_clients')
      .update({ last_touch_at: stamp, updated_at: stamp, mirrored_at: stamp })
      .eq('id', input.clientId)
  }
  return activity
}
