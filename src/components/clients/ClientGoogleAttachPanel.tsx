'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type GoogleAttachPlan = {
  campaign_name: string
  daily_budget_aud: number
  destination_url: string
  geo?: {
    pending: boolean
    suburbs: string[]
    locations: Array<{ input: string; name: string; resource_name: string }>
    unresolved: string[]
    proximity_fallback: {
      enabled: boolean
      radius_km: number
      anchor: { name: string; resource_name: string }
    } | null
  }
  ad_groups: Array<{
    name: string
    cluster_id: string
    keywords: Array<{ text: string; match: string }>
    rsas: Array<{ headlines: string[]; descriptions: string[] }>
  }>
  negatives: string[]
  assets: {
    sitelinks: Array<{ text: string; url: string; description1?: string; description2?: string }>
    callouts: string[]
    call: { phone_number: string; country_code: string }
  }
  conversion_action: { name: string; type: string; category: string }
}

type GoogleAttachRow = {
  id: string
  status: string
  customer_id: string | null
  link_status: string | null
  destination_url: string | null
  plan: GoogleAttachPlan
  google_ids: Record<string, unknown>
  adsConsoleUrl?: string
  created_at: string
  updated_at: string
}

type GoogleAttachPayload = {
  clientId: string
  clientName: string
  config: { configured: boolean; missing: string[] }
  attaches: GoogleAttachRow[]
}

interface ClientGoogleAttachPanelProps {
  clientId: string
  saving?: boolean
  onBusy?: (busy: boolean) => void
  onError?: (message: string | null) => void
}

function linkTone(status: string | null): string {
  const s = String(status || '').toUpperCase()
  if (s === 'ACTIVE') return 'bg-emerald-50 text-emerald-800'
  if (s === 'PENDING') return 'bg-amber-50 text-amber-800'
  if (s === 'REFUSED' || s === 'CANCELED') return 'bg-rose-50 text-rose-800'
  return 'bg-stone-100 text-stone-600'
}

function statusTone(status: string): string {
  if (status === 'created_paused') return 'bg-sky-50 text-sky-800'
  if (status === 'live') return 'bg-emerald-50 text-emerald-800'
  if (status === 'archived') return 'bg-stone-100 text-stone-500'
  return 'bg-stone-100 text-stone-600'
}

function charCount(text: string, max: number): { count: number; ok: boolean } {
  const count = text.length
  return { count, ok: count <= max }
}

export function ClientGoogleAttachPanel({
  clientId,
  saving = false,
  onBusy = () => {},
  onError = () => {}
}: ClientGoogleAttachPanelProps) {
  const [data, setData] = useState<GoogleAttachPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [customerId, setCustomerId] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmPush, setConfirmPush] = useState(false)

  const load = useCallback(async () => {
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/google-attach`, { cache: 'no-store' })
      const body = (await res.json()) as GoogleAttachPayload & { error?: string }
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`)
      setData(body)
      if (!selectedId && body.attaches.length > 0) {
        setSelectedId(body.attaches[0].id)
        setCustomerId(body.attaches[0].customer_id || '')
        setDestinationUrl(body.attaches[0].destination_url || '')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [clientId, onError, selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const selected = data?.attaches.find((a) => a.id === selectedId) ?? null
  const plan = selected?.plan

  async function createDraft() {
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/google-attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId.trim() || undefined,
          destination_url: destinationUrl.trim() || undefined
        })
      })
      const body = (await res.json()) as { error?: string; id?: string }
      if (!res.ok) throw new Error(body.error || `Create failed (${res.status})`)
      if (body.id) setSelectedId(body.id)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  async function runAction(action: 'invite_mcc' | 'push_paused' | 'archive') {
    if (!selected) return
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/google-attach/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || `${action} failed (${res.status})`)
      setConfirmPush(false)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="compass-panel">
        <CardHeader>
          <CardTitle>Google Ads attach</CardTitle>
          <CardDescription>
            Paused Search campaigns in the client-owned account. Review in Compass, activate in Google Ads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-stone-500">Loading attach plans…</p>
          ) : (
            <>
              {!data?.config.configured ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Google Ads API not configured. Missing: {data?.config.missing.join(', ') || 'env vars'}.
                  Draft plans still work; push requires OAuth + developer token.
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="compass-section-label">Client customer ID</span>
                  <input
                    className="compass-input w-full"
                    placeholder="123-456-7890"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    disabled={saving}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="compass-section-label">Destination URL</span>
                  <input
                    className="compass-input w-full"
                    placeholder="https://switchflow.agency/lp/…"
                    value={destinationUrl}
                    onChange={(e) => setDestinationUrl(e.target.value)}
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="compass-btn-primary"
                  disabled={saving}
                  onClick={() => void createDraft()}
                >
                  Draft plan
                </button>
                {selected ? (
                  <>
                    <button
                      type="button"
                      className="compass-btn-secondary"
                      disabled={saving || !selected.customer_id}
                      onClick={() => void runAction('invite_mcc')}
                    >
                      Send MCC invite
                    </button>
                    <button
                      type="button"
                      className="compass-btn-secondary"
                      disabled={saving || selected.status === 'created_paused'}
                      onClick={() => setConfirmPush(true)}
                    >
                      Push paused
                    </button>
                    {selected.adsConsoleUrl ? (
                      <a
                        href={selected.adsConsoleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="compass-btn-ghost inline-flex items-center"
                      >
                        Open in Google Ads
                      </a>
                    ) : null}
                  </>
                ) : null}
              </div>

              {data && data.attaches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.attaches.map((attach) => (
                    <button
                      key={attach.id}
                      type="button"
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                        attach.id === selectedId ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'
                      }`}
                      onClick={() => {
                        setSelectedId(attach.id)
                        setCustomerId(attach.customer_id || '')
                        setDestinationUrl(attach.destination_url || '')
                      }}
                    >
                      {attach.plan?.campaign_name || attach.id}
                    </button>
                  ))}
                </div>
              ) : null}

              {selected ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${statusTone(selected.status)}`}>
                    {selected.status}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${linkTone(selected.link_status)}`}>
                    MCC: {selected.link_status || 'not linked'}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {plan ? (
        <>
          <Card className="compass-panel">
            <CardHeader>
              <CardTitle className="text-base">Plan review</CardTitle>
              <CardDescription>
                {plan.campaign_name} · ${plan.daily_budget_aud}/day · {plan.ad_groups.length} ad groups
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plan.ad_groups.map((group) => (
                <div key={group.cluster_id} className="rounded-xl border border-stone-200 p-4">
                  <h4 className="font-medium text-stone-900">{group.name}</h4>
                  <p className="mt-1 text-xs text-stone-500">
                    {group.keywords.length} keywords · {group.rsas.length} RSAs
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {group.keywords.slice(0, 12).map((kw) => (
                      <span
                        key={`${group.cluster_id}-${kw.text}-${kw.match}`}
                        className="rounded-lg bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
                      >
                        [{kw.match}] {kw.text}
                      </span>
                    ))}
                    {group.keywords.length > 12 ? (
                      <span className="text-xs text-stone-400">+{group.keywords.length - 12} more</span>
                    ) : null}
                  </div>
                  {group.rsas.map((rsa, idx) => (
                    <div key={`${group.cluster_id}-rsa-${idx}`} className="mt-3 rounded-lg bg-stone-50 p-3">
                      <p className="text-xs font-medium text-stone-600">RSA {idx + 1}</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-stone-700">
                        {rsa.headlines.slice(0, 5).map((h, i) => {
                          const { count, ok } = charCount(h, 30)
                          return (
                            <li key={i} className={ok ? '' : 'text-rose-600'}>
                              H{i + 1}: {h} ({count}/30)
                            </li>
                          )
                        })}
                        {rsa.descriptions.slice(0, 2).map((d, i) => {
                          const { count, ok } = charCount(d, 90)
                          return (
                            <li key={i} className={ok ? 'text-stone-500' : 'text-rose-600'}>
                              D{i + 1}: {d} ({count}/90)
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="compass-panel">
            <CardHeader>
              <CardTitle className="text-base">Geo targeting</CardTitle>
              <CardDescription>
                {plan.geo?.pending
                  ? 'Suburbs pending resolution (will resolve at push if API configured).'
                  : `${plan.geo?.locations.length ?? 0} locations · ${plan.geo?.unresolved.length ?? 0} unresolved`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {plan.geo ? (
                <>
                  <p className="text-xs text-stone-600">
                    Suburbs: {plan.geo.suburbs.join(', ') || '(none)'}
                  </p>
                  {plan.geo.locations.length > 0 ? (
                    <ul className="list-disc pl-5 text-xs text-stone-600">
                      {plan.geo.locations.map((loc) => (
                        <li key={loc.resource_name}>
                          {loc.input} → {loc.name} ({loc.resource_name})
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {plan.geo.proximity_fallback?.enabled ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Proximity fallback: {plan.geo.proximity_fallback.radius_km}km around{' '}
                      {plan.geo.proximity_fallback.anchor.name} (fewer than half suburbs resolved)
                    </p>
                  ) : null}
                  {plan.geo.unresolved.length > 0 ? (
                    <p className="text-xs text-stone-500">
                      Unresolved: {plan.geo.unresolved.join(', ')}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-stone-500">No geo block on this plan.</p>
              )}
            </CardContent>
          </Card>

          <Card className="compass-panel">
            <CardHeader>
              <CardTitle className="text-base">Negatives, assets, conversion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="compass-section-label">Shared negatives ({plan.negatives.length})</p>
                <p className="mt-1 text-xs text-stone-600">{plan.negatives.slice(0, 24).join(', ')}…</p>
              </div>
              <div>
                <p className="compass-section-label">Sitelinks</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-stone-600">
                  {plan.assets.sitelinks.map((s) => (
                    <li key={s.text}>
                      {s.text} → {s.url}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="compass-section-label">Callouts</p>
                <p className="mt-1 text-xs text-stone-600">{plan.assets.callouts.join(' · ')}</p>
              </div>
              <div>
                <p className="compass-section-label">Call asset</p>
                <p className="mt-1 text-xs text-stone-600">
                  {plan.assets.call.phone_number || '(no voice number on client)'} ({plan.assets.call.country_code})
                </p>
              </div>
              <div>
                <p className="compass-section-label">Conversion action</p>
                <p className="mt-1 text-xs text-stone-600">
                  {plan.conversion_action.name} · {plan.conversion_action.type} · {plan.conversion_action.category}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {confirmPush ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
          <div className="compass-panel w-full max-w-md space-y-4 p-6">
            <h3 className="compass-page-title text-lg">Push paused campaign?</h3>
            <p className="text-sm text-stone-600">
              Creates a PAUSED Search campaign in the client Google Ads account. Nothing serves until you enable it
              in Google Ads. MCC link must be ACTIVE.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="compass-btn-ghost" onClick={() => setConfirmPush(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="compass-btn-primary"
                disabled={saving}
                onClick={() => void runAction('push_paused')}
              >
                Confirm push paused
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Mount in ClientDetailPanel (Delivery tab):
 *   <ClientGoogleAttachPanel clientId={client.id} saving={saving} onBusy={setBusy} onError={setError} />
 */
