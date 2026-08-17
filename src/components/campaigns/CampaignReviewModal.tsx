'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { updateCampaign } from '@/lib/campaigns-client'
import {
  campaignStatusLabel,
  goLiveToDatetimeLocal,
  type CompassCampaign
} from '@/lib/campaigns'
import type { LeadContact } from '@/lib/types'
import type { OutboundStep } from '@/lib/outbound-copy'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'
import RecordsTable from '@/components/ui/records-table'
import { useLeadGridColumns } from '@/components/LeadColumnPicker'
import { useUndo } from '@/components/UndoProvider'

const easeOut = [0.22, 1, 0.36, 1] as const
const LEAD_PAGE_SIZE = 80

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

async function fetchLeadPage(campaignId: string, page: number, pageSize: number) {
  const res = await fetch(
    `/api/leads/list?pipeline_campaign_id=${encodeURIComponent(campaignId)}&page=${page}&pageSize=${pageSize}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  )
  const body = (await res.json().catch(() => ({}))) as {
    leads?: LeadContact[]
    total?: number
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error || 'Could not load leads')
  }
  return {
    leads: body.leads ?? [],
    total: typeof body.total === 'number' ? body.total : (body.leads ?? []).length
  }
}

export function CampaignReviewModal({
  campaignId,
  campaign: initialCampaign,
  onClose,
  onUpdated
}: {
  campaignId: string
  campaign?: CompassCampaign | null
  onClose: () => void
  onUpdated: () => void
  onDeleted?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [campaign, setCampaign] = useState<CompassCampaign | null>(initialCampaign ?? null)
  const [nameDraft, setNameDraft] = useState(initialCampaign?.name ?? '')
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [leads, setLeads] = useState<LeadContact[]>([])
  const [total, setTotal] = useState(0)
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [goLiveLocal, setGoLiveLocal] = useState(() =>
    initialCampaign ? goLiveToDatetimeLocal(initialCampaign.go_live_at) : ''
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const openerTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const openerCommitted = useRef<Map<string, string>>(new Map())
  const undo = useUndo()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!initialCampaign) return
    setCampaign((current) => {
      if (!current || current.id !== initialCampaign.id) return initialCampaign
      return {
        ...current,
        go_live_at: initialCampaign.go_live_at,
        start_date: initialCampaign.start_date,
        end_date: initialCampaign.end_date,
        status: initialCampaign.status,
        name: current.name || initialCampaign.name
      }
    })
    if (!editingName) setNameDraft(initialCampaign.name)
    setGoLiveLocal(goLiveToDatetimeLocal(initialCampaign.go_live_at))
  }, [campaignId, initialCampaign?.id, initialCampaign?.go_live_at, initialCampaign?.name, editingName])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (editorOpen || editingName) return
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, editorOpen, editingName])

  const loadLeads = useCallback(async () => {
    setLoadError(null)
    setLoadingLeads(true)
    try {
      const first = await fetchLeadPage(campaignId, 1, LEAD_PAGE_SIZE)
      setLeads(first.leads)
      setTotal(first.total)
      setSelectedLeadId((prev) =>
        prev && first.leads.some((row) => row.id === prev) ? prev : first.leads[0]?.id ?? null
      )
      setLoadingLeads(false)

      const pages = Math.ceil(first.total / LEAD_PAGE_SIZE)
      for (let page = 2; page <= pages; page += 1) {
        const next = await fetchLeadPage(campaignId, page, LEAD_PAGE_SIZE)
        setLeads((current) => {
          const seen = new Set(current.map((row) => row.id))
          return [...current, ...next.leads.filter((row) => !seen.has(row.id))]
        })
        setTotal(next.total)
      }
    } catch {
      setLoadError('Could not load campaign leads')
      setLoadingLeads(false)
    }
  }, [campaignId])

  useEffect(() => {
    void loadLeads()
  }, [loadLeads])

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return leads
    return leads.filter((lead) => {
      const hay = [lead.name, lead.email, lead.company, lead.opener].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [leads, query])

  const grid = useLeadGridColumns('campaign', leads)
  const selectedLead =
    filteredLeads.find((row) => row.id === selectedLeadId) ??
    leads.find((row) => row.id === selectedLeadId) ??
    null
  const steps = campaign?.sequence_draft?.steps ?? []
  const firstStep = steps[0] ?? null

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

  function beginEditName() {
    setNameDraft(campaign?.name || '')
    setEditingName(true)
  }

  function saveName() {
    const next = nameDraft.trim()
    setEditingName(false)
    if (!next || next === campaign?.name) {
      setNameDraft(campaign?.name || '')
      return
    }
    setCampaign((current) => (current ? { ...current, name: next } : current))
    void updateCampaign(campaignId, { name: next })
      .then((row) => {
        setCampaign(row)
        setNameDraft(row.name)
        onUpdated()
      })
      .catch(() => {
        setNameDraft(campaign?.name || '')
      })
  }

  useEffect(() => {
    if (!editingName) return
    const node = nameInputRef.current
    if (!node) return
    node.focus()
    node.select()
  }, [editingName])

  function persistOpener(leadId: string, opener: string) {
    const previous =
      openerCommitted.current.get(leadId) ??
      leads.find((row) => row.id === leadId)?.opener ??
      ''
    setLeads((rows) => rows.map((row) => (row.id === leadId ? { ...row, opener } : row)))
    const timers = openerTimers.current
    const existing = timers.get(leadId)
    if (existing) clearTimeout(existing)
    timers.set(
      leadId,
      setTimeout(() => {
        void fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ opener })
        })
          .then(async (res) => {
            if (!res.ok) return
            openerCommitted.current.set(leadId, opener)
            undo.push({
              label: 'Opener',
              undo: async () => {
                openerCommitted.current.set(leadId, previous)
                setLeads((rows) =>
                  rows.map((row) => (row.id === leadId ? { ...row, opener: previous } : row))
                )
                await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({ opener: previous })
                })
              },
              redo: async () => {
                openerCommitted.current.set(leadId, opener)
                setLeads((rows) =>
                  rows.map((row) => (row.id === leadId ? { ...row, opener } : row))
                )
                await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({ opener })
                })
              }
            })
          })
          .catch(() => undefined)
      }, 400)
    )
  }

  useEffect(() => {
    const timers = openerTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={campaignId}
        className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
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
          className="relative z-10 flex h-[min(100dvh,960px)] w-full max-w-[min(1600px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-t-2xl border border-stone-200/80 bg-[var(--compass-wash)] shadow-soft sm:h-[min(94vh,960px)] sm:rounded-2xl"
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.985 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200/80 bg-white px-5 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Campaign review
              </p>
              {editingName ? (
                <input
                  ref={nameInputRef}
                  id="campaign-review-title"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveName()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setNameDraft(campaign?.name || '')
                      setEditingName(false)
                    }
                  }}
                  aria-label="Campaign name"
                  className="mt-0.5 w-full min-w-0 bg-transparent text-[17px] font-semibold tracking-tight text-neutral-900 outline-none"
                />
              ) : (
                <h2
                  id="campaign-review-title"
                  className="mt-0.5 truncate text-[17px] font-semibold tracking-tight text-neutral-900"
                >
                  <button
                    type="button"
                    onClick={beginEditName}
                    className="-ml-1 max-w-full rounded-lg px-1 text-left hover:bg-stone-50"
                    title="Click to rename"
                  >
                    {campaign?.name || 'Campaign'}
                  </button>
                </h2>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-500">
                <span>{campaign ? campaignStatusLabel(campaign.status) : '…'}</span>
                <span className="text-neutral-300">·</span>
                <span>
                  {total} lead{total === 1 ? '' : 's'}
                  {loadingLeads && leads.length > 0 && leads.length < total ? ` · showing ${leads.length}` : ''}
                </span>
                {campaign?.instantly_campaign_id ? (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span>Instantly bound</span>
                  </>
                ) : null}
                <span className="text-neutral-300">·</span>
                <span>
                  {steps.length > 0
                    ? `${steps.length} email${steps.length === 1 ? '' : 's'}`
                    : 'No sequence draft yet'}
                </span>
              </div>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-2">
              <label className="flex h-9 items-center gap-2 text-[12px] text-neutral-500">
                Go live
                <input
                  type="datetime-local"
                  value={goLiveLocal}
                  onChange={(e) => setGoLiveLocal(e.target.value)}
                  onBlur={saveGoLive}
                  className="h-9 rounded-xl border border-stone-200 bg-white px-2.5 text-[12px] text-neutral-800"
                />
              </label>
              <Link
                href={`/sales/pipeline/${campaignId}`}
                className="inline-flex h-9 items-center rounded-xl border border-stone-200 bg-white px-3 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Campaign page
              </Link>
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                className="inline-flex h-9 items-center rounded-xl bg-[#e85d2a] px-3 text-[12px] font-semibold text-white hover:bg-[#d24f1f]"
              >
                Open editor
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </header>

          {loadError ? (
            <p className="px-5 py-8 text-sm text-red-700">{loadError}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search leads"
                  className="h-9 w-full max-w-md rounded-xl border border-stone-200 bg-white px-3 text-[13px]"
                />
                {firstStep ? (
                  <p className="ml-auto truncate text-[12px] text-neutral-500">
                    {applyOpenerPreview(
                      firstStep.subject || firstStep.label || stepBody(firstStep),
                      selectedLead?.opener
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <RecordsTable
                  leads={filteredLeads}
                  columns={grid.visible}
                  widths={grid.widths}
                  onResizeColumn={grid.resizeColumn}
                  occupied={grid.occupied}
                  preset="campaign"
                  selected={selectedIds}
                  onToggleRow={(id) => {
                    setSelectedIds((current) => {
                      const next = new Set(current)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }}
                  onToggleAll={() => {
                    setSelectedIds((current) =>
                      current.size === filteredLeads.length
                        ? new Set()
                        : new Set(filteredLeads.map((lead) => lead.id))
                    )
                  }}
                  onColumnsChange={grid.setVisible}
                  onOpenerChange={persistOpener}
                  onRowActivate={(id) => setSelectedLeadId(id)}
                  activeId={selectedLeadId}
                  fill
                  emptyMessage={loadingLeads ? 'Loading leads…' : 'No leads in this campaign yet'}
                />
              </div>
            </div>
          )}
        </motion.div>
        {editorOpen ? (
          <SequenceEditor
            campaignId={campaignId}
            variant="overlay"
            leadsPane="hidden"
            onClose={() => {
              setEditorOpen(false)
              void loadLeads()
              onUpdated()
            }}
          />
        ) : null}
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
