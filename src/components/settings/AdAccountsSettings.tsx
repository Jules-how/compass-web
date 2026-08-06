'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdAccountPublic, AdPlatform } from '@/lib/ad-accounts'
import { cn } from '@/lib/utils'

type DiscoverAccount = {
  id: string
  accountId: string
  name: string
  currency: string | null
  status: string | null
}

type PlatformConfig = {
  id: AdPlatform
  label: string
  blurb: string
  tokenHint: string
  accountHint: string
  needsDeveloperToken?: boolean
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'meta',
    label: 'Meta',
    blurb: 'Facebook & Instagram ads — spend, CTR, leads, creative health',
    tokenHint: 'System user or long-lived user token with ads_read',
    accountHint: 'act_… account id (or pick from Discover)'
  },
  {
    id: 'google',
    label: 'Google Ads',
    blurb: 'Search & Performance Max campaigns via the Google Ads API',
    tokenHint: 'OAuth access token (or refresh via Ads API client)',
    accountHint: 'Customer ID (digits only, no dashes)',
    needsDeveloperToken: true
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    blurb: 'Campaign Manager creatives and cost analytics',
    tokenHint: 'Marketing API token with r_ads / reporting scopes',
    accountHint: 'Sponsored account id (numeric)'
  }
]

function formatSynced(iso: string | null) {
  if (!iso) return 'Never synced'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'Never synced'
  return `Synced ${new Date(t).toLocaleString()}`
}

export function AdAccountsSettings({
  initialBanner
}: {
  initialBanner?: string | null
}) {
  const [accounts, setAccounts] = useState<AdAccountPublic[] | null>(null)
  const [oauthMeta, setOauthMeta] = useState(false)
  const [migrationRequired, setMigrationRequired] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialBanner ?? null)

  const [platform, setPlatform] = useState<AdPlatform>('meta')
  const [accessToken, setAccessToken] = useState('')
  const [externalAccountId, setExternalAccountId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [developerToken, setDeveloperToken] = useState('')
  const [loginCustomerId, setLoginCustomerId] = useState('')
  const [leadValue, setLeadValue] = useState('200')
  const [discovered, setDiscovered] = useState<DiscoverAccount[]>([])

  const activePlatform = useMemo(
    () => PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0],
    [platform]
  )

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch('/api/ads/accounts', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const body = (await res.json()) as {
        accounts?: AdAccountPublic[]
        oauth?: { meta?: boolean }
        migrationRequired?: boolean
      }
      setAccounts(body.accounts ?? [])
      setOauthMeta(Boolean(body.oauth?.meta))
      setMigrationRequired(Boolean(body.migrationRequired))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load')
      setAccounts([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function discover() {
    if (!accessToken.trim()) {
      setNotice('Paste an access token first, then Discover accounts.')
      return
    }
    setBusy('discover')
    setNotice(null)
    try {
      const res = await fetch('/api/ads/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, accessToken: accessToken.trim() })
      })
      const body = (await res.json()) as {
        accounts?: DiscoverAccount[]
        hint?: string
        detail?: string
        error?: string
      }
      if (!res.ok) throw new Error(body.detail || body.error || 'Discover failed')
      setDiscovered(body.accounts ?? [])
      if (body.hint) setNotice(body.hint)
      else if ((body.accounts ?? []).length === 0) setNotice('No accounts returned for this token.')
      else setNotice(`Found ${(body.accounts ?? []).length} account(s). Pick one to connect.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Discover failed')
      setDiscovered([])
    } finally {
      setBusy(null)
    }
  }

  async function connect() {
    if (!accessToken.trim() || !externalAccountId.trim()) {
      setNotice('Access token and account id are required.')
      return
    }
    setBusy('connect')
    setNotice(null)
    try {
      const res = await fetch('/api/ads/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          accessToken: accessToken.trim(),
          externalAccountId: externalAccountId.trim(),
          accountName: accountName.trim() || undefined,
          developerToken: developerToken.trim() || undefined,
          loginCustomerId: loginCustomerId.trim() || undefined,
          leadValue: Number(leadValue) || undefined
        })
      })
      const body = (await res.json()) as { error?: string; detail?: string }
      if (!res.ok) throw new Error(body.detail || body.error || 'Connect failed')
      setAccessToken('')
      setExternalAccountId('')
      setAccountName('')
      setDiscovered([])
      setNotice('Account connected. Run Sync to pull creatives into Home.')
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setBusy(null)
    }
  }

  async function syncAccount(id: string) {
    setBusy(`sync:${id}`)
    setNotice(null)
    try {
      const res = await fetch(`/api/ads/accounts/${id}/sync`, { method: 'POST' })
      const body = (await res.json()) as {
        error?: string
        detail?: string
        creativeCount?: number
      }
      if (!res.ok) throw new Error(body.detail || body.error || 'Sync failed')
      setNotice(`Synced ${body.creativeCount ?? 0} creatives. Home glance updated.`)
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Sync failed')
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(id: string) {
    setBusy(`del:${id}`)
    setNotice(null)
    try {
      const res = await fetch(`/api/ads/accounts/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json()) as { detail?: string; error?: string }
        throw new Error(body.detail || body.error || 'Disconnect failed')
      }
      setNotice('Account disconnected.')
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setBusy(null)
    }
  }

  function pickDiscovered(account: DiscoverAccount) {
    setExternalAccountId(account.id || account.accountId)
    setAccountName(account.name)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ad accounts</CardTitle>
            <CardDescription>
              Connect Meta, Google, and LinkedIn so Home shows live spend health — not demo numbers
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {migrationRequired ? (
            <div className="rounded-xl border border-amber-300/70 bg-amber-50/50 px-3.5 py-3 text-sm text-amber-900">
              Apply migration <code className="text-xs">0030_compass_ad_accounts.sql</code> in
              Supabase, then reload this page.
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-3 text-sm text-neutral-700">
              {notice}
            </div>
          ) : null}

          {loadError ? (
            <div className="text-sm text-red-600">{loadError}</div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPlatform(p.id)
                  setDiscovered([])
                  setNotice(null)
                }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                  platform === p.id
                    ? 'border-[#e85d2a]/40 bg-orange-50 text-[#c2410c]'
                    : 'border-stone-200 bg-white text-neutral-600 hover:border-stone-300'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p className="text-sm text-neutral-500">{activePlatform.blurb}</p>

          {platform === 'meta' && oauthMeta ? (
            <a
              href="/api/ads/oauth/meta"
              className="inline-flex items-center rounded-lg bg-[#1877F2] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Connect with Facebook
            </a>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Access token
              </span>
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                rows={3}
                placeholder={activePlatform.tokenHint}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-xs text-neutral-800 outline-none focus:border-stone-400"
              />
            </label>

            {activePlatform.needsDeveloperToken ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    Developer token
                  </span>
                  <input
                    value={developerToken}
                    onChange={(e) => setDeveloperToken(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
                    placeholder="Google Ads API developer token"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    Login customer ID (MCC, optional)
                  </span>
                  <input
                    value={loginCustomerId}
                    onChange={(e) => setLoginCustomerId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
                    placeholder="Manager account id"
                  />
                </label>
              </>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Account id
              </span>
              <input
                value={externalAccountId}
                onChange={(e) => setExternalAccountId(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
                placeholder={activePlatform.accountHint}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Display name
              </span>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
                placeholder="Optional label"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Lead value (for ROAS proxy)
              </span>
              <input
                value={leadValue}
                onChange={(e) => setLeadValue(e.target.value)}
                type="number"
                min={1}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'discover'}
              onClick={() => void discover()}
              className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-stone-300 disabled:opacity-50"
            >
              {busy === 'discover' ? 'Discovering…' : 'Discover accounts'}
            </button>
            <button
              type="button"
              disabled={busy === 'connect'}
              onClick={() => void connect()}
              className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy === 'connect' ? 'Connecting…' : 'Connect account'}
            </button>
          </div>

          {discovered.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Discovered
              </div>
              {discovered.map((account) => (
                <button
                  key={account.id || account.accountId}
                  type="button"
                  onClick={() => pickDiscovered(account)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-3.5 py-3 text-left hover:border-stone-300 hover:bg-stone-50/60"
                >
                  <div>
                    <div className="font-medium text-neutral-900">{account.name}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {account.id || account.accountId}
                      {account.currency ? ` · ${account.currency}` : ''}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#c2410c]">Use</span>
                </button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connected</CardTitle>
            <CardDescription>Sync pulls the last 30 days of creatives into Home</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts === null ? (
            <div className="text-sm text-neutral-500">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-neutral-500">No ad accounts connected yet.</div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-3.5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900">
                      {account.accountName || account.externalAccountId}
                    </span>
                    <Badge
                      variant={
                        account.status === 'connected'
                          ? 'success'
                          : account.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                      }
                      appearance="light"
                      size="sm"
                    >
                      {account.platform} · {account.status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {account.externalAccountId}
                    {account.currency ? ` · ${account.currency}` : ''} ·{' '}
                    {formatSynced(account.lastSyncedAt)}
                    {account.lastError ? ` · ${account.lastError}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === `sync:${account.id}`}
                    onClick={() => void syncAccount(account.id)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-stone-300 disabled:opacity-50"
                  >
                    {busy === `sync:${account.id}` ? 'Syncing…' : 'Sync'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === `del:${account.id}`}
                    onClick={() => void disconnect(account.id)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:border-red-200 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
