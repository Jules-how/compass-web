import type { SupabaseClient } from '@supabase/supabase-js'

import {
  AD_ACCOUNT_LIST_COLUMNS,
  type AdAccountRow
} from '@/lib/ad-accounts'
import { rebuildHomeGlance, syncAdAccount } from '@/lib/ad-sync'
import {
  InstantlyApiError,
  fetchInstantlyCampaignAnalytics,
  loadColdEmailGlanceFromInstantly,
  resolveInstantlyApiKey,
  type InstantlyCampaignAnalytics
} from '@/lib/instantly'
import {
  INSTANTLY_INBOX_FILTERS,
  syncInstantlyLeadsIntoCompass,
  type InstantlyLeadsSyncResult
} from '@/lib/instantly-leads-sync'
import { upsertSyncSnapshot } from '@/lib/sync-snapshots'
import { buildAgentBrief, type AgentBrief } from '@/lib/agent-brief'

export type AgentSyncSource = 'ads' | 'instantly' | 'instantly_leads'

export const ALL_AGENT_SYNC_SOURCES: AgentSyncSource[] = [
  'ads',
  'instantly',
  'instantly_leads'
]

export type AgentSyncResult = {
  ok: boolean
  ranAt: string
  sources: AgentSyncSource[]
  ads?: {
    accounts: number
    synced: number
    failed: number
    errors: Array<{ id: string; platform: string; detail: string }>
  }
  instantly?: {
    ok: boolean
    emailsSentToday?: number
    repliesWaiting?: number
    campaigns?: number
    error?: string
  }
  instantlyLeads?: InstantlyLeadsSyncResult & { error?: string }
  brief?: AgentBrief
}

export function parseSyncSources(input: unknown): AgentSyncSource[] {
  if (!Array.isArray(input) || input.length === 0) return [...ALL_AGENT_SYNC_SOURCES]
  const allowed = new Set<string>(ALL_AGENT_SYNC_SOURCES)
  const out: AgentSyncSource[] = []
  for (const value of input) {
    if (typeof value !== 'string') continue
    if (!allowed.has(value)) continue
    if (!out.includes(value as AgentSyncSource)) out.push(value as AgentSyncSource)
  }
  return out.length > 0 ? out : [...ALL_AGENT_SYNC_SOURCES]
}

async function syncAllAdAccounts(supabase: SupabaseClient): Promise<NonNullable<AgentSyncResult['ads']>> {
  const { data, error } = await supabase
    .from('compass_ad_accounts')
    .select(AD_ACCOUNT_LIST_COLUMNS)
    .neq('status', 'disconnected')

  if (error) throw new Error(error.message)
  const accounts = (data ?? []) as AdAccountRow[]
  const errors: Array<{ id: string; platform: string; detail: string }> = []
  let synced = 0

  for (const account of accounts) {
    if (!account.access_token_enc) {
      errors.push({ id: account.id, platform: account.platform, detail: 'missing_access_token' })
      continue
    }
    try {
      await syncAdAccount(supabase, account)
      synced += 1
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'sync_failed'
      errors.push({ id: account.id, platform: account.platform, detail })
      await supabase
        .from('compass_ad_accounts')
        .update({
          status: 'error',
          last_error: detail,
          updated_at: new Date().toISOString()
        })
        .eq('id', account.id)
    }
  }

  await rebuildHomeGlance(supabase)

  return {
    accounts: accounts.length,
    synced,
    failed: errors.length,
    errors
  }
}

async function syncInstantlyGlance(
  supabase: SupabaseClient
): Promise<{
  result: NonNullable<AgentSyncResult['instantly']>
  campaigns: InstantlyCampaignAnalytics[]
}> {
  const apiKey = await resolveInstantlyApiKey(supabase)
  if (!apiKey) {
    return {
      result: { ok: false, error: 'INSTANTLY_API_KEY is not configured' },
      campaigns: []
    }
  }

  try {
    const [glance, campaigns] = await Promise.all([
      loadColdEmailGlanceFromInstantly(apiKey),
      fetchInstantlyCampaignAnalytics(apiKey)
    ])
    await upsertSyncSnapshot(supabase, 'instantly_cold_email', glance, 'live')
    return {
      result: {
        ok: true,
        emailsSentToday: glance.emailsSentToday,
        repliesWaiting: glance.repliesWaiting,
        campaigns: glance.campaigns.length
      },
      campaigns
    }
  } catch (err) {
    const message =
      err instanceof InstantlyApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'instantly_sync_failed'
    return { result: { ok: false, error: message }, campaigns: [] }
  }
}

/**
 * Lean daily / on-demand sync: ads → Instantly glance → Instantly lead CRM mirror.
 * Designed for Vercel cron and Cursor agents (local + cloud).
 */
export async function runAgentSync(
  supabase: SupabaseClient,
  sources: AgentSyncSource[] = ALL_AGENT_SYNC_SOURCES,
  options?: { includeBrief?: boolean }
): Promise<AgentSyncResult> {
  const ranAt = new Date().toISOString()
  const result: AgentSyncResult = {
    ok: true,
    ranAt,
    sources
  }

  let campaigns: InstantlyCampaignAnalytics[] = []

  if (sources.includes('ads')) {
    result.ads = await syncAllAdAccounts(supabase)
    if (result.ads.failed > 0 && result.ads.synced === 0 && result.ads.accounts > 0) {
      result.ok = false
    }
  }

  if (sources.includes('instantly')) {
    const instantly = await syncInstantlyGlance(supabase)
    result.instantly = instantly.result
    campaigns = instantly.campaigns
    if (!instantly.result.ok) result.ok = false
  }

  if (sources.includes('instantly_leads')) {
    try {
      const apiKey = await resolveInstantlyApiKey(supabase)
      if (campaigns.length === 0 && apiKey) {
        campaigns = await fetchInstantlyCampaignAnalytics(apiKey)
      }
      result.instantlyLeads = await syncInstantlyLeadsIntoCompass(supabase, {
        apiKey,
        campaigns
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'instantly_leads_sync_failed'
      result.instantlyLeads = {
        fetched: 0,
        upserted: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        filters: [...INSTANTLY_INBOX_FILTERS],
        error: message
      }
      result.ok = false
    }
  }

  if (options?.includeBrief !== false) {
    result.brief = await buildAgentBrief(supabase)
    await upsertSyncSnapshot(supabase, 'daily_brief', result.brief, 'live')
  }

  await upsertSyncSnapshot(
    supabase,
    'last_daily_sync',
    {
      ok: result.ok,
      ranAt,
      sources,
      ads: result.ads
        ? { accounts: result.ads.accounts, synced: result.ads.synced, failed: result.ads.failed }
        : undefined,
      instantly: result.instantly,
      instantlyLeads: result.instantlyLeads
        ? {
            fetched: result.instantlyLeads.fetched,
            upserted: result.instantlyLeads.upserted,
            inserted: result.instantlyLeads.inserted,
            updated: result.instantlyLeads.updated,
            error: result.instantlyLeads.error
          }
        : undefined
    },
    'live'
  )

  return result
}
