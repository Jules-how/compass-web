'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function QboSettings({ initialBanner }: { initialBanner?: string | null }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [connected, setConnected] = useState(false)
  const [notice, setNotice] = useState<string | null>(initialBanner ?? null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/qbo/settings', { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as { configured?: boolean; connected?: boolean }
    if (!res.ok) throw new Error('Failed to load QuickBooks status')
    setConfigured(Boolean(body.configured))
    setConnected(Boolean(body.connected))
  }, [])

  useEffect(() => {
    void refresh().catch((err) => setNotice(err instanceof Error ? err.message : String(err)))
  }, [refresh])

  async function disconnect() {
    setBusy(true)
    try {
      const res = await fetch('/api/qbo/settings', { method: 'DELETE' })
      if (!res.ok) throw new Error('Disconnect failed')
      setNotice('QuickBooks disconnected.')
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card id="settings-billing">
      <CardHeader>
        <div>
          <CardTitle>QuickBooks Online</CardTitle>
          <CardDescription>
            Invoices and payment status from your Australian QuickBooks company.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          <span>Status:</span>
          {configured == null ? (
            <span className="text-neutral-400">Checking…</span>
          ) : connected ? (
            <Badge variant="success" appearance="light" size="sm">
              Connected
            </Badge>
          ) : configured ? (
            <Badge variant="secondary" appearance="light" size="sm">
              Ready to connect
            </Badge>
          ) : (
            <Badge variant="secondary" appearance="light" size="sm">
              Setup needed
            </Badge>
          )}
        </div>
        {notice ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-3 text-sm text-neutral-700">
            {notice}
          </div>
        ) : null}
        {configured === false ? (
          <details className="folio-connection-setup"><summary>Server setup required</summary><p className="text-sm text-neutral-500">
            Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_ENV, and QBO_WEBHOOK_VERIFIER. Checklist:
            docs/QBO.md
          </p></details>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {configured ? (
            <a href="/api/qbo/connect" className="compass-btn-primary">
              {connected ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}
            </a>
          ) : null}
          {connected ? (
            <button type="button" className="compass-btn-secondary" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
