'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignCopyMatrix } from '@/components/outbound/CampaignCopyMatrix'
import {
  LIBRARY_NAV,
  LOCATION_TAG_HINTS,
  VERTICAL_TAG_HINTS,
  copyStatusLabel,
  previewExpression
} from '@/lib/outbound-copy'
import { listLocalCampaigns } from '@/lib/campaign-local-store'
import { cn } from '@/lib/utils'

export function OutboundHub() {
  const [vertical, setVertical] = useState('')
  const [location, setLocation] = useState('')
  const campaigns = listLocalCampaigns()

  const recent = useMemo(() => {
    return campaigns
      .filter((c) => c.copy_status && c.copy_status !== 'none')
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6)
  }, [campaigns])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="compass-page-title font-display text-2xl text-neutral-900">Outbound</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Libraries for offers, expressions, structures, CTAs, subjects, openers, and templates.
            Compose campaign sequences by copying library text into a forked draft.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/sales/outbound/editor/new"
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 shadow-soft"
          >
            New unbound draft
          </Link>
          <Link
            href="/sales/pipeline"
            className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
          >
            Open planner
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[...VERTICAL_TAG_HINTS, ...LOCATION_TAG_HINTS].map((tag) => {
          const isVertical = (VERTICAL_TAG_HINTS as readonly string[]).includes(tag)
          const active = isVertical ? vertical === tag : location === tag
          return (
            <button
              key={tag}
              type="button"
              onClick={() => {
                if (isVertical) setVertical((v) => (v === tag ? '' : tag))
                else setLocation((v) => (v === tag ? '' : tag))
              }}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-[12px] font-medium',
                active
                  ? 'border-[#e85d2a]/40 bg-[#e85d2a]/10 text-[#c2410c]'
                  : 'border-stone-200 bg-white text-neutral-600'
              )}
            >
              {tag}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LIBRARY_NAV.map((item) => (
          <Link key={item.key} href={item.href} className="block">
            <Card className="h-full transition hover:shadow-lift">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.blurb}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent campaigns with copy</CardTitle>
          <CardDescription>Open the sequence editor from a campaign summary</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No campaigns have copy yet. Create a campaign in Pipeline, then attach a template.
            </p>
          ) : (
            recent.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/80 bg-stone-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900">{c.name}</div>
                  <div className="mt-0.5 text-[12px] text-neutral-500">
                    {[c.offer_key, c.structure_id, copyStatusLabel(c.copy_status || 'none')]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {c.cold_expression ? (
                    <p className="mt-1 text-[12px] text-neutral-600">
                      {previewExpression(c.cold_expression, 140)}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/sales/outbound/editor/${c.id}`}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft"
                >
                  Open editor
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

          <CampaignCopyMatrix vertical={vertical} location={location} />
    </div>
  )
}

export function LibraryPageShell({
  title,
  subtitle,
  actions,
  children
}: {
  title: string
  subtitle: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2">
            <Link href="/sales/outbound" className="text-[12px] font-medium text-[#c2410c] hover:underline">
              ← Outbound
            </Link>
          </div>
          <h1 className="compass-page-title font-display text-2xl text-neutral-900">{title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}
