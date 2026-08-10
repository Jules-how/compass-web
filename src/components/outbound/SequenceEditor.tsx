'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Monitor, Plus, Rocket, Smartphone, X, Zap } from 'lucide-react'
import {
  createCampaign,
  getCampaignDetail,
  updateCampaign
} from '@/lib/campaigns-client'
import type { CompassCampaign } from '@/lib/campaigns'
import { emptyCampaignCopyFields } from '@/lib/campaigns'
import {
  applyStructureScaffold,
  copyTextIntoSlot,
  emptyFollowUpStep,
  forkSequence,
  scaffoldSequence,
  setStepSubject,
  subjectLooksBanned,
  type OutboundSequence,
  type OutboundStep
} from '@/lib/outbound-copy'
import {
  createLibraryItem,
  forkTemplateIntoSequence,
  getOfferByKey
} from '@/lib/outbound-library-client'
import {
  EditorComponentsAccordion,
  parseLibraryDrag,
  type LibraryDragPayload
} from '@/components/outbound/EditorComponentsAccordion'
import { CampaignCopyMeta } from '@/components/outbound/CampaignCopyMeta'
import { CopyArchivePanel } from '@/components/outbound/CopyArchivePanel'
import { SequenceAnalyticsPanel } from '@/components/outbound/SequenceAnalyticsPanel'
import { INSTANTLY_BASE_VARIABLES } from '@/lib/instantly-variables'
import { cn } from '@/lib/utils'

const UNBOUND_KEY = 'compass.outbound.unbound-draft.v1'

type EditorTab = 'analytics' | 'editor' | 'archive' | 'leads' | 'settings'

function readUnbound(): { campaign: CompassCampaign; sequence: OutboundSequence } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(UNBOUND_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { campaign: CompassCampaign; sequence: OutboundSequence }
  } catch {
    return null
  }
}

function writeUnbound(campaign: CompassCampaign, sequence: OutboundSequence) {
  window.localStorage.setItem(UNBOUND_KEY, JSON.stringify({ campaign, sequence }))
}

const BODY_SLOT_SKIP = new Set(['accountSignature', 'spam_act_opt_out', 'subject'])

function stepBodyText(step: OutboundStep): string {
  return step.slots
    .filter((s) => !BODY_SLOT_SKIP.has(s.key) && s.body.trim())
    .map((s) => s.body.trim())
    .join('\n\n')
}

function writeStepBody(sequence: OutboundSequence, stepId: string, body: string): OutboundSequence {
  const next = forkSequence(sequence)
  const step = next.steps.find((s) => s.id === stepId)
  if (!step) return next
  const contentSlots = step.slots.filter((s) => !BODY_SLOT_SKIP.has(s.key))
  if (contentSlots.length === 0) {
    step.slots.push({ key: 'custom', label: 'Body', body })
    return next
  }
  const parts = body.split(/\n\n+/).map((p) => p.trim())
  if (parts.length === contentSlots.length) {
    contentSlots.forEach((slot, i) => {
      slot.body = parts[i] ?? ''
    })
  } else {
    const primary =
      contentSlots.find((s) => s.key === 'cold_expression') ||
      contentSlots.find((s) => s.key === 'custom') ||
      contentSlots[0]
    for (const slot of contentSlots) slot.body = ''
    primary.body = body
  }
  return next
}

export function SequenceEditor({
  campaignId,
  unbound = false,
  variant = 'page',
  onClose
}: {
  campaignId?: string
  unbound?: boolean
  variant?: 'page' | 'overlay'
  onClose?: () => void
}) {
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [sequence, setSequence] = useState<OutboundSequence | null>(null)
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<EditorTab>('editor')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [focusField, setFocusField] = useState<'subject' | 'body'>('body')
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hydrate = useCallback(async () => {
    if (unbound) {
      const existing = readUnbound()
      if (existing) {
        setCampaign(existing.campaign)
        setSequence(existing.sequence)
        setActiveStepId(existing.sequence.steps[0]?.id ?? null)
        return
      }
      const seq = scaffoldSequence('nick-3step')
      const draft: CompassCampaign = {
        id: 'unbound-draft',
        name: 'Untitled Campaign',
        status: 'draft',
        priority: 0,
        health: 'no_updates',
        start_date: null,
        end_date: null,
        color: '#94a3b8',
        summary: null,
        labels: [],
        owner_label: null,
        ...emptyCampaignCopyFields(),
        copy_status: 'draft',
        structure_id: seq.structure_id,
        sequence_draft: seq,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      writeUnbound(draft, seq)
      setCampaign(draft)
      setSequence(seq)
      setActiveStepId(seq.steps[0]?.id ?? null)
      return
    }
    if (!campaignId) return
    try {
      setError(null)
      const detail = await getCampaignDetail(campaignId)
      if (!detail) throw new Error('Campaign not found')
      const seq =
        detail.campaign.sequence_draft ??
        scaffoldSequence(detail.campaign.structure_id || 'nick-3step', {
          offerKey: detail.campaign.offer_key
        })
      setCampaign(detail.campaign)
      setSequence(seq)
      setActiveStepId(seq.steps[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign not found')
    }
  }, [campaignId, unbound])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (variant !== 'overlay') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [variant, onClose])

  const persist = useCallback(
    async (nextCampaign: CompassCampaign, nextSequence: OutboundSequence) => {
      setSaveState('saving')
      const stamped = {
        ...nextSequence,
        updated_at: new Date().toISOString(),
        offer_key: nextCampaign.offer_key ?? nextSequence.offer_key
      }
      try {
        if (unbound) {
          const cam = { ...nextCampaign, sequence_draft: stamped, updated_at: new Date().toISOString() }
          writeUnbound(cam, stamped)
          setCampaign(cam)
          setSequence(stamped)
        } else if (campaignId) {
          const updated = await updateCampaign(campaignId, {
            offer_key: nextCampaign.offer_key ?? null,
            structure_id: stamped.structure_id,
            opener_mode: nextCampaign.opener_mode ?? 'nick-tier',
            vertical_tags: nextCampaign.vertical_tags ?? [],
            location_tags: nextCampaign.location_tags ?? [],
            cold_expression: nextCampaign.cold_expression ?? null,
            sequence_draft: stamped,
            copy_status: (nextCampaign.copy_status as string) || 'draft',
            instantly_campaign_id: nextCampaign.instantly_campaign_id ?? null,
            name: nextCampaign.name
          })
          setCampaign(updated)
          setSequence(updated.sequence_draft ?? stamped)
        }
        setSaveState('saved')
        window.setTimeout(() => setSaveState('idle'), 1200)
      } catch (err) {
        setSaveState('idle')
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    },
    [campaignId, unbound]
  )

  const scheduleAutosave = useCallback(
    (nextCampaign: CompassCampaign, nextSequence: OutboundSequence) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => {
        void persist(nextCampaign, nextSequence)
      }, 500)
    },
    [persist]
  )

  const updateSequence = useCallback(
    (next: OutboundSequence, campaignPatch?: Partial<CompassCampaign>) => {
      if (!campaign) return
      const nextCampaign = { ...campaign, ...campaignPatch, structure_id: next.structure_id }
      setSequence(next)
      setCampaign(nextCampaign)
      scheduleAutosave(nextCampaign, next)
    },
    [campaign, scheduleAutosave]
  )

  const applyLibraryPayload = useCallback(
    async (payload: LibraryDragPayload, stepId?: string, slotKey?: string) => {
      if (!campaign || !sequence) return
      let next = sequence
      let patch: Partial<CompassCampaign> = {}
      const targetStep = stepId || activeStepId || sequence.steps[0]?.id

      if (payload.kind === 'offer') {
        patch = { offer_key: payload.offer_key }
        try {
          const offer = await getOfferByKey(payload.offer_key)
          if (offer) {
            patch.vertical_tags = Array.from(
              new Set([...(campaign.vertical_tags ?? []), ...(offer.vertical_tags ?? [])])
            )
            patch.location_tags = Array.from(
              new Set([...(campaign.location_tags ?? []), ...(offer.location_tags ?? [])])
            )
          }
        } catch {
          /* offer lookup optional */
        }
        next = { ...next, offer_key: payload.offer_key }
      } else if (payload.kind === 'structure') {
        // Click applies immediately; matching slot bodies are preserved.
        next = applyStructureScaffold(sequence, payload.structure_id, {
          offerKey: campaign.offer_key,
          preserveBodies: true
        })
        patch = { structure_id: payload.structure_id }
        setActiveStepId(next.steps[0]?.id ?? null)
      } else if (payload.kind === 'template') {
        let forked: OutboundSequence | null = null
        try {
          forked = await forkTemplateIntoSequence(payload.id)
        } catch {
          setError('Could not load template')
          return
        }
        if (!forked) return
        next = forked
        patch = {
          offer_key: forked.offer_key ?? campaign.offer_key,
          structure_id: forked.structure_id,
          copy_status: 'draft'
        }
        setActiveStepId(next.steps[0]?.id ?? null)
      } else if (payload.kind === 'expression') {
        if (!targetStep) return
        next = copyTextIntoSlot(sequence, targetStep, slotKey || 'cold_expression', payload.body)
        patch = {
          offer_key: payload.offer_key || campaign.offer_key,
          cold_expression: payload.body
        }
      } else if (payload.kind === 'cta') {
        if (!targetStep) return
        next = copyTextIntoSlot(sequence, targetStep, slotKey || 'cta', payload.body)
      } else if (payload.kind === 'subject') {
        if (!targetStep) return
        next = setStepSubject(sequence, targetStep, payload.pattern)
        setFocusField('subject')
      } else if (payload.kind === 'opener') {
        if (!targetStep) return
        next = copyTextIntoSlot(sequence, targetStep, slotKey || 'opener', payload.body)
        patch = { opener_mode: payload.opener_mode }
      }

      updateSequence(next, patch)
    },
    [campaign, sequence, activeStepId, updateSequence]
  )

  function saveExplicit() {
    if (!campaign || !sequence) return
    void persist(campaign, sequence)
  }

  async function attachUnboundToNewCampaign() {
    if (!campaign || !sequence) return
    try {
      setSaveState('saving')
      const created = await createCampaign({
        name: campaign.name || 'Outbound campaign',
        offer_key: campaign.offer_key ?? null,
        structure_id: sequence.structure_id,
        opener_mode: campaign.opener_mode ?? 'nick-tier',
        vertical_tags: campaign.vertical_tags ?? [],
        location_tags: campaign.location_tags ?? [],
        cold_expression: campaign.cold_expression ?? null,
        sequence_draft: forkSequence(sequence, { remintStepIds: true }),
        copy_status: 'draft',
        instantly_campaign_id: campaign.instantly_campaign_id ?? null
      })
      window.localStorage.removeItem(UNBOUND_KEY)
      if (variant === 'overlay') {
        onClose?.()
      }
      window.location.href = `/sales/outbound/editor/${created.id}`
    } catch (err) {
      setSaveState('idle')
      setError(err instanceof Error ? err.message : 'Could not create campaign')
    }
  }

  function insertVariable(token: string) {
    if (!campaign || !sequence || !activeStepId) return
    const step = sequence.steps.find((s) => s.id === activeStepId)
    if (!step) return
    if (focusField === 'subject') {
      updateSequence(setStepSubject(sequence, activeStepId, `${step.subject}${token}`))
      return
    }
    updateSequence(writeStepBody(sequence, activeStepId, `${stepBodyText(step)}${token}`), {
      cold_expression:
        activeStepId === sequence.steps[0]?.id
          ? `${campaign.cold_expression || ''}${token}`
          : campaign.cold_expression
    })
  }

  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => {
    setPortalReady(true)
  }, [])

  const shell = (children: ReactNode) => {
    if (variant === 'overlay') {
      if (!portalReady) return null
      // Portal to body so parent transforms (e.g. animate-fade-up) don't trap `fixed`.
      return createPortal(
        <AnimatePresence>
          <motion.div
            className="fixed inset-0 z-[110] flex flex-col bg-[var(--compass-wash)]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>,
        document.body
      )
    }
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-[var(--compass-wash)] shadow-none">
        {children}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!campaign || !sequence) {
    return (
      <div className="rounded-2xl border border-stone-200/70 bg-white p-5 text-sm text-neutral-500 shadow-soft">
        Loading editor…
      </div>
    )
  }

  const tabs: { id: EditorTab; label: string }[] = [
    { id: 'analytics', label: 'Analytics' },
    { id: 'editor', label: 'Editor' },
    { id: 'archive', label: 'Archive' },
    { id: 'leads', label: 'Leads' },
    { id: 'settings', label: 'Settings' }
  ]

  return shell(
    <>
      {/* Top chrome */}
      <header className="relative z-10 flex shrink-0 flex-wrap items-center gap-3 border-b border-stone-200/80 bg-white px-4 py-3 shadow-soft">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (variant === 'overlay') onClose?.()
              else if (typeof window !== 'undefined') window.history.back()
            }}
            className="rounded-xl p-2 text-neutral-500 transition hover:bg-stone-50 hover:text-neutral-800"
            aria-label="Close editor"
          >
            {variant === 'overlay' ? <X className="size-4" /> : <ArrowLeft className="size-4" />}
          </button>
          <input
            value={campaign.name}
            onChange={(e) => {
              const next = { ...campaign, name: e.target.value }
              setCampaign(next)
              if (sequence) scheduleAutosave(next, sequence)
            }}
            className="min-w-0 flex-1 truncate border-0 bg-transparent text-[15px] font-semibold text-neutral-900 outline-none placeholder:text-neutral-400"
            placeholder="Untitled Campaign"
          />
        </div>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 sm:flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative px-2.5 py-1.5 text-[13px] font-medium transition md:px-3',
                tab === t.id ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-800'
              )}
            >
              {t.label}
              {tab === t.id ? (
                <span className="absolute inset-x-2 -bottom-[11px] h-0.5 rounded-full bg-[#e85d2a]" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="hidden items-center gap-1.5 text-[12px] text-neutral-500 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-stone-300" />
            {campaign.copy_status === 'live' ? 'Live' : 'Draft'}
          </span>
          <span className="text-[11px] text-neutral-400">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Autosave on'}
          </span>
          <button
            type="button"
            onClick={saveExplicit}
            className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft"
          >
            Save
          </button>
          {unbound ? (
            <button
              type="button"
              onClick={attachUnboundToNewCampaign}
              className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft"
            >
              Attach
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#e85d2a] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft"
          >
            <Rocket className="size-3.5" />
            Launch
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === 'archive' ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <CopyArchivePanel
                campaign={campaign}
                sequence={sequence}
                onForkSequence={(next, meta) => {
                  updateSequence(next, meta)
                  setActiveStepId(next.steps[0]?.id ?? null)
                  setTab('editor')
                }}
                onInsertIntoStep={(subject, body) => {
                  const stepId = activeStepId || sequence.steps[0]?.id
                  if (!stepId) return
                  let next = setStepSubject(sequence, stepId, subject)
                  next = writeStepBody(next, stepId, body)
                  const patch: Partial<CompassCampaign> = {}
                  const stepIndex = next.steps.findIndex((s) => s.id === stepId)
                  if (stepIndex === 0) patch.cold_expression = body
                  updateSequence(next, patch)
                  setTab('editor')
                }}
              />
            </div>
          ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'editor' ? (
            <div
              className={cn(
                'mx-auto w-full px-4 pb-8 pt-8',
                previewDevice === 'mobile' ? 'max-w-md' : 'max-w-2xl'
              )}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const payload = parseLibraryDrag(e.dataTransfer)
                if (payload) void applyLibraryPayload(payload)
              }}
            >
              {sequence.steps.map((step, index) => (
                <div key={step.id}>
                  {index > 0 ? (
                    <div className="my-5 flex items-center justify-center gap-2 text-[12px] text-neutral-500">
                      <div className="h-px flex-1 bg-stone-200" />
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 shadow-soft">
                        Wait
                        <input
                          type="number"
                          min={1}
                          value={step.delay_days ?? 3}
                          onChange={(e) => {
                            const next = forkSequence(sequence)
                            const s = next.steps.find((x) => x.id === step.id)
                            if (s) s.delay_days = Number(e.target.value) || 3
                            updateSequence(next)
                          }}
                          className="w-10 rounded-lg border border-stone-200 px-1.5 py-0.5 text-center text-[12px]"
                        />
                        days
                      </span>
                      <div className="h-px flex-1 bg-stone-200" />
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'rounded-2xl border bg-white p-4 shadow-soft transition',
                      activeStepId === step.id
                        ? 'border-[#e85d2a]/35 ring-2 ring-[#e85d2a]/10'
                        : 'border-stone-200/80'
                    )}
                    onClick={() => setActiveStepId(step.id)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {step.label}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="flex size-6 items-center justify-center rounded-lg bg-stone-100 text-[11px] font-semibold text-neutral-500">
                          {index + 1}
                        </span>
                        {step.kind === 'followup' || sequence.steps.length > 1 ? (
                          <button
                            type="button"
                            aria-label="Remove step"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (sequence.steps.length <= 1) return
                              const next = forkSequence(sequence)
                              next.steps = next.steps.filter((s) => s.id !== step.id)
                              // Keep at least one email step if we removed the primary.
                              if (!next.steps.some((s) => s.kind === 'email') && next.steps[0]) {
                                next.steps[0] = { ...next.steps[0], kind: 'email', label: 'Email 1' }
                              }
                              updateSequence(next)
                              setActiveStepId((prev) =>
                                prev === step.id ? (next.steps[0]?.id ?? null) : prev
                              )
                            }}
                            className="inline-flex size-6 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <X className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="relative">
                      <input
                        value={step.subject}
                        onFocus={() => {
                          setActiveStepId(step.id)
                          setFocusField('subject')
                        }}
                        onChange={(e) => {
                          updateSequence(setStepSubject(sequence, step.id, e.target.value))
                        }}
                        placeholder={
                          index === 0
                            ? 'Subject line'
                            : "Leave empty to use previous step's subject"
                        }
                        className={cn(
                          'w-full rounded-xl border bg-white py-2.5 pl-3.5 pr-10 text-[14px] outline-none transition',
                          subjectLooksBanned(step.subject)
                            ? 'border-amber-300'
                            : 'border-stone-200 focus:border-[#e85d2a]/45'
                        )}
                      />
                      <Zap className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-300" />
                    </div>
                    {subjectLooksBanned(step.subject) ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Soft warn: avoid “quick” subject stems.
                      </p>
                    ) : null}

                    <textarea
                      value={stepBodyText(step)}
                      onFocus={() => {
                        setActiveStepId(step.id)
                        setFocusField('body')
                      }}
                      onChange={(e) => {
                        const next = writeStepBody(sequence, step.id, e.target.value)
                        const patch: Partial<CompassCampaign> = {}
                        if (index === 0) patch.cold_expression = e.target.value
                        updateSequence(next, patch)
                      }}
                      rows={previewDevice === 'mobile' ? 10 : 12}
                      placeholder="Write your email body…"
                      className="mt-3 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[14px] leading-relaxed text-neutral-800 outline-none focus:border-[#e85d2a]/45"
                    />
                  </div>
                </div>
              ))}

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const fuCount = sequence.steps.filter((s) => s.kind === 'followup').length
                    const next = forkSequence(sequence)
                    next.steps.push(emptyFollowUpStep(fuCount + 1, 3))
                    updateSequence(next)
                    setActiveStepId(next.steps[next.steps.length - 1]?.id ?? null)
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-full border border-stone-200 bg-white text-neutral-600 shadow-soft transition hover:border-[#e85d2a]/40 hover:text-[#c2410c]"
                  aria-label="Add follow-up"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'settings' ? (
            <div className="mx-auto max-w-lg px-4 py-8">
              <CampaignCopyMeta
                campaign={campaign}
                sequence={sequence}
                unbound={unbound}
                onChange={(patch) => {
                  const nextCampaign = { ...campaign, ...patch }
                  setCampaign(nextCampaign)
                  if (sequence) scheduleAutosave(nextCampaign, sequence)
                }}
              />
            </div>
          ) : null}

          {tab === 'analytics' ? (
            <SequenceAnalyticsPanel
              instantlyCampaignId={campaign.instantly_campaign_id}
              onOpenSettings={() => setTab('settings')}
            />
          ) : null}

          {tab === 'leads' ? (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
              <p className="text-[15px] font-semibold text-neutral-900">Leads</p>
              <p className="mt-2 text-sm text-neutral-500">
                Lead membership and suppression for this campaign will appear here after launch.
              </p>
            </div>
          ) : null}
          </div>
          )}

          {tab === 'editor' ? (
            <div className="shrink-0 border-t border-stone-200/80 bg-white px-4 py-3 shadow-soft">
              <div className="mx-auto flex max-w-2xl flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    <Zap className="size-3.5 text-[#e85d2a]" />
                    Instantly variables
                    <span className="font-normal normal-case tracking-normal text-neutral-400">
                      · insert into {focusField === 'subject' ? 'subject' : 'body'}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      title="Desktop width"
                      aria-label="Desktop width"
                      onClick={() => setPreviewDevice('desktop')}
                      className={cn(
                        'rounded-xl p-1.5 text-neutral-400 transition hover:bg-stone-50 hover:text-neutral-700',
                        previewDevice === 'desktop' && 'bg-[#e85d2a]/10 text-[#c2410c]'
                      )}
                    >
                      <Monitor className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Mobile width"
                      aria-label="Mobile width"
                      onClick={() => setPreviewDevice('mobile')}
                      className={cn(
                        'rounded-xl p-1.5 text-neutral-400 transition hover:bg-stone-50 hover:text-neutral-700',
                        previewDevice === 'mobile' && 'bg-[#e85d2a]/10 text-[#c2410c]'
                      )}
                    >
                      <Smartphone className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INSTANTLY_BASE_VARIABLES.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      title={variable.token}
                      onClick={() => insertVariable(variable.token)}
                      className="rounded-xl border border-stone-200 bg-stone-50/80 px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition hover:border-[#e85d2a]/35 hover:bg-[#e85d2a]/5 hover:text-[#c2410c]"
                    >
                      {`{{${variable.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right accordion rail */}
        {tab === 'editor' ? (
          <aside className="hidden w-[400px] shrink-0 border-l border-stone-200/80 bg-white lg:flex lg:flex-col">
            <EditorComponentsAccordion
              onInsert={(payload) => void applyLibraryPayload(payload)}
              className="min-h-0 flex-1"
              campaignContext={{
                offer_key: campaign?.offer_key ?? null,
                vertical_tags: campaign?.vertical_tags ?? [],
                location_tags: campaign?.location_tags ?? [],
                structure_id: campaign?.structure_id ?? sequence?.structure_id ?? null
              }}
            />
          </aside>
        ) : null}
      </div>
    </>
  )
}

/** Keep slot-save helpers available for future settings tools. */
export async function saveActiveSlotToLibrary(
  campaign: CompassCampaign | null,
  step: OutboundStep,
  slotKey: string
) {
  const slot = step.slots.find((s) => s.key === slotKey)
  if (!slot?.body.trim()) return
  if (slotKey === 'cold_expression') {
    const label = window.prompt('Save expression as', 'Campaign expression')
    if (!label) return
    await createLibraryItem('expressions', {
      offer_key: campaign?.offer_key || 'growth-system',
      label,
      body: slot.body,
      status: 'draft',
      vertical_tags: campaign?.vertical_tags ?? [],
      location_tags: campaign?.location_tags ?? []
    })
    return
  }
  if (slotKey === 'cta' || slotKey === 'availability_ask') {
    const label = window.prompt('Save CTA as', 'Campaign CTA')
    if (!label) return
    await createLibraryItem('ctas', { label, body: slot.body, cta_type: 'other' })
  }
}
