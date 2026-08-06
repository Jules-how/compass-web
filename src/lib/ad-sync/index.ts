import type { SupabaseClient } from '@supabase/supabase-js'

import {
  AD_ACCOUNT_LIST_COLUMNS,
  aggregateGlance,
  platformLabel,
  type AdAccountRow,
  type SyncedCreative
} from '@/lib/ad-accounts'
import { decryptSecret } from '@/lib/ad-token-crypto'
import { syncGoogleCreatives } from '@/lib/ad-sync/google'
import { syncLinkedInCreatives } from '@/lib/ad-sync/linkedin'
import {
  fetchMetaAccountSpend,
  syncMetaCreatives
} from '@/lib/ad-sync/meta'
import { HOME_AD_DEMO, type HomeAdGlance } from '@/lib/home-demo-data'

function leadValueFromMeta(meta: Record<string, unknown>): number | undefined {
  return typeof meta.lead_value === 'number' ? meta.lead_value : undefined
}

export async function syncAdAccount(
  supabase: SupabaseClient,
  account: AdAccountRow
): Promise<{ creatives: SyncedCreative[]; glancePartial: { spendToday: number; spendYesterday: number } }> {
  if (!account.access_token_enc) throw new Error('missing_access_token')
  const accessToken = decryptSecret(account.access_token_enc)
  const meta = account.meta ?? {}
  const leadValue = leadValueFromMeta(meta)

  let creatives: SyncedCreative[] = []
  let spendToday = 0
  let spendYesterday = 0

  if (account.platform === 'meta') {
    const synced = await syncMetaCreatives({
      accessToken,
      actId: account.external_account_id,
      leadValue
    })
    creatives = synced.creatives
    spendToday = await fetchMetaAccountSpend(accessToken, account.external_account_id, 'today')
    spendYesterday = await fetchMetaAccountSpend(
      accessToken,
      account.external_account_id,
      'yesterday'
    )
  } else if (account.platform === 'google') {
    const developerToken =
      (typeof meta.developer_token === 'string' && meta.developer_token) ||
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
      ''
    if (!developerToken) throw new Error('google_developer_token_required')
    const synced = await syncGoogleCreatives({
      accessToken,
      developerToken,
      customerId: account.external_account_id,
      loginCustomerId:
        typeof meta.login_customer_id === 'string' ? meta.login_customer_id : undefined,
      leadValue
    })
    creatives = synced.creatives
    spendToday = synced.spendToday
    spendYesterday = synced.spendYesterday
  } else if (account.platform === 'linkedin') {
    const synced = await syncLinkedInCreatives({
      accessToken,
      adAccountId: account.external_account_id,
      leadValue
    })
    creatives = synced.creatives
    spendToday = synced.spendToday
    spendYesterday = synced.spendYesterday
  } else {
    throw new Error('unsupported_platform')
  }

  const stamp = new Date().toISOString()
  // Replace cached creatives for this account.
  await supabase.from('compass_ad_creatives').delete().eq('account_row_id', account.id)

  if (creatives.length > 0) {
    const rows = creatives.map((c) => ({
      id: c.id,
      account_row_id: account.id,
      external_id: c.id,
      name: c.name,
      channel: platformLabel(account.platform),
      status: c.status,
      spend: c.spend,
      ctr: c.ctr,
      cpa: c.cpa,
      roas: c.roas,
      leads: c.leads,
      impressions: c.impressions,
      clicks: c.clicks,
      period_start: c.periodStart ?? null,
      period_end: c.periodEnd ?? null,
      synced_at: stamp
    }))
    const { error } = await supabase.from('compass_ad_creatives').insert(rows)
    if (error) throw new Error(error.message)
  }

  const { error: updateError } = await supabase
    .from('compass_ad_accounts')
    .update({
      status: 'connected',
      last_synced_at: stamp,
      last_error: null,
      updated_at: stamp
    })
    .eq('id', account.id)
  if (updateError) throw new Error(updateError.message)

  return { creatives, glancePartial: { spendToday, spendYesterday } }
}

export async function rebuildHomeGlance(supabase: SupabaseClient): Promise<HomeAdGlance> {
  const { data: accounts, error: accountsError } = await supabase
    .from('compass_ad_accounts')
    .select(AD_ACCOUNT_LIST_COLUMNS)
    .eq('status', 'connected')

  if (accountsError) throw new Error(accountsError.message)
  const connected = (accounts ?? []) as AdAccountRow[]
  if (connected.length === 0) {
    await supabase
      .from('compass_ad_glance')
      .upsert({ id: 'home', payload: HOME_AD_DEMO, source: 'demo', synced_at: new Date().toISOString() })
    return HOME_AD_DEMO
  }

  const { data: creativeRows, error: creativeError } = await supabase
    .from('compass_ad_creatives')
    .select(
      'id,name,channel,status,spend,ctr,cpa,roas,leads,impressions,clicks,period_start,period_end'
    )
    .order('spend', { ascending: false })
    .limit(40)

  if (creativeError) throw new Error(creativeError.message)

  const creatives: SyncedCreative[] = (creativeRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    channel: row.channel as SyncedCreative['channel'],
    status: row.status as SyncedCreative['status'],
    spend: Number(row.spend ?? 0),
    ctr: Number(row.ctr ?? 0),
    cpa: Number(row.cpa ?? 0),
    roas: Number(row.roas ?? 0),
    leads: Number(row.leads ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    periodStart: row.period_start ? String(row.period_start) : undefined,
    periodEnd: row.period_end ? String(row.period_end) : undefined
  }))

  // Prefer live today/yesterday from a Meta account when available; else estimate.
  let spendToday = 0
  let spendYesterday = 0
  for (const account of connected) {
    if (account.platform !== 'meta' || !account.access_token_enc) continue
    try {
      const token = decryptSecret(account.access_token_enc)
      spendToday += await fetchMetaAccountSpend(token, account.external_account_id, 'today')
      spendYesterday += await fetchMetaAccountSpend(
        token,
        account.external_account_id,
        'yesterday'
      )
    } catch {
      /* ignore individual account spend failures for glance */
    }
  }
  if (spendToday === 0 && spendYesterday === 0) {
    const windowSpend = creatives.reduce((s, c) => s + c.spend, 0)
    spendToday = windowSpend / 30
    spendYesterday = spendToday
  }

  const glance = aggregateGlance(creatives, {
    spendToday,
    spendYesterday,
    roas7d: glanceRoasBaseline(creatives)
  })

  await supabase.from('compass_ad_glance').upsert({
    id: 'home',
    payload: glance,
    source: creatives.length > 0 ? 'live' : 'demo',
    synced_at: new Date().toISOString()
  })

  return glance
}

function glanceRoasBaseline(creatives: SyncedCreative[]): number {
  // Without historical snapshots, treat blended ROAS as the baseline (delta ~0).
  const spend = creatives.reduce((s, c) => s + c.spend, 0)
  const value = creatives.reduce((s, c) => s + c.roas * c.spend, 0)
  return spend > 0 ? value / spend : 0
}

export async function loadHomeGlance(supabase: SupabaseClient): Promise<{
  glance: HomeAdGlance
  source: 'live' | 'demo'
  syncedAt: string | null
  connectedAccounts: number
}> {
  const { count } = await supabase
    .from('compass_ad_accounts')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'disconnected')

  const connectedAccounts = count ?? 0

  const { data } = await supabase
    .from('compass_ad_glance')
    .select('payload,source,synced_at')
    .eq('id', 'home')
    .maybeSingle()

  if (data?.source === 'live' && data.payload && typeof data.payload === 'object') {
    return {
      glance: data.payload as HomeAdGlance,
      source: 'live',
      syncedAt: data.synced_at ?? null,
      connectedAccounts
    }
  }

  if (connectedAccounts > 0) {
    // Connected but never synced successfully — still surface demo until sync lands.
    return {
      glance: HOME_AD_DEMO,
      source: 'demo',
      syncedAt: data?.synced_at ?? null,
      connectedAccounts
    }
  }

  return {
    glance: HOME_AD_DEMO,
    source: 'demo',
    syncedAt: null,
    connectedAccounts: 0
  }
}
