'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { LibraryPageShell } from '@/components/outbound/OutboundHub'
import { Card, CardContent } from '@/components/ui/card'
import { listLocalCampaigns } from '@/lib/campaign-local-store'
import {
  archiveLocalLibraryItem,
  listLocalCtas,
  listLocalExpressions,
  listLocalOffers,
  listLocalOpeners,
  listLocalStructures,
  listLocalSubjects,
  listLocalTemplates,
  saveLocalCta,
  saveLocalExpression,
  saveLocalOffer,
  saveLocalOpener,
  saveLocalSubject
} from '@/lib/outbound-local-store'

type Kind = 'offers' | 'expressions' | 'structures' | 'ctas' | 'subjects' | 'openers' | 'templates'

const META: Record<Kind, { title: string; subtitle: string }> = {
  offers: { title: 'Offers', subtitle: 'Pack offer keys with short commercial summaries' },
  expressions: { title: 'Expressions', subtitle: 'Cold X-in-Y-or-Z lines by offer' },
  structures: { title: 'Structures', subtitle: 'Slot-order skeletons (not full sequences)' },
  ctas: { title: 'CTAs', subtitle: 'One ask per email — permission default' },
  subjects: { title: 'Subjects', subtitle: 'Subject patterns without “quick” stems' },
  openers: { title: 'Openers', subtitle: 'Opener modes — not a huge stem library' },
  templates: { title: 'Templates', subtitle: 'Forkable multi-step sequence scaffolds' }
}

export function LibraryBrowser({ kind }: { kind: Kind }) {
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const meta = META[kind]
  const campaigns = listLocalCampaigns()

  const rows = useMemo(() => {
    void tick
    const filters = { q: q || undefined }
    switch (kind) {
      case 'offers':
        return listLocalOffers(filters).map((r) => ({
          id: r.id,
          title: r.name,
          meta: r.offer_key,
          body: r.pack_summary,
          tags: [...r.vertical_tags, ...r.location_tags],
          refKey: r.offer_key
        }))
      case 'expressions':
        return listLocalExpressions(filters).map((r) => ({
          id: r.id,
          title: r.label,
          meta: `${r.offer_key} · ${r.status}`,
          body: r.body,
          tags: [...r.vertical_tags, ...r.location_tags],
          refKey: r.offer_key
        }))
      case 'structures':
        return listLocalStructures(filters).map((r) => ({
          id: r.id,
          title: r.name,
          meta: r.structure_id,
          body: r.description ?? '',
          tags: [],
          refKey: r.structure_id
        }))
      case 'ctas':
        return listLocalCtas(filters).map((r) => ({
          id: r.id,
          title: r.label,
          meta: r.cta_type,
          body: r.body,
          tags: r.vertical_tags,
          refKey: null
        }))
      case 'subjects':
        return listLocalSubjects(filters).map((r) => ({
          id: r.id,
          title: r.label,
          meta: r.pattern,
          body: r.notes ?? '',
          tags: r.vertical_tags,
          refKey: null
        }))
      case 'openers':
        return listLocalOpeners(filters).map((r) => ({
          id: r.id,
          title: r.label,
          meta: r.opener_mode,
          body: r.body || r.notes || '',
          tags: r.vertical_tags,
          refKey: null
        }))
      case 'templates':
        return listLocalTemplates(filters).map((r) => ({
          id: r.id,
          title: r.name,
          meta: `${r.structure_id}${r.offer_key ? ` · ${r.offer_key}` : ''}`,
          body: `${r.sequence.steps.length} steps`,
          tags: [...r.vertical_tags, ...r.location_tags],
          refKey: r.offer_key
        }))
    }
  }, [kind, q, tick])

  function campaignsFor(refKey: string | null) {
    if (!refKey) return []
    if (kind === 'structures') {
      return campaigns.filter((c) => c.structure_id === refKey)
    }
    return campaigns.filter((c) => c.offer_key === refKey)
  }

  function createItem() {
    if (kind === 'offers') {
      const offer_key = window.prompt('offer_key')?.trim()
      const name = window.prompt('Name')?.trim()
      const pack_summary = window.prompt('Pack summary')?.trim()
      if (!offer_key || !name || !pack_summary) return
      saveLocalOffer({ offer_key, name, pack_summary })
    } else if (kind === 'expressions') {
      const offer_key = window.prompt('offer_key')?.trim()
      const label = window.prompt('Label')?.trim()
      const body = window.prompt('Body')?.trim()
      if (!offer_key || !label || !body) return
      saveLocalExpression({ offer_key, label, body, status: 'draft' })
    } else if (kind === 'ctas') {
      const label = window.prompt('Label')?.trim()
      const body = window.prompt('Body')?.trim()
      if (!label || !body) return
      saveLocalCta({ label, body, cta_type: 'permission' })
    } else if (kind === 'subjects') {
      const label = window.prompt('Label')?.trim()
      const pattern = window.prompt('Pattern')?.trim()
      if (!label || !pattern) return
      saveLocalSubject({ label, pattern })
    } else if (kind === 'openers') {
      const label = window.prompt('Label')?.trim()
      const opener_mode = window.prompt('opener_mode', 'custom')?.trim() || 'custom'
      const body = window.prompt('Body') ?? ''
      if (!label) return
      saveLocalOpener({ label, opener_mode, body })
    } else {
      window.alert('Structures and templates are seeded; edit via sequence editor Save to library / fork.')
      return
    }
    setTick((n) => n + 1)
  }

  return (
    <LibraryPageShell
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] shadow-soft"
          />
          <button
            type="button"
            onClick={createItem}
            className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
          >
            Add
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {rows.map((row) => {
          const related = campaignsFor(row.refKey)
          return (
            <Card key={row.id}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold text-neutral-900">{row.title}</div>
                    <div className="text-[12px] text-neutral-500">{row.meta}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      archiveLocalLibraryItem(kind, row.id, true)
                      setTick((n) => n + 1)
                    }}
                    className="text-[12px] text-neutral-500 hover:text-red-600"
                  >
                    Archive
                  </button>
                </div>
                {row.body ? <p className="text-sm leading-relaxed text-neutral-700">{row.body}</p> : null}
                {row.tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-xl border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-neutral-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {related.length ? (
                  <div className="pt-1 text-[12px] text-neutral-500">
                    Campaigns using this:{' '}
                    {related.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 ? ', ' : ''}
                        <Link
                          href={`/sales/outbound/editor/${c.id}`}
                          className="font-medium text-[#c2410c] hover:underline"
                        >
                          {c.name}
                        </Link>
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </LibraryPageShell>
  )
}
