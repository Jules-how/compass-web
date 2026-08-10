'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { LibraryPageShell } from '@/components/outbound/OutboundHub'
import { Card, CardContent } from '@/components/ui/card'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import type { CompassCampaign } from '@/lib/campaigns'
import {
  ensureLibraryMutationUnlocked,
  isLibraryMutationUnlocked,
  lockLibraryMutations
} from '@/lib/outbound-library-lock'
import { scaffoldSequence, structureSlots } from '@/lib/outbound-copy'
import {
  archiveLocalLibraryItem,
  getLocalCta,
  getLocalExpression,
  getLocalOffer,
  getLocalOpener,
  getLocalStructure,
  getLocalSubject,
  getLocalTemplate,
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
  saveLocalStructure,
  saveLocalSubject,
  saveLocalTemplate
} from '@/lib/outbound-local-store'
import { useCachedJson } from '@/lib/use-cached-json'

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

function promptRequired(label: string, initial = ''): string | null {
  const value = window.prompt(label, initial)?.trim()
  return value || null
}

export function LibraryBrowser({ kind }: { kind: Kind }) {
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const [unlocked, setUnlocked] = useState(() => isLibraryMutationUnlocked())
  const meta = META[kind]
  const campaignsQuery = useCachedJson<{ campaigns: CompassCampaign[] }>(
    CAMPAIGNS_QUERY_KEY,
    '/api/campaigns',
    { staleMs: 30_000 }
  )
  const campaigns = campaignsQuery.data?.campaigns ?? []

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

  function bump() {
    setTick((n) => n + 1)
  }

  /** Add is always free — no library lock. */
  function createItem() {
    if (kind === 'offers') {
      const offer_key = promptRequired('offer_key')
      const name = promptRequired('Name')
      const pack_summary = promptRequired('Pack summary')
      if (!offer_key || !name || !pack_summary) return
      saveLocalOffer({ offer_key, name, pack_summary })
    } else if (kind === 'expressions') {
      const offer_key = promptRequired('offer_key')
      const label = promptRequired('Label')
      const body = promptRequired('Body')
      if (!offer_key || !label || !body) return
      saveLocalExpression({ offer_key, label, body, status: 'draft' })
    } else if (kind === 'structures') {
      const structure_id = promptRequired('structure_id (e.g. nick-3step or custom-key)')
      const name = promptRequired('Name')
      if (!structure_id || !name) return
      const description = window.prompt('Description (optional)')?.trim() || null
      saveLocalStructure({
        structure_id,
        name,
        description,
        slots: structureSlots(structure_id)
      })
    } else if (kind === 'ctas') {
      const label = promptRequired('Label')
      const body = promptRequired('Body')
      if (!label || !body) return
      saveLocalCta({ label, body, cta_type: 'permission' })
    } else if (kind === 'subjects') {
      const label = promptRequired('Label')
      const pattern = promptRequired('Pattern')
      if (!label || !pattern) return
      saveLocalSubject({ label, pattern })
    } else if (kind === 'openers') {
      const label = promptRequired('Label')
      const opener_mode = window.prompt('opener_mode', 'custom')?.trim() || 'custom'
      const body = window.prompt('Body') ?? ''
      if (!label) return
      saveLocalOpener({ label, opener_mode, body })
    } else if (kind === 'templates') {
      const name = promptRequired('Name')
      if (!name) return
      const structure_id =
        window.prompt('structure_id', 'nick-3step')?.trim() || 'nick-3step'
      const offerRaw = window.prompt('offer_key (optional)')?.trim() || ''
      const offer_key = offerRaw || null
      saveLocalTemplate({
        name,
        structure_id,
        offer_key,
        sequence: scaffoldSequence(structure_id, { offerKey: offer_key })
      })
    }
    bump()
  }

  async function editItem(id: string) {
    if (!(await ensureLibraryMutationUnlocked('edit'))) return
    setUnlocked(true)

    if (kind === 'offers') {
      const existing = getLocalOffer(id)
      if (!existing) return
      const offer_key = promptRequired('offer_key', existing.offer_key)
      const name = promptRequired('Name', existing.name)
      const pack_summary = promptRequired('Pack summary', existing.pack_summary)
      if (!offer_key || !name || !pack_summary) return
      saveLocalOffer({ ...existing, offer_key, name, pack_summary })
    } else if (kind === 'expressions') {
      const existing = getLocalExpression(id)
      if (!existing) return
      const offer_key = promptRequired('offer_key', existing.offer_key)
      const label = promptRequired('Label', existing.label)
      const body = promptRequired('Body', existing.body)
      if (!offer_key || !label || !body) return
      saveLocalExpression({ ...existing, offer_key, label, body })
    } else if (kind === 'structures') {
      const existing = getLocalStructure(id)
      if (!existing) return
      const structure_id = promptRequired('structure_id', existing.structure_id)
      const name = promptRequired('Name', existing.name)
      if (!structure_id || !name) return
      const description =
        window.prompt('Description (optional)', existing.description ?? '')?.trim() || null
      const slots =
        structure_id === existing.structure_id && existing.slots.length
          ? existing.slots
          : structureSlots(structure_id)
      saveLocalStructure({ ...existing, structure_id, name, description, slots })
    } else if (kind === 'ctas') {
      const existing = getLocalCta(id)
      if (!existing) return
      const label = promptRequired('Label', existing.label)
      const body = promptRequired('Body', existing.body)
      if (!label || !body) return
      const cta_type = window.prompt('cta_type', existing.cta_type)?.trim() || existing.cta_type
      saveLocalCta({ ...existing, label, body, cta_type })
    } else if (kind === 'subjects') {
      const existing = getLocalSubject(id)
      if (!existing) return
      const label = promptRequired('Label', existing.label)
      const pattern = promptRequired('Pattern', existing.pattern)
      if (!label || !pattern) return
      saveLocalSubject({ ...existing, label, pattern })
    } else if (kind === 'openers') {
      const existing = getLocalOpener(id)
      if (!existing) return
      const label = promptRequired('Label', existing.label)
      if (!label) return
      const opener_mode =
        window.prompt('opener_mode', existing.opener_mode)?.trim() || existing.opener_mode
      const body = window.prompt('Body', existing.body) ?? existing.body
      saveLocalOpener({ ...existing, label, opener_mode, body })
    } else if (kind === 'templates') {
      const existing = getLocalTemplate(id)
      if (!existing) return
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
      saveLocalTemplate({ ...existing, name, structure_id, offer_key, sequence })
    }
    bump()
  }

  async function archiveItem(id: string) {
    if (!(await ensureLibraryMutationUnlocked('archive'))) return
    setUnlocked(true)
    archiveLocalLibraryItem(kind, id, true)
    bump()
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
