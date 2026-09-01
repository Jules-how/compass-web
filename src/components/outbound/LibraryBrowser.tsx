'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LibraryPageShell } from '@/components/outbound/OutboundHub'
import { Card, CardContent } from '@/components/ui/card'
import { listCampaigns } from '@/lib/campaigns-client'
import type { CompassCampaign } from '@/lib/campaigns'
import {
  ensureLibraryMutationUnlocked,
  isLibraryMutationUnlocked,
  lockLibraryMutations
} from '@/lib/outbound-library-lock'
import {
  scaffoldSequence,
  structureSlots,
  provenanceBadgeLabel,
  normalizeProvenance,
  type OutboundCta,
  type OutboundExpression,
  type OutboundOffer,
  type OutboundOpener,
  type OutboundProvenance,
  type OutboundStructure,
  type OutboundSubject,
  type OutboundTemplate
} from '@/lib/outbound-copy'
import {
  archiveLibraryItem,
  createLibraryItem,
  ensureOutboundLibrarySeeded,
  getLibraryItem,
  listLibraryItems,
  patchLibraryItem,
  type LibraryKind
} from '@/lib/outbound-library-client'

type Kind = LibraryKind

const META: Record<Kind, { title: string; subtitle: string }> = {
  offers: { title: 'Offers', subtitle: 'Pack offer keys with short commercial summaries' },
  expressions: { title: 'Expressions', subtitle: 'Cold X-in-Y-or-Z lines by offer' },
  structures: { title: 'Structures', subtitle: 'Slot-order skeletons (not full sequences)' },
  ctas: { title: 'CTAs', subtitle: 'One ask per email — permission default' },
  subjects: { title: 'Subjects', subtitle: 'Subject patterns without “quick” stems' },
  openers: { title: 'Openers', subtitle: 'Opener modes — not a huge stem library' },
  templates: { title: 'Templates', subtitle: 'Forkable multi-step sequence scaffolds' }
}

function promptRequired(label: string, initial = ''): string | null {
  const value = window.prompt(label, initial)?.trim()
  return value || null
}

type RowView = {
  id: string
  title: string
  meta: string
  body: string
  tags: string[]
  refKey: string | null
  provenance: OutboundProvenance
  provenanceLabel: string
  sourceFile: string | null
}

export function LibraryBrowser({ kind }: { kind: Kind }) {
  const [q, setQ] = useState('')
  const [provenanceFilter, setProvenanceFilter] = useState<'all' | OutboundProvenance>('all')
  const [rows, setRows] = useState<RowView[]>([])
  const [campaigns, setCampaigns] = useState<CompassCampaign[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(() => isLibraryMutationUnlocked())
  const meta = META[kind]

  const reload = useCallback(async () => {
    try {
      try {
        await ensureOutboundLibrarySeeded()
      } catch (seedErr) {
        console.warn('Seed check failed', seedErr)
      }
      const [itemsRes, camsRes] = await Promise.allSettled([
        listLibraryItems<Record<string, unknown>>(kind, { q: q || undefined }),
        listCampaigns()
      ])
      if (itemsRes.status === 'rejected') {
        throw itemsRes.reason
      }
      const items = itemsRes.value
      const cams = camsRes.status === 'fulfilled' ? camsRes.value : []
      setCampaigns(cams)
      setLoadError(null)
      setRows(
        items.map((raw) => {
          const r = raw as Record<string, unknown>
          const provenance = normalizeProvenance(r.provenance)
          const provenanceLabel = provenanceBadgeLabel({
            provenance,
            source_creator: typeof r.source_creator === 'string' ? r.source_creator : null,
            source_file: typeof r.source_file === 'string' ? r.source_file : null
          })
          const sourceFile = typeof r.source_file === 'string' ? r.source_file : null
          if (kind === 'offers') {
            const row = r as unknown as OutboundOffer
            return {
              id: row.id,
              title: row.name,
              meta: row.offer_key,
              body: row.pack_summary,
              tags: [...(row.vertical_tags ?? []), ...(row.location_tags ?? [])],
              refKey: row.offer_key,
              provenance,
              provenanceLabel,
              sourceFile
            }
          }
          if (kind === 'expressions') {
            const row = r as unknown as OutboundExpression
            return {
              id: row.id,
              title: row.label,
              meta: `${row.offer_key ?? 'pattern'} · ${row.status}`,
              body: row.body,
              tags: [...(row.vertical_tags ?? []), ...(row.location_tags ?? [])],
              refKey: row.offer_key,
              provenance,
              provenanceLabel,
              sourceFile
            }
          }
          if (kind === 'structures') {
            const row = r as unknown as OutboundStructure
            return {
              id: row.id,
              title: row.name,
              meta: row.structure_id,
              body: row.description ?? '',
              tags: [],
              refKey: row.structure_id,
              provenance,
              provenanceLabel,
              sourceFile
            }
          }
          if (kind === 'ctas') {
            const row = r as unknown as OutboundCta
            return {
              id: row.id,
              title: row.label,
              meta: row.cta_type,
              body: row.body,
              tags: row.vertical_tags ?? [],
              refKey: null,
              provenance,
              provenanceLabel,
              sourceFile
            }
          }
          if (kind === 'subjects') {
            const row = r as unknown as OutboundSubject
            return {
              id: row.id,
              title: row.label,
              meta: row.pattern,
              body: row.notes ?? '',
              tags: row.vertical_tags ?? [],
              refKey: null,
              provenance,
              provenanceLabel,
              sourceFile
            }
          }
          if (kind === 'openers') {
            const row = r as unknown as OutboundOpener
            return {
              id: row.id,
              title: row.label,
              meta: row.opener_mode,
              body: row.body || row.notes || '',
              tags: row.vertical_tags ?? [],
              refKey: null,
              provenance,
              provenanceLabel,
              sourceFile
            }
          }
          const row = r as unknown as OutboundTemplate
          return {
            id: row.id,
            title: row.name,
            meta: `${row.structure_id}${row.offer_key ? ` · ${row.offer_key}` : ''}`,
            body: `${row.sequence?.steps?.length ?? 0} steps`,
            tags: [...(row.vertical_tags ?? []), ...(row.location_tags ?? [])],
            refKey: row.offer_key,
            provenance,
            provenanceLabel,
            sourceFile
          }
        })
      )
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load library')
    }
  }, [kind, q])

  useEffect(() => {
    void reload()
  }, [reload])

  const campaignsFor = useMemo(() => {
    return (refKey: string | null) => {
      if (!refKey) return []
      if (kind === 'structures') {
        return campaigns.filter((c) => c.structure_id === refKey)
      }
      return campaigns.filter((c) => c.offer_key === refKey)
    }
  }, [campaigns, kind])

  async function createItem() {
    try {
      if (kind === 'offers') {
        const offer_key = promptRequired('offer_key')
        const name = promptRequired('Name')
        const pack_summary = promptRequired('Pack summary')
        if (!offer_key || !name || !pack_summary) return
        await createLibraryItem('offers', { offer_key, name, pack_summary })
      } else if (kind === 'expressions') {
        const offer_key = promptRequired('offer_key')
        const label = promptRequired('Label')
        const body = promptRequired('Body')
        if (!offer_key || !label || !body) return
        await createLibraryItem('expressions', { offer_key, label, body, status: 'draft' })
      } else if (kind === 'structures') {
        const structure_id = promptRequired('structure_id (e.g. nick-3step or custom-key)')
        const name = promptRequired('Name')
        if (!structure_id || !name) return
        const description = window.prompt('Description (optional)')?.trim() || null
        await createLibraryItem('structures', {
          structure_id,
          name,
          description,
          slots: structureSlots(structure_id)
        })
      } else if (kind === 'ctas') {
        const label = promptRequired('Label')
        const body = promptRequired('Body')
        if (!label || !body) return
        await createLibraryItem('ctas', { label, body, cta_type: 'permission' })
      } else if (kind === 'subjects') {
        const label = promptRequired('Label')
        const pattern = promptRequired('Pattern')
        if (!label || !pattern) return
        await createLibraryItem('subjects', { label, pattern })
      } else if (kind === 'openers') {
        const label = promptRequired('Label')
        const opener_mode = window.prompt('opener_mode', 'custom')?.trim() || 'custom'
        const body = window.prompt('Body') ?? ''
        if (!label) return
        await createLibraryItem('openers', { label, opener_mode, body })
      } else if (kind === 'templates') {
        const name = promptRequired('Name')
        if (!name) return
        const structure_id =
          window.prompt('structure_id', 'nick-3step')?.trim() || 'nick-3step'
        const offerRaw = window.prompt('offer_key (optional)')?.trim() || ''
        const offer_key = offerRaw || null
        await createLibraryItem('templates', {
          name,
          structure_id,
          offer_key,
          sequence: scaffoldSequence(structure_id, { offerKey: offer_key })
        })
      }
      await reload()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Create failed')
    }
  }

  async function editItem(id: string) {
    if (!(await ensureLibraryMutationUnlocked('edit'))) return
    setUnlocked(true)
    try {
      if (kind === 'offers') {
        const existing = await getLibraryItem<OutboundOffer>('offers', id)
        const offer_key = promptRequired('offer_key', existing.offer_key)
        const name = promptRequired('Name', existing.name)
        const pack_summary = promptRequired('Pack summary', existing.pack_summary)
        if (!offer_key || !name || !pack_summary) return
        await patchLibraryItem('offers', id, { offer_key, name, pack_summary })
      } else if (kind === 'expressions') {
        const existing = await getLibraryItem<OutboundExpression>('expressions', id)
        const offer_key = promptRequired('offer_key', existing.offer_key ?? '')
        const label = promptRequired('Label', existing.label)
        const body = promptRequired('Body', existing.body)
        if (!offer_key || !label || !body) return
        await patchLibraryItem('expressions', id, { offer_key, label, body })
      } else if (kind === 'structures') {
        const existing = await getLibraryItem<OutboundStructure>('structures', id)
        const structure_id = promptRequired('structure_id', existing.structure_id)
        const name = promptRequired('Name', existing.name)
        if (!structure_id || !name) return
        const description =
          window.prompt('Description (optional)', existing.description ?? '')?.trim() || null
        const slots =
          structure_id === existing.structure_id && existing.slots.length
            ? existing.slots
            : structureSlots(structure_id)
        await patchLibraryItem('structures', id, { structure_id, name, description, slots })
      } else if (kind === 'ctas') {
        const existing = await getLibraryItem<OutboundCta>('ctas', id)
        const label = promptRequired('Label', existing.label)
        const body = promptRequired('Body', existing.body)
        if (!label || !body) return
        const cta_type = window.prompt('cta_type', existing.cta_type)?.trim() || existing.cta_type
        await patchLibraryItem('ctas', id, { label, body, cta_type })
      } else if (kind === 'subjects') {
        const existing = await getLibraryItem<OutboundSubject>('subjects', id)
        const label = promptRequired('Label', existing.label)
        const pattern = promptRequired('Pattern', existing.pattern)
        if (!label || !pattern) return
        await patchLibraryItem('subjects', id, { label, pattern })
      } else if (kind === 'openers') {
        const existing = await getLibraryItem<OutboundOpener>('openers', id)
        const label = promptRequired('Label', existing.label)
        if (!label) return
        const opener_mode =
          window.prompt('opener_mode', existing.opener_mode)?.trim() || existing.opener_mode
        const body = window.prompt('Body', existing.body) ?? existing.body
        await patchLibraryItem('openers', id, { label, opener_mode, body })
      } else if (kind === 'templates') {
        const existing = await getLibraryItem<OutboundTemplate>('templates', id)
        const name = promptRequired('Name', existing.name)
        if (!name) return
        const structure_id =
          window.prompt('structure_id', existing.structure_id)?.trim() || existing.structure_id
        const offerRaw =
          window.prompt('offer_key (optional)', existing.offer_key ?? '')?.trim() || ''
        const offer_key = offerRaw || null
        const sequence =
          structure_id === existing.structure_id
            ? existing.sequence
            : scaffoldSequence(structure_id, { offerKey: offer_key })
        await patchLibraryItem('templates', id, { name, structure_id, offer_key, sequence })
      }
      await reload()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Edit failed')
    }
  }

  async function archiveItem(id: string) {
    if (!(await ensureLibraryMutationUnlocked('archive'))) return
    setUnlocked(true)
    try {
      await archiveLibraryItem(kind, id)
      await reload()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Archive failed')
    }
  }

  function relock() {
    lockLibraryMutations()
    setUnlocked(false)
  }

  return (
    <LibraryPageShell
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] shadow-soft"
          />
          <div className="flex rounded-xl border border-stone-200 bg-white p-0.5 shadow-soft">
            {([
              ['all', 'All'],
              ['source', 'Source'],
              ['yours', 'Yours']
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setProvenanceFilter(value)}
                className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium ${
                  provenanceFilter === value
                    ? 'bg-stone-900 text-white'
                    : 'text-neutral-600 hover:bg-stone-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {unlocked ? (
            <button
              type="button"
              onClick={relock}
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-medium text-neutral-600 shadow-soft hover:bg-stone-50"
              title="Require password again for edit/archive"
            >
              Lock
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void createItem()}
            className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
          >
            Add
          </button>
        </div>
      }
    >
      {loadError ? <p className="mb-3 text-sm text-red-600">{loadError}</p> : null}
      <div className="space-y-3">
        {rows
          .filter((row) => provenanceFilter === 'all' || row.provenance === provenanceFilter)
          .map((row) => {
          const related = campaignsFor(row.refKey)
          return (
            <Card key={row.id}>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[15px] font-semibold text-neutral-900">{row.title}</div>
                      <span
                        className={`rounded-xl px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          row.provenance === 'source'
                            ? 'border border-stone-300 bg-stone-100 text-neutral-700'
                            : 'border border-orange-200 bg-orange-50 text-[#c2410c]'
                        }`}
                        title={row.sourceFile ?? undefined}
                      >
                        {row.provenanceLabel}
                      </span>
                    </div>
                    <div className="text-[12px] text-neutral-500">{row.meta}</div>
                    {row.sourceFile ? (
                      <div className="mt-0.5 text-[11px] text-neutral-400">{row.sourceFile}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void editItem(row.id)}
                      className="text-[12px] text-neutral-500 hover:text-[#c2410c]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveItem(row.id)}
                      className="text-[12px] text-neutral-500 hover:text-red-600"
                    >
                      Archive
                    </button>
                  </div>
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
