'use client'

import { useMemo, useState } from 'react'
import type { CompassMetaAd, CompassMetaAdSet, CompassMetaCampaign } from '@/lib/types'
import { formatMoney } from '@/lib/client-pm'
import {
  META_AD_FORMATS,
  META_AD_STATUSES,
  META_BID_STRATEGIES,
  META_BILLING_EVENTS,
  META_BUDGET_TYPES,
  META_BUYING_TYPES,
  META_CALL_TO_ACTIONS,
  META_CAMPAIGN_OBJECTIVES,
  META_DESTINATION_TYPES,
  META_GENDERS,
  META_OPTIMIZATION_GOALS,
  META_PLACEMENTS,
  META_SPECIAL_AD_CATEGORIES,
  metaAdStatusLabel,
  metaBidStrategyLabel,
  metaCtaLabel,
  metaFormatLabel,
  metaObjectiveLabel,
  metaOptimizationGoalLabel,
  metaPlacementLabel,
  metaSpecialCategoryLabel
} from '@/lib/meta-ads'

type Level = 'campaigns' | 'ad_sets' | 'ads'
type EditorMode = 'create' | 'edit' | null

interface MetaAdsManagerPanelProps {
  clientId: string
  campaigns: CompassMetaCampaign[]
  adSets: CompassMetaAdSet[]
  ads: CompassMetaAd[]
  saving: boolean
  onBusy: (busy: boolean) => void
  onError: (message: string | null) => void
  onRefresh: () => Promise<void>
}

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 disabled:opacity-60'
const labelClass = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400'

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
      : status === 'paused'
        ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : status === 'archived'
          ? 'bg-neutral-100 text-neutral-500 ring-neutral-200'
          : 'bg-sky-50 text-sky-800 ring-sky-200'
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}>
      {metaAdStatusLabel(status)}
    </span>
  )
}

function budgetLabel(
  budgetType: string,
  daily: number | null | undefined,
  lifetime: number | null | undefined,
  currency = 'AUD'
) {
  if (budgetType === 'daily') return `${formatMoney(daily, currency)} / day`
  if (budgetType === 'lifetime') return `${formatMoney(lifetime, currency)} lifetime`
  return 'Using ad set budgets'
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function MetaAdsManagerPanel({
  clientId,
  campaigns,
  adSets,
  ads,
  saving,
  onBusy,
  onError,
  onRefresh
}: MetaAdsManagerPanelProps) {
  const [level, setLevel] = useState<Level>('campaigns')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorMode>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const campaignMap = useMemo(() => {
    const map = new Map<string, CompassMetaCampaign>()
    for (const row of campaigns) map.set(row.id, row)
    return map
  }, [campaigns])

  const adSetMap = useMemo(() => {
    const map = new Map<string, CompassMetaAdSet>()
    for (const row of adSets) map.set(row.id, row)
    return map
  }, [adSets])

  const filteredAdSets = useMemo(() => {
    if (!selectedCampaignId) return adSets
    return adSets.filter((row) => row.campaign_id === selectedCampaignId)
  }, [adSets, selectedCampaignId])

  const filteredAds = useMemo(() => {
    let rows = ads
    if (selectedAdSetId) rows = rows.filter((row) => row.ad_set_id === selectedAdSetId)
    else if (selectedCampaignId) {
      const setIds = new Set(
        adSets.filter((row) => row.campaign_id === selectedCampaignId).map((row) => row.id)
      )
      rows = rows.filter((row) => setIds.has(row.ad_set_id))
    }
    return rows
  }, [ads, adSets, selectedAdSetId, selectedCampaignId])

  const editingCampaign = editingId ? campaignMap.get(editingId) : null
  const editingAdSet = editingId ? adSetMap.get(editingId) : null
  const editingAd = editingId ? ads.find((row) => row.id === editingId) : null

  async function api(
    method: 'POST' | 'PATCH' | 'DELETE',
    payload: Record<string, unknown>
  ) {
    onBusy(true)
    onError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-ads`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      onBusy(false)
    }
  }

  function openCreate() {
    setEditor('create')
    setEditingId(null)
  }

  function openEdit(id: string) {
    setEditor('edit')
    setEditingId(id)
  }

  function closeEditor() {
    setEditor(null)
    setEditingId(null)
  }

  async function handleCopy(label: string, value: string) {
    if (!value) return
    const ok = await copyText(value)
    if (ok) {
      setCopied(label)
      window.setTimeout(() => setCopied(null), 1500)
    }
  }

  const createLabel =
    level === 'campaigns' ? 'Create campaign' : level === 'ad_sets' ? 'Create ad set' : 'Create ad'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="compass-panel p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Campaigns
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-900">
            {campaigns.length}
          </div>
          <div className="text-xs text-neutral-500">
            {campaigns.filter((row) => row.status === 'active').length} active
          </div>
        </div>
        <div className="compass-panel p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Ad sets
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-900">
            {adSets.length}
          </div>
          <div className="text-xs text-neutral-500">
            {adSets.filter((row) => row.status === 'active').length} active
          </div>
        </div>
        <div className="compass-panel p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Ads</div>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-900">
            {ads.length}
          </div>
          <div className="text-xs text-neutral-500">
            {ads.filter((row) => row.status === 'active').length} active
          </div>
        </div>
      </div>

      <div className="compass-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-stone-200 p-0.5">
              {(
                [
                  ['campaigns', 'Campaigns'],
                  ['ad_sets', 'Ad sets'],
                  ['ads', 'Ads']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setLevel(key)
                    closeEditor()
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    level === key
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-stone-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {level !== 'campaigns' ? (
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => {
                  setSelectedCampaignId(e.target.value || null)
                  setSelectedAdSetId(null)
                }}
                className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">All campaigns</option>
                {campaigns.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            ) : null}
            {level === 'ads' ? (
              <select
                value={selectedAdSetId ?? ''}
                onChange={(e) => setSelectedAdSetId(e.target.value || null)}
                className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">All ad sets</option>
                {filteredAdSets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openCreate}
            disabled={saving || (level === 'ad_sets' && campaigns.length === 0) || (level === 'ads' && adSets.length === 0)}
            className="compass-btn-primary"
          >
            {createLabel}
          </button>
        </div>

        <div className="border-b border-stone-100 bg-stone-50/70 px-4 py-2 text-xs text-neutral-500">
          Plan campaigns, ad sets, and ad copy to match Meta Ads Manager before you upload.
          {copied ? <span className="ml-2 text-emerald-700">Copied {copied}</span> : null}
        </div>

        {editor ? (
          <div className="border-b border-stone-100 bg-white px-4 py-4">
            {level === 'campaigns' ? (
              <CampaignForm
                key={editingId ?? 'create-campaign'}
                mode={editor}
                initial={editor === 'edit' ? editingCampaign : null}
                saving={saving}
                onCancel={closeEditor}
                onSubmit={async (payload) => {
                  if (editor === 'edit' && editingId) {
                    await api('PATCH', { kind: 'campaign', id: editingId, ...payload })
                  } else {
                    await api('POST', { kind: 'campaign', ...payload })
                  }
                  closeEditor()
                }}
              />
            ) : null}
            {level === 'ad_sets' ? (
              <AdSetForm
                key={editingId ?? 'create-ad-set'}
                mode={editor}
                campaigns={campaigns}
                initial={editor === 'edit' ? editingAdSet : null}
                defaultCampaignId={selectedCampaignId}
                saving={saving}
                onCancel={closeEditor}
                onSubmit={async (payload) => {
                  if (editor === 'edit' && editingId) {
                    await api('PATCH', { kind: 'ad_set', id: editingId, ...payload })
                  } else {
                    await api('POST', { kind: 'ad_set', ...payload })
                  }
                  closeEditor()
                }}
              />
            ) : null}
            {level === 'ads' ? (
              <AdForm
                key={editingId ?? 'create-ad'}
                mode={editor}
                campaigns={campaigns}
                adSets={adSets}
                initial={editor === 'edit' ? editingAd : null}
                defaultAdSetId={selectedAdSetId}
                defaultCampaignId={selectedCampaignId}
                saving={saving}
                onCancel={closeEditor}
                onCopy={handleCopy}
                onSubmit={async (payload) => {
                  if (editor === 'edit' && editingId) {
                    await api('PATCH', { kind: 'ad', id: editingId, ...payload })
                  } else {
                    await api('POST', { kind: 'ad', ...payload })
                  }
                  closeEditor()
                }}
              />
            ) : null}
          </div>
        ) : null}

        {level === 'campaigns' ? (
          <CampaignTable
            rows={campaigns}
            adSets={adSets}
            ads={ads}
            saving={saving}
            onEdit={openEdit}
            onOpenAdSets={(id) => {
              setSelectedCampaignId(id)
              setLevel('ad_sets')
              closeEditor()
            }}
            onStatus={async (id, status) => {
              await api('PATCH', { kind: 'campaign', id, status })
            }}
            onDelete={async (id) => {
              await api('DELETE', { kind: 'campaign', id })
            }}
          />
        ) : null}

        {level === 'ad_sets' ? (
          <AdSetTable
            rows={filteredAdSets}
            campaigns={campaignMap}
            ads={ads}
            saving={saving}
            onEdit={openEdit}
            onOpenAds={(id) => {
              setSelectedAdSetId(id)
              setLevel('ads')
              closeEditor()
            }}
            onStatus={async (id, status) => {
              await api('PATCH', { kind: 'ad_set', id, status })
            }}
            onDelete={async (id) => {
              await api('DELETE', { kind: 'ad_set', id })
            }}
          />
        ) : null}

        {level === 'ads' ? (
          <AdTable
            rows={filteredAds}
            adSets={adSetMap}
            campaigns={campaignMap}
            saving={saving}
            onEdit={openEdit}
            onCopy={handleCopy}
            onStatus={async (id, status) => {
              await api('PATCH', { kind: 'ad', id, status })
            }}
            onDelete={async (id) => {
              await api('DELETE', { kind: 'ad', id })
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function CampaignTable({
  rows,
  adSets,
  ads,
  saving,
  onEdit,
  onOpenAdSets,
  onStatus,
  onDelete
}: {
  rows: CompassMetaCampaign[]
  adSets: CompassMetaAdSet[]
  ads: CompassMetaAd[]
  saving: boolean
  onEdit: (id: string) => void
  onOpenAdSets: (id: string) => void
  onStatus: (id: string, status: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-neutral-500">
        No campaigns yet. Create one to start the Meta hierarchy.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-stone-50/80 text-[11px] uppercase tracking-wide text-neutral-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">Off / On</th>
            <th className="px-4 py-2.5 font-medium">Campaign</th>
            <th className="px-4 py-2.5 font-medium">Objective</th>
            <th className="px-4 py-2.5 font-medium">Budget</th>
            <th className="px-4 py-2.5 font-medium">Ad sets</th>
            <th className="px-4 py-2.5 font-medium">Ads</th>
            <th className="px-4 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const setCount = adSets.filter((s) => s.campaign_id === row.id).length
            const setIds = new Set(adSets.filter((s) => s.campaign_id === row.id).map((s) => s.id))
            const adCount = ads.filter((a) => setIds.has(a.ad_set_id)).length
            return (
              <tr key={row.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void onStatus(row.id, row.status === 'active' ? 'paused' : 'active')
                    }
                    className={`relative h-5 w-9 rounded-full transition ${
                      row.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-300'
                    }`}
                    title={row.status === 'active' ? 'Pause' : 'Activate'}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                        row.status === 'active' ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row.id)}
                    className="text-left font-medium text-neutral-900 hover:underline"
                  >
                    {row.name}
                  </button>
                  <div className="mt-0.5 flex items-center gap-2">
                    <StatusPill status={row.status} />
                    {row.special_ad_categories.length > 0 ? (
                      <span className="text-[11px] text-neutral-400">
                        {row.special_ad_categories.length} special categor
                        {row.special_ad_categories.length === 1 ? 'y' : 'ies'}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-700">{metaObjectiveLabel(row.objective)}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-700">
                  {budgetLabel(row.budget_type, row.daily_budget, row.lifetime_budget, row.currency)}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenAdSets(row.id)}
                    className="tabular-nums text-neutral-800 hover:underline"
                  >
                    {setCount}
                  </button>
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-700">{adCount}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onDelete(row.id)}
                    className="text-xs text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AdSetTable({
  rows,
  campaigns,
  ads,
  saving,
  onEdit,
  onOpenAds,
  onStatus,
  onDelete
}: {
  rows: CompassMetaAdSet[]
  campaigns: Map<string, CompassMetaCampaign>
  ads: CompassMetaAd[]
  saving: boolean
  onEdit: (id: string) => void
  onOpenAds: (id: string) => void
  onStatus: (id: string, status: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-neutral-500">
        No ad sets yet. Create one under a campaign to define targeting and budget.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-stone-50/80 text-[11px] uppercase tracking-wide text-neutral-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">Off / On</th>
            <th className="px-4 py-2.5 font-medium">Ad set</th>
            <th className="px-4 py-2.5 font-medium">Campaign</th>
            <th className="px-4 py-2.5 font-medium">Optimisation</th>
            <th className="px-4 py-2.5 font-medium">Budget</th>
            <th className="px-4 py-2.5 font-medium">Audience</th>
            <th className="px-4 py-2.5 font-medium">Ads</th>
            <th className="px-4 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const campaign = campaigns.get(row.campaign_id)
            const adCount = ads.filter((a) => a.ad_set_id === row.id).length
            return (
              <tr key={row.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void onStatus(row.id, row.status === 'active' ? 'paused' : 'active')
                    }
                    className={`relative h-5 w-9 rounded-full transition ${
                      row.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                        row.status === 'active' ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row.id)}
                    className="text-left font-medium text-neutral-900 hover:underline"
                  >
                    {row.name}
                  </button>
                  <div className="mt-0.5">
                    <StatusPill status={row.status} />
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-600">{campaign?.name ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-700">
                  {metaOptimizationGoalLabel(row.optimization_goal)}
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-700">
                  {budgetLabel(row.budget_type, row.daily_budget, row.lifetime_budget, row.currency)}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 text-neutral-600">
                  {row.age_min}–{row.age_max} · {row.genders} · {row.locations || 'No locations'}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenAds(row.id)}
                    className="tabular-nums text-neutral-800 hover:underline"
                  >
                    {adCount}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onDelete(row.id)}
                    className="text-xs text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AdTable({
  rows,
  adSets,
  campaigns,
  saving,
  onEdit,
  onCopy,
  onStatus,
  onDelete
}: {
  rows: CompassMetaAd[]
  adSets: Map<string, CompassMetaAdSet>
  campaigns: Map<string, CompassMetaCampaign>
  saving: boolean
  onEdit: (id: string) => void
  onCopy: (label: string, value: string) => void
  onStatus: (id: string, status: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-neutral-500">
        No ads yet. Add ad copy that matches what you will upload to Meta.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-stone-50/80 text-[11px] uppercase tracking-wide text-neutral-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">Off / On</th>
            <th className="px-4 py-2.5 font-medium">Ad</th>
            <th className="px-4 py-2.5 font-medium">Ad set</th>
            <th className="px-4 py-2.5 font-medium">Format</th>
            <th className="px-4 py-2.5 font-medium">Primary text</th>
            <th className="px-4 py-2.5 font-medium">Headline</th>
            <th className="px-4 py-2.5 font-medium">CTA</th>
            <th className="px-4 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const adSet = adSets.get(row.ad_set_id)
            const campaign = adSet ? campaigns.get(adSet.campaign_id) : null
            return (
              <tr key={row.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void onStatus(row.id, row.status === 'active' ? 'paused' : 'active')
                    }
                    className={`relative h-5 w-9 rounded-full transition ${
                      row.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                        row.status === 'active' ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row.id)}
                    className="text-left font-medium text-neutral-900 hover:underline"
                  >
                    {row.name}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <StatusPill status={row.status} />
                    {campaign ? (
                      <span className="text-[11px] text-neutral-400">{campaign.name}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-600">{adSet?.name ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-700">{metaFormatLabel(row.format)}</td>
                <td className="max-w-[220px] px-4 py-3">
                  <button
                    type="button"
                    className="line-clamp-2 text-left text-neutral-700 hover:underline"
                    title="Copy primary text"
                    onClick={() => onCopy('primary text', row.primary_text || '')}
                  >
                    {row.primary_text || '—'}
                  </button>
                </td>
                <td className="max-w-[160px] px-4 py-3">
                  <button
                    type="button"
                    className="line-clamp-2 text-left text-neutral-700 hover:underline"
                    title="Copy headline"
                    onClick={() => onCopy('headline', row.headline || '')}
                  >
                    {row.headline || '—'}
                  </button>
                </td>
                <td className="px-4 py-3 text-neutral-700">{metaCtaLabel(row.call_to_action)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onDelete(row.id)}
                    className="text-xs text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CampaignForm({
  mode,
  initial,
  saving,
  onCancel,
  onSubmit
}: {
  mode: 'create' | 'edit'
  initial: CompassMetaCampaign | null | undefined
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [objective, setObjective] = useState(initial?.objective ?? 'OUTCOME_LEADS')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [buyingType, setBuyingType] = useState(initial?.buying_type ?? 'auction')
  const [budgetType, setBudgetType] = useState(initial?.budget_type ?? 'none')
  const [dailyBudget, setDailyBudget] = useState(
    initial?.daily_budget != null ? String(initial.daily_budget) : ''
  )
  const [lifetimeBudget, setLifetimeBudget] = useState(
    initial?.lifetime_budget != null ? String(initial.lifetime_budget) : ''
  )
  const [categories, setCategories] = useState<string[]>(initial?.special_ad_categories ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim()) return
        void onSubmit({
          name: name.trim(),
          objective,
          status,
          buying_type: buyingType,
          budget_type: budgetType,
          daily_budget: dailyBudget ? Number(dailyBudget) : null,
          lifetime_budget: lifetimeBudget ? Number(lifetimeBudget) : null,
          special_ad_categories: categories,
          notes: notes.trim() || null
        })
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-800">
          {mode === 'edit' ? 'Edit campaign' : 'New campaign'}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={labelClass}>Campaign name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} required />
        </label>
        <label>
          <span className={labelClass}>Objective</span>
          <select className={inputClass} value={objective} onChange={(e) => setObjective(e.target.value)} disabled={saving}>
            {META_CAMPAIGN_OBJECTIVES.map((value) => (
              <option key={value} value={value}>
                {metaObjectiveLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Status</span>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
            {META_AD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {metaAdStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Buying type</span>
          <select className={inputClass} value={buyingType} onChange={(e) => setBuyingType(e.target.value)} disabled={saving}>
            {META_BUYING_TYPES.map((value) => (
              <option key={value} value={value}>
                {value === 'auction' ? 'Auction' : 'Reserved'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Campaign budget</span>
          <select className={inputClass} value={budgetType} onChange={(e) => setBudgetType(e.target.value)} disabled={saving}>
            {META_BUDGET_TYPES.map((value) => (
              <option key={value} value={value}>
                {value === 'none' ? 'Ad set budget (Advantage campaign budget off)' : value === 'daily' ? 'Daily campaign budget' : 'Lifetime campaign budget'}
              </option>
            ))}
          </select>
        </label>
        {budgetType === 'daily' ? (
          <label>
            <span className={labelClass}>Daily budget (AUD)</span>
            <input type="number" step="0.01" className={inputClass} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} disabled={saving} />
          </label>
        ) : null}
        {budgetType === 'lifetime' ? (
          <label>
            <span className={labelClass}>Lifetime budget (AUD)</span>
            <input type="number" step="0.01" className={inputClass} value={lifetimeBudget} onChange={(e) => setLifetimeBudget(e.target.value)} disabled={saving} />
          </label>
        ) : null}
      </div>
      <fieldset>
        <legend className={labelClass}>Special ad categories</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {META_SPECIAL_AD_CATEGORIES.map((value) => {
            const checked = categories.includes(value)
            return (
              <label key={value} className="inline-flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={() =>
                    setCategories((prev) =>
                      checked ? prev.filter((item) => item !== value) : [...prev, value]
                    )
                  }
                />
                {metaSpecialCategoryLabel(value)}
              </label>
            )
          })}
        </div>
      </fieldset>
      <label>
        <span className={labelClass}>Notes</span>
        <textarea className={`${inputClass} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="compass-btn-primary"
        >
          {mode === 'edit' ? 'Save campaign' : 'Create campaign'}
        </button>
      </div>
    </form>
  )
}

function AdSetForm({
  mode,
  campaigns,
  initial,
  defaultCampaignId,
  saving,
  onCancel,
  onSubmit
}: {
  mode: 'create' | 'edit'
  campaigns: CompassMetaCampaign[]
  initial: CompassMetaAdSet | null | undefined
  defaultCampaignId: string | null
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [campaignId, setCampaignId] = useState(
    initial?.campaign_id ?? defaultCampaignId ?? campaigns[0]?.id ?? ''
  )
  const [name, setName] = useState(initial?.name ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [optimizationGoal, setOptimizationGoal] = useState(
    initial?.optimization_goal ?? 'LEAD_GENERATION'
  )
  const [billingEvent, setBillingEvent] = useState(initial?.billing_event ?? 'IMPRESSIONS')
  const [bidStrategy, setBidStrategy] = useState(
    initial?.bid_strategy ?? 'LOWEST_COST_WITHOUT_CAP'
  )
  const [budgetType, setBudgetType] = useState(initial?.budget_type ?? 'daily')
  const [dailyBudget, setDailyBudget] = useState(
    initial?.daily_budget != null ? String(initial.daily_budget) : ''
  )
  const [lifetimeBudget, setLifetimeBudget] = useState(
    initial?.lifetime_budget != null ? String(initial.lifetime_budget) : ''
  )
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [ageMin, setAgeMin] = useState(String(initial?.age_min ?? 18))
  const [ageMax, setAgeMax] = useState(String(initial?.age_max ?? 65))
  const [genders, setGenders] = useState(initial?.genders ?? 'all')
  const [locations, setLocations] = useState(initial?.locations ?? '')
  const [detailedTargeting, setDetailedTargeting] = useState(initial?.detailed_targeting ?? '')
  const [placements, setPlacements] = useState(initial?.placements ?? 'advantage_plus')
  const [placementNotes, setPlacementNotes] = useState(initial?.placement_notes ?? '')
  const [destinationType, setDestinationType] = useState(initial?.destination_type ?? 'WEBSITE')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || !campaignId) return
        void onSubmit({
          campaign_id: campaignId,
          name: name.trim(),
          status,
          optimization_goal: optimizationGoal,
          billing_event: billingEvent,
          bid_strategy: bidStrategy,
          budget_type: budgetType,
          daily_budget: dailyBudget ? Number(dailyBudget) : null,
          lifetime_budget: lifetimeBudget ? Number(lifetimeBudget) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          age_min: Number(ageMin) || 18,
          age_max: Number(ageMax) || 65,
          genders,
          locations: locations.trim() || null,
          detailed_targeting: detailedTargeting.trim() || null,
          placements,
          placement_notes: placementNotes.trim() || null,
          destination_type: destinationType,
          notes: notes.trim() || null
        })
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-800">
          {mode === 'edit' ? 'Edit ad set' : 'New ad set'}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={labelClass}>Campaign</span>
          <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} disabled={saving} required>
            {campaigns.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Ad set name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} required />
        </label>
        <label>
          <span className={labelClass}>Status</span>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
            {META_AD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {metaAdStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Performance goal</span>
          <select className={inputClass} value={optimizationGoal} onChange={(e) => setOptimizationGoal(e.target.value)} disabled={saving}>
            {META_OPTIMIZATION_GOALS.map((value) => (
              <option key={value} value={value}>
                {metaOptimizationGoalLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Billing event</span>
          <select className={inputClass} value={billingEvent} onChange={(e) => setBillingEvent(e.target.value)} disabled={saving}>
            {META_BILLING_EVENTS.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Bid strategy</span>
          <select className={inputClass} value={bidStrategy} onChange={(e) => setBidStrategy(e.target.value)} disabled={saving}>
            {META_BID_STRATEGIES.map((value) => (
              <option key={value} value={value}>
                {metaBidStrategyLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Budget type</span>
          <select
            className={inputClass}
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value)}
            disabled={saving}
          >
            <option value="daily">Daily</option>
            <option value="lifetime">Lifetime</option>
          </select>
        </label>
        {budgetType === 'daily' ? (
          <label>
            <span className={labelClass}>Daily budget (AUD)</span>
            <input type="number" step="0.01" className={inputClass} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} disabled={saving} />
          </label>
        ) : (
          <label>
            <span className={labelClass}>Lifetime budget (AUD)</span>
            <input type="number" step="0.01" className={inputClass} value={lifetimeBudget} onChange={(e) => setLifetimeBudget(e.target.value)} disabled={saving} />
          </label>
        )}
        <label>
          <span className={labelClass}>Start date</span>
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} />
        </label>
        <label>
          <span className={labelClass}>End date</span>
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={saving} />
        </label>
        <label>
          <span className={labelClass}>Age min</span>
          <input type="number" min={13} max={65} className={inputClass} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} disabled={saving} />
        </label>
        <label>
          <span className={labelClass}>Age max</span>
          <input type="number" min={13} max={65} className={inputClass} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} disabled={saving} />
        </label>
        <label>
          <span className={labelClass}>Gender</span>
          <select className={inputClass} value={genders} onChange={(e) => setGenders(e.target.value)} disabled={saving}>
            {META_GENDERS.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All' : value === 'men' ? 'Men' : 'Women'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Destination</span>
          <select className={inputClass} value={destinationType} onChange={(e) => setDestinationType(e.target.value)} disabled={saving}>
            {META_DESTINATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className={labelClass}>Locations</span>
          <input
            className={inputClass}
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="e.g. Australia · Sydney 25km · exclude regional QLD"
            disabled={saving}
          />
        </label>
        <label className="md:col-span-2">
          <span className={labelClass}>Detailed targeting</span>
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={detailedTargeting}
            onChange={(e) => setDetailedTargeting(e.target.value)}
            placeholder="Interests, behaviours, custom audiences, exclusions…"
            disabled={saving}
          />
        </label>
        <label>
          <span className={labelClass}>Placements</span>
          <select className={inputClass} value={placements} onChange={(e) => setPlacements(e.target.value)} disabled={saving}>
            {META_PLACEMENTS.map((value) => (
              <option key={value} value={value}>
                {metaPlacementLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Placement notes</span>
          <input
            className={inputClass}
            value={placementNotes}
            onChange={(e) => setPlacementNotes(e.target.value)}
            placeholder="Feed only, exclude Audience Network…"
            disabled={saving}
          />
        </label>
        <label className="md:col-span-2">
          <span className={labelClass}>Notes</span>
          <textarea className={`${inputClass} min-h-[64px]`} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
        </label>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !name.trim() || !campaignId}
          className="compass-btn-primary"
        >
          {mode === 'edit' ? 'Save ad set' : 'Create ad set'}
        </button>
      </div>
    </form>
  )
}

function AdForm({
  mode,
  campaigns,
  adSets,
  initial,
  defaultAdSetId,
  defaultCampaignId,
  saving,
  onCancel,
  onCopy,
  onSubmit
}: {
  mode: 'create' | 'edit'
  campaigns: CompassMetaCampaign[]
  adSets: CompassMetaAdSet[]
  initial: CompassMetaAd | null | undefined
  defaultAdSetId: string | null
  defaultCampaignId: string | null
  saving: boolean
  onCancel: () => void
  onCopy: (label: string, value: string) => void
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}) {
  const initialAdSet = initial ? adSets.find((row) => row.id === initial.ad_set_id) : null
  const [campaignFilter, setCampaignFilter] = useState(
    initialAdSet?.campaign_id ?? defaultCampaignId ?? campaigns[0]?.id ?? ''
  )
  const availableAdSets = useMemo(
    () => adSets.filter((row) => !campaignFilter || row.campaign_id === campaignFilter),
    [adSets, campaignFilter]
  )
  const [adSetId, setAdSetId] = useState(
    initial?.ad_set_id ?? defaultAdSetId ?? availableAdSets[0]?.id ?? ''
  )
  const [name, setName] = useState(initial?.name ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [format, setFormat] = useState(initial?.format ?? 'single_image')
  const [primaryText, setPrimaryText] = useState(initial?.primary_text ?? '')
  const [headline, setHeadline] = useState(initial?.headline ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [cta, setCta] = useState(initial?.call_to_action ?? 'LEARN_MORE')
  const [destinationUrl, setDestinationUrl] = useState(initial?.destination_url ?? '')
  const [displayLink, setDisplayLink] = useState(initial?.display_link ?? '')
  const [mediaNotes, setMediaNotes] = useState(initial?.media_notes ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || !adSetId) return
        void onSubmit({
          ad_set_id: adSetId,
          name: name.trim(),
          status,
          format,
          primary_text: primaryText.trim() || null,
          headline: headline.trim() || null,
          description: description.trim() || null,
          call_to_action: cta,
          destination_url: destinationUrl.trim() || null,
          display_link: displayLink.trim() || null,
          media_notes: mediaNotes.trim() || null,
          notes: notes.trim() || null
        })
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-800">
          {mode === 'edit' ? 'Edit ad' : 'New ad'}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-800">
          Cancel
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={labelClass}>Campaign</span>
          <select
            className={inputClass}
            value={campaignFilter}
            onChange={(e) => {
              const next = e.target.value
              setCampaignFilter(next)
              const nextSets = adSets.filter((row) => row.campaign_id === next)
              if (!nextSets.some((row) => row.id === adSetId)) {
                setAdSetId(nextSets[0]?.id ?? '')
              }
            }}
            disabled={saving}
          >
            {campaigns.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Ad set</span>
          <select className={inputClass} value={adSetId} onChange={(e) => setAdSetId(e.target.value)} disabled={saving} required>
            {availableAdSets.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Ad name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} required />
        </label>
        <label>
          <span className={labelClass}>Status</span>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
            {META_AD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {metaAdStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Format</span>
          <select className={inputClass} value={format} onChange={(e) => setFormat(e.target.value)} disabled={saving}>
            {META_AD_FORMATS.map((value) => (
              <option key={value} value={value}>
                {metaFormatLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Call to action</span>
          <select className={inputClass} value={cta} onChange={(e) => setCta(e.target.value)} disabled={saving}>
            {META_CALL_TO_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {metaCtaLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={labelClass}>Primary text</span>
            <button
              type="button"
              className="text-[11px] text-neutral-500 hover:text-neutral-800"
              onClick={() => onCopy('primary text', primaryText)}
            >
              Copy
            </button>
          </div>
          <textarea
            className={`${inputClass} min-h-[96px]`}
            value={primaryText}
            onChange={(e) => setPrimaryText(e.target.value)}
            placeholder="Primary text shown above the creative…"
            disabled={saving}
          />
        </label>
        <label>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={labelClass}>Headline</span>
            <button
              type="button"
              className="text-[11px] text-neutral-500 hover:text-neutral-800"
              onClick={() => onCopy('headline', headline)}
            >
              Copy
            </button>
          </div>
          <input className={inputClass} value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={saving} />
        </label>
        <label>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={labelClass}>Description</span>
            <button
              type="button"
              className="text-[11px] text-neutral-500 hover:text-neutral-800"
              onClick={() => onCopy('description', description)}
            >
              Copy
            </button>
          </div>
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
        </label>
        <label>
          <span className={labelClass}>Destination URL</span>
          <input className={inputClass} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://" disabled={saving} />
        </label>
        <label>
          <span className={labelClass}>Display link</span>
          <input className={inputClass} value={displayLink} onChange={(e) => setDisplayLink(e.target.value)} placeholder="example.com/offer" disabled={saving} />
        </label>
        <label className="md:col-span-2">
          <span className={labelClass}>Creative / media notes</span>
          <textarea
            className={`${inputClass} min-h-[64px]`}
            value={mediaNotes}
            onChange={(e) => setMediaNotes(e.target.value)}
            placeholder="Asset filenames, aspect ratios, UGC brief…"
            disabled={saving}
          />
        </label>
        <label className="md:col-span-2">
          <span className={labelClass}>Internal notes</span>
          <textarea className={`${inputClass} min-h-[64px]`} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
        </label>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !name.trim() || !adSetId}
          className="compass-btn-primary"
        >
          {mode === 'edit' ? 'Save ad' : 'Create ad'}
        </button>
      </div>
    </form>
  )
}
