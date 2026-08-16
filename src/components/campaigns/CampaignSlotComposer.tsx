'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { formatSlotHeading } from '@/lib/campaign-calendar'
import { createCampaign as createCampaignRemote } from '@/lib/campaigns-client'
import {
  CAMPAIGN_COLORS,
  localDateOnlyFromIso,
  type CompassCampaign
} from '@/lib/campaigns'
import type { LeadContact } from '@/lib/types'

const easeOut = [0.22, 1, 0.36, 1] as const

type Props = {
  goLiveAt: string
  onClose: () => void
  onCreated: (campaign: CompassCampaign) => void
  onOpenReview: (campaignId: string) => void
}

export function CampaignSlotComposer({ goLiveAt, onClose, onCreated, onOpenReview }: Props) {
  const [mounted, setMounted] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [color, setColor] = useState<string>(CAMPAIGN_COLORS[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [leadQuery, setLeadQuery] = useState('')
  const [hits, setHits] = useState<LeadContact[]>([])
  const [searching, setSearching] = useState(false)
  const [attached, setAttached] = useState<LeadContact[]>([])
  const [attachingId, setAttachingId] = useState<string | null>(null)

  const heading = useMemo(() => formatSlotHeading(goLiveAt), [goLiveAt])
  const day = localDateOnlyFromIso(goLiveAt) ?? undefined

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!campaign) return
    const q = leadQuery.trim()
    if (q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    const handle = window.setTimeout(() => {
      setSearching(true)
      void fetch(`/api/leads/list?q=${encodeURIComponent(q)}&page=1&pageSize=8`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as { leads?: LeadContact[] }
          if (!res.ok) throw new Error('search_failed')
          const taken = new Set(attached.map((row) => row.id))
          setHits((body.leads ?? []).filter((row) => !taken.has(row.id)))
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 220)
    return () => window.clearTimeout(handle)
  }, [attached, campaign, leadQuery])

  async function create() {
    const title = name.trim() || 'New campaign'
    setBusy(true)
    setError(null)
    try {
      const created = await createCampaignRemote({
        name: title,
        go_live_at: goLiveAt,
        start_date: day,
        end_date: day,
        status: 'planned',
        color,
        summary: summary.trim() || undefined
      })
      setCampaign(created)
      setName(created.name)
      onCreated(created)
    } catch {
      setError('Could not create that campaign. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function attachLead(lead: LeadContact) {
    if (!campaign) return
    setAttachingId(lead.id)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ pipeline_campaign_id: campaign.id })
      })
      const body = (await res.json().catch(() => ({}))) as { lead?: LeadContact; error?: string }
      if (!res.ok || !body.lead) throw new Error(body.error || 'attach_failed')
      setAttached((rows) => [body.lead as LeadContact, ...rows.filter((row) => row.id !== lead.id)])
      setHits((rows) => rows.filter((row) => row.id !== lead.id))
    } catch {
      setError('Could not add that lead.')
    } finally {
      setAttachingId(null)
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={goLiveAt}
        className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-neutral-950/35"
          aria-label="Close new campaign"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-composer-title"
          className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-t-2xl border border-stone-200/80 bg-white shadow-soft sm:rounded-2xl"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <div className="border-b border-stone-100 px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              {campaign ? 'Campaign on the board' : 'New campaign'}
            </p>
            <h2 id="slot-composer-title" className="mt-1 text-[17px] font-semibold tracking-tight text-neutral-900">
              {heading}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
              {campaign
                ? 'Add people to this block, or open the full review when you want the table.'
                : 'Drop this go-live on the square you clicked. Name it, then add leads.'}
            </p>
          </div>

          <div className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-neutral-500">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !campaign && !busy) void create()
                }}
                placeholder="AU Brokers · Growth System"
                disabled={Boolean(campaign)}
                className="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-[14px] text-neutral-900 outline-none ring-[var(--compass-accent)] placeholder:text-neutral-400 focus:border-stone-300 focus:ring-2 disabled:bg-neutral-50"
              />
            </label>

            {campaign ? null : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-neutral-500">
                    Note <span className="font-normal text-neutral-400">(optional)</span>
                  </span>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={2}
                    placeholder="Who this is for, or what you want to send."
                    className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none ring-[var(--compass-accent)] placeholder:text-neutral-400 focus:border-stone-300 focus:ring-2"
                  />
                </label>
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium text-neutral-500">Colour</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CAMPAIGN_COLORS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`Colour ${value}`}
                        onClick={() => setColor(value)}
                        className={`h-7 w-7 rounded-full border-2 ${
                          color === value ? 'border-neutral-800' : 'border-transparent'
                        }`}
                        style={{ background: value }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {campaign ? (
              <div>
                <span className="mb-1.5 block text-[12px] font-medium text-neutral-500">Add leads</span>
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Search name, email, or company"
                  className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-[13px] outline-none ring-[var(--compass-accent)] placeholder:text-neutral-400 focus:border-stone-300 focus:ring-2"
                />
                <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-stone-100">
                  {searching ? (
                    <p className="px-3 py-3 text-[12px] text-neutral-400">Searching…</p>
                  ) : leadQuery.trim().length < 2 ? (
                    <p className="px-3 py-3 text-[12px] text-neutral-400">
                      Type at least two characters.
                    </p>
                  ) : hits.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-neutral-400">No matching leads.</p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {hits.map((lead) => (
                        <li key={lead.id}>
                          <button
                            type="button"
                            disabled={attachingId === lead.id}
                            onClick={() => void attachLead(lead)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-neutral-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-neutral-800">
                                {lead.name || lead.email || 'Untitled lead'}
                              </span>
                              <span className="block truncate text-[11px] text-neutral-400">
                                {[lead.company, lead.email].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <span className="shrink-0 text-[12px] font-medium text-[var(--compass-accent)]">
                              {attachingId === lead.id ? 'Adding…' : 'Add'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {attached.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {attached.map((lead) => (
                      <li
                        key={lead.id}
                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700"
                      >
                        {lead.name || lead.email}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-stone-100 bg-[#faf8f6] px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl px-3 text-[13px] font-medium text-neutral-600 hover:bg-white"
            >
              {campaign ? 'Done' : 'Cancel'}
            </button>
            {campaign ? (
              <button
                type="button"
                onClick={() => onOpenReview(campaign.id)}
                className="h-9 rounded-xl bg-[var(--compass-accent)] px-3 text-[13px] font-semibold text-white hover:opacity-95"
              >
                Open review
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="h-9 rounded-xl bg-[var(--compass-accent)] px-3 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {busy ? 'Creating…' : 'Create campaign'}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
