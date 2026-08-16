'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { getCampaignDetail, updateCampaign } from '@/lib/campaigns-client'
import {
  campaignStatusLabel,
  goLiveToDatetimeLocal,
  type CompassCampaign
} from '@/lib/campaigns'
import { LEAD_FACT_KINDS, parseLeadFacts, type LeadFact } from '@/lib/lead-facts'
import type { LeadContact } from '@/lib/types'
import type { OutboundStep } from '@/lib/outbound-copy'

const easeOut = [0.22, 1, 0.36, 1] as const

function applyOpenerPreview(text: string, opener: string | null | undefined): string {
  const value = opener?.trim() || ''
  return text.replaceAll('{{opener}}', value).replaceAll('{opener}', value)
}

function stepBody(step: OutboundStep): string {
  return step.slots
    .filter((slot) => slot.key !== 'accountSignature' && slot.key !== 'spam_act_opt_out')
    .map((slot) => slot.body.trim())
    .filter(Boolean)
    .join('\n\n')
}

function factCount(value: unknown): number {
  const parsed = parseLeadFacts(value)
  return parsed.ok ? parsed.facts.length : 0
}

function asFacts(value: unknown): LeadFact[] {
  const parsed = parseLeadFacts(value)
  return parsed.ok ? parsed.facts : []
}

export function CampaignReviewModal({
  campaignId,
  onClose,
  onUpdated
}: {
  campaignId: string
  onClose: () => void
  onUpdated: () => void
  onDeleted?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [leads, setLeads] = useState<LeadContact[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [goLiveLocal, setGoLiveLocal] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [detail, leadsRes] = await Promise.all([
        getCampaignDetail(campaignId),
        fetch(
          `/api/leads/list?pipeline_campaign_id=${encodeURIComponent(campaignId)}&limit=500`,
          { headers: { Accept: 'application/json' }, cache: 'no-store' }
        )
      ])
      if (!detail) {
        setLoadError('Campaign not found')
        return
      }
      setCampaign(detail.campaign)
      setGoLiveLocal(goLiveToDatetimeLocal(detail.campaign.go_live_at))
      const body = (await leadsRes.json().catch(() => ({}))) as {
        leads?: LeadContact[]
        total?: number
        error?: string
      }
      if (!leadsRes.ok) {
        setLeads([])
        setTotal(0)
        return
      }
      const rows = body.leads ?? []
      setLeads(rows)
      setTotal(typeof body.total === 'number' ? body.total : rows.length)
      setSelectedLeadId((prev) => prev && rows.some((row) => row.id === prev) ? prev : rows[0]?.id ?? null)
    } catch {
      setLoadError('Could not load campaign')
    }
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return leads
    return leads.filter((lead) => {
      const hay = [lead.name, lead.email, lead.company].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [leads, query])

  const selectedLead = filteredLeads.find((row) => row.id === selectedLeadId) ?? leads.find((row) => row.id === selectedLeadId) ?? null
  const steps = campaign?.sequence_draft?.steps ?? []
  const step = steps[stepIndex] ?? null

  function saveGoLive() {
    if (!goLiveLocal) return
    const iso = new Date(goLiveLocal).toISOString()
    if (Number.isNaN(new Date(iso).getTime())) return
    void updateCampaign(campaignId, { go_live_at: iso })
      .then((row) => {
        setCampaign(row)
        onUpdated()
      })
      .catch(() => undefined)
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={campaignId}
        className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-neutral-950/40"
          aria-label="Close campaign review"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-review-title"
          className="relative z-10 flex h-[min(100dvh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-stone-200/80 bg-[var(--compass-wash)] shadow-soft sm:h-[min(92vh,920px)] sm:rounded-2xl"
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.985 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-200/80 bg-white px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Campaign review
              </p>
              <h2
                id="campaign-review-title"
                className="mt-0.5 truncate text-[17px] font-semibold tracking-tight text-neutral-900"
              >
                {campaign?.name || 'Campaign'}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-500">
                <span>{campaign ? campaignStatusLabel(campaign.status) : '…'}</span>
                <span className="text-neutral-300">·</span>
                <span>{total} lead{total === 1 ? '' : 's'}</span>
                {campaign?.instantly_campaign_id ? (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span>Instantly bound</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="flex flex-col text-[11px] text-neutral-500">
                Go live
                <input
                  type="datetime-local"
                  value={goLiveLocal}
                  onChange={(e) => setGoLiveLocal(e.target.value)}
                  onBlur={saveGoLive}
                  className="mt-0.5 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-[12px] text-neutral-800"
                />
              </label>
              <Link
                href={`/sales/pipeline/${campaignId}`}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Campaign page
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </header>

          {loadError ? (
            <p className="px-5 py-8 text-sm text-red-700">{loadError}</p>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,280px)]">
              <aside className="min-h-0 overflow-y-auto border-b border-stone-200/80 bg-white p-3 lg:border-b-0 lg:border-r">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search leads"
                  className="mb-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-[13px]"
                />
                {filteredLeads.length === 0 ? (
                  <p className="px-1 py-8 text-center text-[13px] text-neutral-400">
                    No leads in this campaign yet
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredLeads.map((lead) => {
                      const ready = Boolean(lead.opener?.trim())
                      const facts = factCount(lead.lead_facts)
                      const active = lead.id === selectedLeadId
                      return (
                        <li key={lead.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(lead.id)}
                            className={`w-full rounded-xl px-2.5 py-2 text-left ${
                              active ? 'bg-white shadow-soft ring-1 ring-[#5e6ad2]/30' : 'hover:bg-neutral-50'
                            }`}
                          >
                            <div className="truncate text-[13px] font-medium text-neutral-900">
                              {lead.name || lead.email || 'Untitled'}
                            </div>
                            <div className="truncate text-[11px] text-neutral-500">{lead.email}</div>
                            <div className="mt-0.5 flex gap-2 text-[10px] text-neutral-400">
                              <span>{ready ? 'Opener' : 'No opener'}</span>
                              <span>{facts} fact{facts === 1 ? '' : 's'}</span>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </aside>

              <section className="min-h-0 overflow-y-auto p-4">
                {selectedLead ? (
                  <LeadEditor
                    lead={selectedLead}
                    onPatched={(next) => {
                      setLeads((rows) => rows.map((row) => (row.id === next.id ? next : row)))
                    }}
                  />
                ) : (
                  <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-neutral-500 shadow-soft">
                    Select a lead to edit opener and research facts. Changes save as you type.
                  </div>
                )}
              </section>

              <section className="min-h-0 overflow-y-auto border-t border-stone-200/80 bg-white p-4 lg:border-l lg:border-t-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    Sequence
                  </p>
                  {steps.length > 1 ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={stepIndex <= 0}
                        onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                        className="rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="text-[11px] tabular-nums text-neutral-500">
                        {stepIndex + 1}/{steps.length}
                      </span>
                      <button
                        type="button"
                        disabled={stepIndex >= steps.length - 1}
                        onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                        className="rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
                {step ? (
                  <div className="rounded-2xl border border-stone-200 bg-[var(--compass-wash)] p-3 shadow-soft">
                    <p className="text-[11px] font-medium text-neutral-500">{step.label}</p>
                    <p className="mt-1 text-[13px] font-semibold text-neutral-900">
                      {step.subject || 'No subject'}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-neutral-700">
                      {applyOpenerPreview(stepBody(step), selectedLead?.opener)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-[13px] text-neutral-400">No sequence draft yet.</p>
                )}
                <Link
                  href={`/sales/outbound/editor/${campaignId}`}
                  className="mt-3 inline-flex rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Open editor
                </Link>
              </section>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

function LeadEditor({
  lead,
  onPatched
}: {
  lead: LeadContact
  onPatched: (lead: LeadContact) => void
}) {
  const [opener, setOpener] = useState(lead.opener ?? '')
  const [facts, setFacts] = useState<LeadFact[]>(() => asFacts(lead.lead_facts))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leadId = lead.id

  useEffect(() => {
    setOpener(lead.opener ?? '')
    setFacts(asFacts(lead.lead_facts))
    setSaveState('idle')
    setError(null)
  }, [lead.id, lead.opener, lead.lead_facts])

  const persist = useCallback(
    (nextOpener: string, nextFacts: LeadFact[]) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setSaveState('saving')
        void fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ opener: nextOpener, lead_facts: nextFacts })
        })
          .then(async (res) => {
            const body = (await res.json().catch(() => ({}))) as {
              lead?: LeadContact
              error?: string
            }
            if (!res.ok) {
              setSaveState('error')
              setError(body.error || 'Save failed')
              return
            }
            if (body.lead) onPatched(body.lead)
            setSaveState('saved')
            setError(null)
          })
          .catch(() => {
            setSaveState('error')
            setError('Save failed')
          })
      }, 450)
    },
    [leadId, onPatched]
  )

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function updateOpener(value: string) {
    setOpener(value)
    persist(value, facts)
  }

  function updateFacts(next: LeadFact[]) {
    setFacts(next)
    persist(opener, next)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-neutral-900">
              {lead.name || 'Untitled lead'}
            </p>
            <p className="truncate text-[12px] text-neutral-500">{lead.email}</p>
            <p className="mt-1 truncate text-[12px] text-neutral-500">
              {[lead.company, lead.role, lead.city].filter(Boolean).join(' · ') || 'No company'}
            </p>
          </div>
          <p className="shrink-0 text-[11px] text-neutral-400">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? error
                  : 'Autosave'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <label className="text-[12px] font-medium text-neutral-600">Opener</label>
        <textarea
          value={opener}
          onChange={(e) => updateOpener(e.target.value)}
          rows={5}
          placeholder="Personalised first line for Instantly {{opener}}"
          className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-[13px] leading-relaxed text-neutral-800"
        />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[12px] font-medium text-neutral-600">Research facts</p>
          <button
            type="button"
            disabled={facts.length >= 8}
            onClick={() =>
              updateFacts([...facts, { kind: 'about', claim: 'New fact', url: null }])
            }
            className="rounded-xl border border-stone-200 px-2 py-1 text-[11px] font-medium text-neutral-700 disabled:opacity-40"
          >
            Add fact
          </button>
        </div>
        {facts.length === 0 ? (
          <p className="text-[13px] text-neutral-400">No research facts on this lead.</p>
        ) : (
          <ul className="space-y-3">
            {facts.map((fact, index) => (
              <li key={`${fact.kind}-${index}`} className="rounded-xl border border-stone-100 p-3">
                <div className="flex gap-2">
                  <select
                    value={fact.kind}
                    onChange={(e) => {
                      const next = facts.slice()
                      next[index] = { ...fact, kind: e.target.value as LeadFact['kind'] }
                      updateFacts(next)
                    }}
                    className="rounded-lg border border-stone-200 px-2 py-1 text-[12px]"
                  >
                    {LEAD_FACT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => updateFacts(facts.filter((_, i) => i !== index))}
                    className="ml-auto text-[11px] text-neutral-400 hover:text-neutral-700"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={fact.claim}
                  onChange={(e) => {
                    const next = facts.slice()
                    next[index] = { ...fact, claim: e.target.value }
                    updateFacts(next)
                  }}
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-[13px]"
                />
                <input
                  value={fact.url ?? ''}
                  onChange={(e) => {
                    const next = facts.slice()
                    next[index] = { ...fact, url: e.target.value.trim() || null }
                    updateFacts(next)
                  }}
                  placeholder="https://…"
                  className="mt-2 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-[12px]"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
