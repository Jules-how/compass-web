'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { CompassCampaign } from '@/lib/campaigns'
import {
  copyStatusLabel,
  previewExpression,
  type OutboundSequence
} from '@/lib/outbound-copy'
import { getLocalOfferByKey } from '@/lib/outbound-local-store'
import { LOCATION_TAG_HINTS, VERTICAL_TAG_HINTS } from '@/lib/outbound-copy'

export function CampaignCopyMeta({
  campaign,
  sequence,
  onChange,
  unbound
}: {
  campaign: CompassCampaign | null
  sequence: OutboundSequence | null
  onChange: (patch: Partial<CompassCampaign>) => void
  unbound?: boolean
}) {
  const offer = useMemo(
    () => (campaign?.offer_key ? getLocalOfferByKey(campaign.offer_key) : null),
    [campaign?.offer_key]
  )

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-stone-200/70 bg-white shadow-soft">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-neutral-900">Campaign meta</h2>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {unbound ? 'Unbound draft — attach to a pipeline campaign when ready' : campaign?.name}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <Field label="Offer">
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2 text-[12px]">
            {campaign?.offer_key ? (
              <>
                <div className="font-medium text-neutral-900">{offer?.name ?? campaign.offer_key}</div>
                <div className="text-neutral-500">{campaign.offer_key}</div>
              </>
            ) : (
              <span className="text-neutral-400">Drag an offer into the editor</span>
            )}
          </div>
        </Field>
        <Field label="Structure">
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2 text-[12px] text-neutral-700">
            {sequence?.structure_id || campaign?.structure_id || '—'}
          </div>
        </Field>
        <Field label="Opener mode">
          <select
            value={campaign?.opener_mode || 'nick-tier'}
            onChange={(e) => onChange({ opener_mode: e.target.value })}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px]"
          >
            <option value="nick-tier">nick-tier</option>
            <option value="platten-hook">platten-hook</option>
            <option value="connor-intel">connor-intel</option>
            <option value="none">none</option>
            <option value="custom">custom</option>
          </select>
        </Field>
        <Field label="Copy status">
          <select
            value={campaign?.copy_status || 'none'}
            onChange={(e) => onChange({ copy_status: e.target.value })}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px]"
          >
            {['none', 'draft', 'ready', 'live'].map((s) => (
              <option key={s} value={s}>
                {copyStatusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vertical tags">
          <TagEditor
            value={campaign?.vertical_tags ?? []}
            hints={[...VERTICAL_TAG_HINTS]}
            onChange={(vertical_tags) => onChange({ vertical_tags })}
          />
        </Field>
        <Field label="Location tags">
          <TagEditor
            value={campaign?.location_tags ?? []}
            hints={[...LOCATION_TAG_HINTS]}
            onChange={(location_tags) => onChange({ location_tags })}
          />
        </Field>
        <Field label="Locked cold expression">
          <textarea
            value={campaign?.cold_expression ?? ''}
            onChange={(e) => onChange({ cold_expression: e.target.value || null })}
            rows={4}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] leading-relaxed"
            placeholder="Campaign-locked X-in-Y-or-Z line"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Preview: {previewExpression(campaign?.cold_expression, 120) || '—'}
          </p>
        </Field>
        <Field label="Instantly campaign id">
          <input
            value={campaign?.instantly_campaign_id ?? ''}
            onChange={(e) => onChange({ instantly_campaign_id: e.target.value || null })}
            placeholder="Link only — no auto-activate"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px]"
          />
        </Field>
        {campaign?.id && !unbound ? (
          <Link
            href={`/sales/pipeline/${campaign.id}`}
            className="inline-flex text-[12px] font-medium text-[#c2410c] hover:underline"
          >
            Open in Campaign Planner →
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function TagEditor({
  value,
  hints,
  onChange
}: {
  value: string[]
  hints: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {hints.map((tag) => {
          const active = value.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              onClick={() =>
                onChange(active ? value.filter((t) => t !== tag) : [...value, tag])
              }
              className={
                active
                  ? 'rounded-xl border border-[#e85d2a]/40 bg-[#e85d2a]/10 px-2 py-1 text-[11px] text-[#c2410c]'
                  : 'rounded-xl border border-stone-200 px-2 py-1 text-[11px] text-neutral-600'
              }
            >
              {tag}
            </button>
          )
        })}
      </div>
      <input
        value={value.join(', ')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean)
          )
        }
        placeholder="comma-separated tags"
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px]"
      />
    </div>
  )
}
