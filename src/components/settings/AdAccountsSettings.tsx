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

  const [instantlyConfigured, setInstantlyConfigured] = useState<boolean | null>(null)
  const [instantlySource, setInstantlySource] = useState<'env' | 'settings' | 'none'>('none')
  const [instantlyKey, setInstantlyKey] = useState('')
  const [instantlyNotice, setInstantlyNotice] = useState<string | null>(null)

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

  const refreshInstantly = useCallback(async () => {
    try {
      const res = await fetch('/api/instantly/settings', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load Instantly (${res.status})`)
      const body = (await res.json()) as {
        configured?: boolean
        source?: 'env' | 'settings' | 'none'
      }
      setInstantlyConfigured(Boolean(body.configured))
      setInstantlySource(body.source ?? 'none')
    } catch {
      setInstantlyConfigured(false)
      setInstantlySource('none')
    }
  }, [])

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
    void refreshInstantly()
  }, [refresh, refreshInstantly])

  async function saveInstantlyKey() {
    setBusy('instantly')
    setInstantlyNotice(null)
    try {
      const res = await fetch('/api/instantly/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: instantlyKey.trim() })
      })
      const body = (await res.json()) as {
        error?: string
        detail?: string
        configured?: boolean
        source?: 'env' | 'settings' | 'none'
      }
      if (!res.ok) throw new Error(body.detail || body.error || 'Save failed')
      setInstantlyKey('')
      setInstantlyConfigured(Boolean(body.configured))
      setInstantlySource(body.source ?? 'none')
      setInstantlyNotice(
        instantlyKey.trim()
          ? 'Instantly connected — Home cold email will use live campaigns.'
          : 'Stored Instantly key cleared.'
      )
    } catch (err) {
      setInstantlyNotice(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(null)
    }
  }

  async function clearInstantlyKey() {
    setBusy('instantly')
    setInstantlyNotice(null)
    try {
      const res = await fetch('/api/instantly/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' })
      })
      if (!res.ok) throw new Error('Clear failed')
      setInstantlyConfigured(false)
      setInstantlySource('none')
      setInstantlyNotice('Stored Instantly key cleared.')
    } catch (err) {
      setInstantlyNotice(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setBusy(null)
    }
  }

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
            <CardTitle>Instantly (cold email)</CardTitle>
            <CardDescription>
              Home cold-email metrics pull live from Instantly when an API key is set
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            <span>Status:</span>
            {instantlyConfigured == null ? (
              <span className="text-neutral-400">Checking…</span>
            ) : instantlyConfigured ? (
              <Badge variant="success" appearance="light" size="sm">
                Live · {instantlySource === 'env' ? 'env' : 'settings'}
              </Badge>
            ) : (
              <Badge variant="secondary" appearance="light" size="sm">
                Demo until connected
              </Badge>
            )}
          </div>
          {instantlyNotice ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-3 text-sm text-neutral-700">
              {instantlyNotice}
            </div>
          ) : null}
          {instantlySource === 'env' ? (
            <p className="text-sm text-neutral-500">
              Instantly is configured via <code className="text-xs">INSTANTLY_API_KEY</code> on the
              server. You can still store a backup key below.
            </p>
          ) : null}
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Instantly API key
            </label>
            <input
              type="password"
              autoComplete="off"
              value={instantlyKey}
              onChange={(e) => setInstantlyKey(e.target.value)}
              placeholder="Paste from Instantly → Settings → Integrations → API"
              className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'instantly' || !instantlyKey.trim()}
              onClick={() => void saveInstantlyKey()}
              className="rounded-xl bg-[#e85d2a] px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-[#d14e1f] disabled:opacity-50"
            >
              {busy === 'instantly' ? 'Saving…' : 'Save & verify'}
            </button>
            {instantlySource === 'settings' ? (
              <button
                type="button"
                disabled={busy === 'instantly'}
                onClick={() => void clearInstantlyKey()}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-stone-300 disabled:opacity-50"
              >
                Clear stored key
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>

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

          {loadError ? <div className="text-sm text-red-600">{loadError}</div> : null}

          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPlatform(p.id)
                  setDiscovered([])
                }}
                className={cn(
                  'rounded-xl border px-3.5 py-2 text-sm font-medium transition',
                  platform === p.id
                    ? 'border-[#e85d2a]/40 bg-orange-50 text-[#c2410c] shadow-soft'
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
              className="inline-flex rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-soft transition hover:border-stone-300"
            >
              Connect with Facebook
            </a>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Access token
              </label>
              <input
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={activePlatform.tokenHint}
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Account id
              </label>
              <input
                value={externalAccountId}
                onChange={(e) => setExternalAccountId(e.target.value)}
                placeholder={activePlatform.accountHint}
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Display name
              </label>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Optional label"
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
              />
            </div>
            {activePlatform.needsDeveloperToken ? (
              <>
                <div className="space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                    Developer token
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={developerToken}
                    onChange={(e) => setDeveloperToken(e.target.value)}
                    placeholder="Google Ads developer token"
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                    Login customer id
                  </label>
                  <input
                    value={loginCustomerId}
                    onChange={(e) => setLoginCustomerId(e.target.value)}
                    placeholder="MCC id if required"
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Lead value ($)
              </label>
              <input
                value={leadValue}
                onChange={(e) => setLeadValue(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none ring-[#e85d2a]/30 focus:ring-2"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(platform === 'meta' || platform === 'linkedin') && (
              <button
                type="button"
                disabled={busy === 'discover'}
                onClick={() => void discover()}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-soft transition hover:border-stone-300 disabled:opacity-50"
              >
                {busy === 'discover' ? 'Discovering…' : 'Discover accounts'}
              </button>
            )}
            <button
              type="button"
              disabled={busy === 'connect'}
              onClick={() => void connect()}
              className="rounded-xl bg-[#e85d2a] px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-[#d14e1f] disabled:opacity-50"
            >
              {busy === 'connect' ? 'Connecting…' : 'Connect account'}
            </button>
          </div>

          {discovered.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
                Discovered
              </div>
              {discovered.map((account) => (
                <button
                  key={account.id || account.accountId}
                  type="button"
                  onClick={() => pickDiscovered(account)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200/70 bg-white px-3.5 py-2.5 text-left text-sm transition hover:border-[#e85d2a]/40"
                >
                  <span className="min-w-0 truncate font-medium text-neutral-900">
                    {account.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                    {account.id || account.accountId}
                    {account.currency ? ` · ${account.currency}` : ''}
                  </span>
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
                    {!account.hasToken ? (
                      <Badge variant="destructive" appearance="light" size="sm">
                        Token needed
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {account.externalAccountId}
                    {account.currency ? ` · ${account.currency}` : ''} ·{' '}
                    {formatSynced(account.lastSyncedAt)}
                    {account.lastError ? ` · ${account.lastError}` : ''}
                    {!account.hasToken
                      ? ' · Re-connect with a token to enable Sync refreshes'
                      : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === `sync:${account.id}` || !account.hasToken}
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
