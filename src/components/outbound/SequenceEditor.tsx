'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createLocalCampaign,
  getLocalCampaignDetail,
  updateLocalCampaign
} from '@/lib/campaign-local-store'
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
  forkTemplateIntoSequence,
  getLocalOfferByKey,
  saveLocalCta,
  saveLocalExpression,
  saveLocalSubject
} from '@/lib/outbound-local-store'
import { CampaignCopyMeta } from '@/components/outbound/CampaignCopyMeta'
import { LibraryPane, parseLibraryDrag, type LibraryDragPayload } from '@/components/outbound/LibraryPane'
import { cn } from '@/lib/utils'

const UNBOUND_KEY = 'compass.outbound.unbound-draft.v1'

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

export function SequenceEditor({
  campaignId,
  unbound = false
}: {
  campaignId?: string
  unbound?: boolean
}) {
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [sequence, setSequence] = useState<OutboundSequence | null>(null)
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [dropSlot, setDropSlot] = useState<{ stepId: string; slotKey: string } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hydrate = useCallback(() => {
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
        name: 'Untitled sequence',
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
    const detail = getLocalCampaignDetail(campaignId)
    if (!detail) {
      setError('Campaign not found')
      return
    }
    const seq =
      detail.campaign.sequence_draft ??
      scaffoldSequence(detail.campaign.structure_id || 'nick-3step', {
        offerKey: detail.campaign.offer_key
      })
    setCampaign(detail.campaign)
    setSequence(seq)
    setActiveStepId(seq.steps[0]?.id ?? null)
    setError(null)
  }, [campaignId, unbound])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const persist = useCallback(
    (nextCampaign: CompassCampaign, nextSequence: OutboundSequence, major = false) => {
      setSaveState('saving')
      const stamped = {
        ...nextSequence,
        updated_at: new Date().toISOString(),
        offer_key: nextCampaign.offer_key ?? nextSequence.offer_key
      }
      if (unbound) {
        const cam = { ...nextCampaign, sequence_draft: stamped, updated_at: new Date().toISOString() }
        writeUnbound(cam, stamped)
        setCampaign(cam)
        setSequence(stamped)
      } else if (campaignId) {
        const updated = updateLocalCampaign(campaignId, {
          offer_key: nextCampaign.offer_key ?? null,
          structure_id: stamped.structure_id,
          opener_mode: nextCampaign.opener_mode ?? 'nick-tier',
          vertical_tags: nextCampaign.vertical_tags ?? [],
          location_tags: nextCampaign.location_tags ?? [],
          cold_expression: nextCampaign.cold_expression ?? null,
          sequence_draft: stamped,
          copy_status: (nextCampaign.copy_status as string) || 'draft',
          instantly_campaign_id: nextCampaign.instantly_campaign_id ?? null
        })
        if (updated) {
          setCampaign(updated)
          setSequence(stamped)
        }
        if (major) {
          // activity already pushed on sequence_draft update
        }
      }
      setSaveState('saved')
      window.setTimeout(() => setSaveState('idle'), 1200)
    },
    [campaignId, unbound]
  )

  const scheduleAutosave = useCallback(
    (nextCampaign: CompassCampaign, nextSequence: OutboundSequence) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => persist(nextCampaign, nextSequence), 500)
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
    (payload: LibraryDragPayload, stepId?: string, slotKey?: string) => {
      if (!campaign || !sequence) return
      let next = sequence
      let patch: Partial<CompassCampaign> = {}

      if (payload.kind === 'offer') {
        patch = { offer_key: payload.offer_key }
        const offer = getLocalOfferByKey(payload.offer_key)
        if (offer) {
          patch.vertical_tags = Array.from(
            new Set([...(campaign.vertical_tags ?? []), ...offer.vertical_tags])
          )
          patch.location_tags = Array.from(
            new Set([...(campaign.location_tags ?? []), ...offer.location_tags])
          )
        }
        next = { ...next, offer_key: payload.offer_key }
      } else if (payload.kind === 'structure') {
        const hasBodies = sequence.steps.some((s) =>
          s.slots.some((slot) => slot.body.trim()) || s.subject.trim()
        )
        if (hasBodies) {
          const ok = window.confirm(
            'Replace the current sequence scaffold with this structure? Existing slot bodies can be preserved where keys match.'
          )
          if (!ok) return
        }
        next = applyStructureScaffold(sequence, payload.structure_id, {
          offerKey: campaign.offer_key,
          preserveBodies: true
        })
        patch = { structure_id: payload.structure_id }
        setActiveStepId(next.steps[0]?.id ?? null)
      } else if (payload.kind === 'template') {
        const forked = forkTemplateIntoSequence(payload.id)
        if (!forked) return
        const ok = window.confirm(`Fork template “${payload.name}” into this campaign draft?`)
        if (!ok) return
        next = forked
        patch = {
          offer_key: forked.offer_key ?? campaign.offer_key,
          structure_id: forked.structure_id,
          copy_status: 'draft'
        }
        setActiveStepId(next.steps[0]?.id ?? null)
      } else if (payload.kind === 'expression') {
        const targetStep = stepId || activeStepId || sequence.steps[0]?.id
        if (!targetStep) return
        next = copyTextIntoSlot(sequence, targetStep, slotKey || 'cold_expression', payload.body)
        patch = {
          offer_key: payload.offer_key || campaign.offer_key,
          cold_expression: payload.body
        }
      } else if (payload.kind === 'cta') {
        const targetStep = stepId || activeStepId || sequence.steps[0]?.id
        if (!targetStep) return
        const key = slotKey || 'cta'
        next = copyTextIntoSlot(sequence, targetStep, key, payload.body)
      } else if (payload.kind === 'subject') {
        const targetStep = stepId || activeStepId || sequence.steps[0]?.id
        if (!targetStep) return
        next = setStepSubject(sequence, targetStep, payload.pattern)
      } else if (payload.kind === 'opener') {
        const targetStep = stepId || activeStepId || sequence.steps[0]?.id
        if (!targetStep) return
        next = copyTextIntoSlot(sequence, targetStep, slotKey || 'opener', payload.body)
        patch = { opener_mode: payload.opener_mode }
      }

      updateSequence(next, patch)
    },
    [campaign, sequence, activeStepId, updateSequence]
  )

  const activeStep = useMemo(
    () => sequence?.steps.find((s) => s.id === activeStepId) ?? sequence?.steps[0] ?? null,
    [sequence, activeStepId]
  )

  function onStepDrop(e: React.DragEvent, stepId: string, slotKey?: string) {
    e.preventDefault()
    setDropSlot(null)
    const payload = parseLibraryDrag(e.dataTransfer)
    if (!payload) return
    applyLibraryPayload(payload, stepId, slotKey)
  }

  function saveExplicit() {
    if (!campaign || !sequence) return
    persist(campaign, sequence, true)
  }

  function attachUnboundToNewCampaign() {
    if (!campaign || !sequence) return
    const created = createLocalCampaign({ name: campaign.name || 'Outbound campaign' })
    updateLocalCampaign(created.id, {
      offer_key: campaign.offer_key ?? null,
      structure_id: sequence.structure_id,
      opener_mode: campaign.opener_mode ?? 'nick-tier',
      vertical_tags: campaign.vertical_tags ?? [],
      location_tags: campaign.location_tags ?? [],
      cold_expression: campaign.cold_expression ?? null,
      sequence_draft: forkSequence(sequence),
      copy_status: 'draft',
      instantly_campaign_id: campaign.instantly_campaign_id ?? null
    })
    window.localStorage.removeItem(UNBOUND_KEY)
    window.location.href = `/sales/outbound/editor/${created.id}`
  }

  function saveSlotToLibrary(step: OutboundStep, slotKey: string) {
    const slot = step.slots.find((s) => s.key === slotKey)
    if (!slot?.body.trim()) return
    if (slotKey === 'cold_expression') {
      const label = window.prompt('Save expression as', 'Campaign expression')
      if (!label) return
      saveLocalExpression({
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
      saveLocalCta({ label, body: slot.body, cta_type: 'other' })
      return
    }
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

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="compass-page-title font-display text-2xl text-neutral-900">
            Sequence editor
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Drag library items to copy into this campaign draft — never live-binds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Autosave on'}
          </span>
          <button
            type="button"
            onClick={saveExplicit}
            className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
          >
            Save
          </button>
          {unbound ? (
            <button
              type="button"
              onClick={attachUnboundToNewCampaign}
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-neutral-800 shadow-soft"
            >
              Attach to new campaign
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-[620px] grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <LibraryPane
          offerKeyFilter={campaign.offer_key}
          onOfferFilter={(offer_key) => {
            const next = { ...campaign, offer_key }
            setCampaign(next)
            if (sequence) scheduleAutosave(next, sequence)
          }}
        />

        <div
          className="flex min-h-0 flex-col rounded-2xl border border-stone-200/70 bg-white shadow-soft"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const payload = parseLibraryDrag(e.dataTransfer)
            if (payload) applyLibraryPayload(payload)
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {sequence.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-[12px] font-medium',
                    activeStep?.id === step.id
                      ? 'bg-white text-neutral-900 shadow-soft'
                      : 'text-neutral-500 hover:bg-stone-50'
                  )}
                >
                  {step.label}
                  {step.kind === 'followup' && step.delay_days
                    ? ` · ${step.delay_days}d`
                    : ''}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const fuCount = sequence.steps.filter((s) => s.kind === 'followup').length
                const next = forkSequence(sequence)
                next.steps.push(emptyFollowUpStep(fuCount + 1, 3))
                updateSequence(next)
                setActiveStepId(next.steps[next.steps.length - 1]?.id ?? null)
              }}
              className="rounded-xl border border-stone-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700"
            >
              + Follow-up
            </button>
          </div>

          {activeStep ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Subject
                </label>
                <input
                  value={activeStep.subject}
                  onChange={(e) => {
                    const next = setStepSubject(sequence, activeStep.id, e.target.value)
                    updateSequence(next)
                  }}
                  className={cn(
                    'w-full rounded-xl border bg-white px-3 py-2 text-[13px]',
                    subjectLooksBanned(activeStep.subject)
                      ? 'border-amber-300'
                      : 'border-stone-200'
                  )}
                  placeholder="Subject pattern (no “quick question”)"
                />
                {subjectLooksBanned(activeStep.subject) ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Soft warn: avoid “quick” subject stems.
                  </p>
                ) : null}
              </div>

              {activeStep.kind === 'followup' ? (
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Delay (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={activeStep.delay_days ?? 3}
                    onChange={(e) => {
                      const next = forkSequence(sequence)
                      const step = next.steps.find((s) => s.id === activeStep.id)
                      if (step) step.delay_days = Number(e.target.value) || 3
                      updateSequence(next)
                    }}
                    className="w-28 rounded-xl border border-stone-200 px-3 py-2 text-[13px]"
                  />
                </div>
              ) : null}

              {activeStep.slots.map((slot) => (
                <div
                  key={slot.key}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropSlot({ stepId: activeStep.id, slotKey: slot.key })
                  }}
                  onDragLeave={() => setDropSlot(null)}
                  onDrop={(e) => onStepDrop(e, activeStep.id, slot.key)}
                  className={cn(
                    'rounded-xl border p-3 transition',
                    dropSlot?.stepId === activeStep.id && dropSlot.slotKey === slot.key
                      ? 'border-[#e85d2a]/50 bg-[#e85d2a]/5'
                      : 'border-stone-200/80 bg-stone-50/40'
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                      {slot.label}
                      {slot.required ? ' *' : ''}
                    </span>
                    {(slot.key === 'cold_expression' ||
                      slot.key === 'cta' ||
                      slot.key === 'availability_ask') &&
                    slot.body.trim() ? (
                      <button
                        type="button"
                        onClick={() => saveSlotToLibrary(activeStep, slot.key)}
                        className="text-[11px] font-medium text-[#c2410c] hover:underline"
                      >
                        Save to library
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    value={slot.body}
                    onChange={(e) => {
                      const next = copyTextIntoSlot(
                        sequence,
                        activeStep.id,
                        slot.key,
                        e.target.value
                      )
                      const patch: Partial<CompassCampaign> = {}
                      if (slot.key === 'cold_expression') patch.cold_expression = e.target.value
                      updateSequence(next, patch)
                    }}
                    rows={slot.key === 'accountSignature' || slot.key === 'spam_act_opt_out' ? 2 : 4}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] leading-relaxed"
                    placeholder={`{{${slot.key}}} or plain text`}
                  />
                </div>
              ))}

              {sequence.steps.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep.kind === 'email') return
                    const next = forkSequence(sequence)
                    next.steps = next.steps.filter((s) => s.id !== activeStep.id)
                    updateSequence(next)
                    setActiveStepId(next.steps[0]?.id ?? null)
                  }}
                  className="text-[12px] text-red-600 hover:underline disabled:opacity-40"
                  disabled={activeStep.kind === 'email'}
                >
                  Remove this follow-up
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

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
    </div>
  )
}
