'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ChevronDown, Eye, EyeOff, Monitor, Plus, Rocket, Smartphone, X, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  createCampaign,
  ensureInstantlyCampaign,
  getCampaignDetail,
  listCampaigns,
  pushInstantlyLeads,
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
import { CampaignInstantlyPanel } from '@/components/outbound/CampaignInstantlyPanel'
import { CampaignExperimentPanel } from '@/components/outbound/CampaignExperimentPanel'
import { CopyArchivePanel } from '@/components/outbound/CopyArchivePanel'
import { SequenceAnalyticsPanel } from '@/components/outbound/SequenceAnalyticsPanel'
import { INSTANTLY_BASE_VARIABLES } from '@/lib/instantly-variables'
import { findBind } from '@/lib/outbound-factor-performance'
import type { LeadContact } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CampaignLeadsPane } from '@/components/outbound/CampaignLeadsPane'
import { InstantlyBindPrompt } from '@/components/outbound/InstantlyBindPrompt'
import { SequencePreviewText } from '@/components/outbound/SequencePreviewBody'

const UNBOUND_KEY = 'compass.outbound.unbound-draft.v1'
const COMPONENTS_WIDTH_KEY = 'compass.outbound.components-width.v2'
const COMPONENTS_WIDTH_DEFAULT = 680
const COMPONENTS_WIDTH_MIN = 480
const COMPONENTS_WIDTH_MAX = 960

type EditorTab = 'analytics' | 'editor' | 'experiment' | 'archive' | 'settings'

const LEADS_HEIGHT_KEY = 'compass.outbound.editor-leads-height.v1'
const LEADS_HEIGHT_DEFAULT = 36
const LEADS_HEIGHT_MIN = 28
const LEADS_HEIGHT_MAX = 70

function readLeadsHeight(): number {
  if (typeof window === 'undefined') return LEADS_HEIGHT_DEFAULT
  try {
    const raw = window.localStorage.getItem(LEADS_HEIGHT_KEY)
    const n = raw ? Number(raw) : NaN
    if (!Number.isFinite(n)) return LEADS_HEIGHT_DEFAULT
    return Math.min(LEADS_HEIGHT_MAX, Math.max(LEADS_HEIGHT_MIN, Math.round(n)))
  } catch {
    return LEADS_HEIGHT_DEFAULT
  }
}

function readComponentsWidth(): number {
  if (typeof window === 'undefined') return COMPONENTS_WIDTH_DEFAULT
  try {
    const raw = window.localStorage.getItem(COMPONENTS_WIDTH_KEY)
    const n = raw ? Number(raw) : NaN
    if (!Number.isFinite(n)) return COMPONENTS_WIDTH_DEFAULT
    return Math.min(COMPONENTS_WIDTH_MAX, Math.max(COMPONENTS_WIDTH_MIN, Math.round(n)))
  } catch {
    return COMPONENTS_WIDTH_DEFAULT
  }
}

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
  const bodies = step.slots
    .filter((s) => !BODY_SLOT_SKIP.has(s.key))
    .map((s) => s.body)
  if (bodies.length <= 1) return bodies[0] ?? ''
  const filled = bodies.filter((body) => body.length > 0)
  return filled.length <= 1 ? (filled[0] ?? '') : filled.join('\n\n')
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
  const primary =
    contentSlots.find((s) => s.key === 'custom') ||
    contentSlots.find((s) => s.key === 'cold_expression') ||
    contentSlots[0]
  for (const slot of contentSlots) slot.body = slot === primary ? body : ''
  return next
}

export function SequenceEditor({
  campaignId,
  instantlyCampaignId,
  unbound = false,
  variant = 'page',
  leadsPane = 'auto',
  initialTab = 'editor',
  onClose,
  onChallengerSpawned
}: {
  campaignId?: string
  instantlyCampaignId?: string
  unbound?: boolean
  variant?: 'page' | 'overlay'
  leadsPane?: 'auto' | 'hidden'
  initialTab?: EditorTab
  onClose?: () => void
  onChallengerSpawned?: (campaignId: string) => void
}) {
  const router = useRouter()
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [sequence, setSequence] = useState<OutboundSequence | null>(null)
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [launchBusy, setLaunchBusy] = useState(false)
  const [tab, setTab] = useState<EditorTab>(initialTab)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [previewOn, setPreviewOn] = useState(false)
  const [previewLead, setPreviewLead] = useState<LeadContact | null>(null)
  const [leadsHeightVh, setLeadsHeightVh] = useState(LEADS_HEIGHT_DEFAULT)
  const [leadsCollapsed, setLeadsCollapsed] = useState(variant === 'overlay')
  const [instantlyUnbound, setInstantlyUnbound] = useState(false)
  const [focusField, setFocusField] = useState<'subject' | 'body'>('body')
  const [componentsWidth, setComponentsWidth] = useState(COMPONENTS_WIDTH_DEFAULT)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const leadsResize = useRef<{ startY: number; startVh: number } | null>(null)
  const loadedLeadsRef = useRef<LeadContact[]>([])
  const componentsWidthRef = useRef(componentsWidth)
  const leadsHeightRef = useRef(leadsHeightVh)
  const campaignRef = useRef<CompassCampaign | null>(null)
  const sequenceRef = useRef<OutboundSequence | null>(null)
  const persistInFlight = useRef(false)
  const persistQueued = useRef(false)
  const saveEpochRef = useRef(0)
  const hydrateGenRef = useRef(0)
  const routerRef = useRef(router)
  routerRef.current = router
  componentsWidthRef.current = componentsWidth
  leadsHeightRef.current = leadsHeightVh
  campaignRef.current = campaign
  sequenceRef.current = sequence

  const closeEditor = useCallback(() => {
    if (onClose) {
      onClose()
      return
    }
    if (typeof window !== 'undefined') window.history.back()
  }, [onClose])

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab, campaignId, instantlyCampaignId])

  useEffect(() => {
    setComponentsWidth(readComponentsWidth())
    setLeadsHeightVh(readLeadsHeight())
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = resizeDrag.current
      if (drag) {
        const next = Math.min(
          COMPONENTS_WIDTH_MAX,
          Math.max(COMPONENTS_WIDTH_MIN, drag.startWidth + (drag.startX - e.clientX))
        )
        setComponentsWidth(next)
      }
      const leadsDrag = leadsResize.current
      if (leadsDrag) {
        const deltaVh = ((e.clientY - leadsDrag.startY) / window.innerHeight) * 100
        const next = Math.min(
          LEADS_HEIGHT_MAX,
          Math.max(LEADS_HEIGHT_MIN, leadsDrag.startVh - deltaVh)
        )
        setLeadsHeightVh(next)
      }
    }
    function onUp() {
      if (resizeDrag.current) {
        resizeDrag.current = null
        try {
          window.localStorage.setItem(COMPONENTS_WIDTH_KEY, String(componentsWidthRef.current))
        } catch {
          /* ignore */
        }
      }
      if (leadsResize.current) {
        leadsResize.current = null
        try {
          window.localStorage.setItem(LEADS_HEIGHT_KEY, String(Math.round(leadsHeightRef.current)))
        } catch {
          /* ignore */
        }
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const hydrate = useCallback(async () => {
    const key = unbound
      ? 'unbound'
      : instantlyCampaignId && !campaignId
        ? `instantly:${instantlyCampaignId}`
        : campaignId
          ? `campaign:${campaignId}`
          : null
    if (!key) return
    const gen = ++hydrateGenRef.current
    const keepStep = (steps: Array<{ id: string }>) => {
      setActiveStepId((prev) =>
        prev && steps.some((step) => step.id === prev) ? prev : (steps[0]?.id ?? null)
      )
    }
    if (unbound) {
      const existing = readUnbound()
      if (existing) {
        if (gen !== hydrateGenRef.current) return
        setCampaign(existing.campaign)
        setSequence(existing.sequence)
        keepStep(existing.sequence.steps)
        setInstantlyUnbound(false)
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
        go_live_at: null,
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
      if (gen !== hydrateGenRef.current) return
      setCampaign(draft)
      setSequence(seq)
      keepStep(seq.steps)
      setInstantlyUnbound(false)
      return
    }
    if (instantlyCampaignId && !campaignId) {
      try {
        setError(null)
        const pipeline = await listCampaigns()
        const bind = findBind({ id: instantlyCampaignId }, pipeline)
        if (bind) {
          routerRef.current.replace(`/sales/outbound/editor/${encodeURIComponent(bind.id)}`)
          return
        }
        const boardRes = await fetch('/api/instantly/outbound-campaigns', {
          headers: { Accept: 'application/json' }
        })
        const board = (await boardRes.json().catch(() => ({}))) as {
          live?: Array<{ id: string; name: string }>
          history?: Array<{ id: string; name: string }>
        }
        const row = [...(board.live ?? []), ...(board.history ?? [])].find(
          (item) => item.id === instantlyCampaignId
        )
        if (gen !== hydrateGenRef.current) return
        setCampaign({
          id: `instantly-${instantlyCampaignId}`,
          name: row?.name || 'Instantly campaign',
          status: 'active',
          priority: 0,
          health: 'no_updates',
          start_date: null,
          end_date: null,
          go_live_at: null,
          color: '#94a3b8',
          summary: null,
          labels: [],
          owner_label: null,
          ...emptyCampaignCopyFields(),
          instantly_campaign_id: instantlyCampaignId,
          copy_status: 'live',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        setSequence(null)
        setInstantlyUnbound(true)
      } catch (err) {
        if (gen !== hydrateGenRef.current) return
        setError(err instanceof Error ? err.message : 'Campaign not found')
      }
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
      if (gen !== hydrateGenRef.current) return
      setCampaign(detail.campaign)
      setSequence(seq)
      keepStep(seq.steps)
      setInstantlyUnbound(false)
    } catch (err) {
      if (gen !== hydrateGenRef.current) return
      setError(err instanceof Error ? err.message : 'Campaign not found')
    }
  }, [campaignId, instantlyCampaignId, unbound])

  useEffect(() => {
    void hydrate()
  }, [campaignId, instantlyCampaignId, unbound, hydrate])

  useEffect(() => {
    if (variant !== 'overlay') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditor()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [variant, closeEditor])

  const persist = useCallback(async () => {
    if (instantlyUnbound) return
    if (persistInFlight.current) {
      persistQueued.current = true
      return
    }
    persistInFlight.current = true
    setSaveState('saving')
    try {
      do {
        persistQueued.current = false
        const nextCampaign = campaignRef.current
        const nextSequence = sequenceRef.current
        if (!nextCampaign || !nextSequence) break
        const epoch = ++saveEpochRef.current
        const stamped = {
          ...nextSequence,
          updated_at: new Date().toISOString(),
          offer_key: nextCampaign.offer_key ?? nextSequence.offer_key
        }
        if (unbound) {
          const cam = { ...nextCampaign, sequence_draft: stamped, updated_at: new Date().toISOString() }
          writeUnbound(cam, stamped)
        } else if (campaignId) {
          await updateCampaign(campaignId, {
            offer_key: nextCampaign.offer_key ?? null,
            structure_id: stamped.structure_id,
            opener_mode: nextCampaign.opener_mode ?? 'nick-tier',
            vertical_tags: nextCampaign.vertical_tags ?? [],
            location_tags: nextCampaign.location_tags ?? [],
            cold_expression: nextCampaign.cold_expression ?? null,
            sequence_draft: stamped,
            copy_status: (nextCampaign.copy_status as string) || 'draft',
            instantly_campaign_id: nextCampaign.instantly_campaign_id ?? null,
            name: nextCampaign.name,
            hypothesis: nextCampaign.hypothesis ?? null,
            experiment_factor: (nextCampaign.experiment_factor as string) || 'none',
            experiment_role: (nextCampaign.experiment_role as string) || 'none',
            parent_campaign_id: nextCampaign.parent_campaign_id ?? null,
            experiment_status: (nextCampaign.experiment_status as string) || 'none',
            sample_size_target: nextCampaign.sample_size_target ?? null,
            experiment_decision: nextCampaign.experiment_decision ?? null,
            expression_key: nextCampaign.expression_key ?? null,
            cta_type: nextCampaign.cta_type ?? null
          })
        }
        // Never write the server row back into the editor. A late PATCH response
        // was replacing what you were still typing (subject/CTA/body flicker).
        if (epoch === saveEpochRef.current) {
          setSaveState('saved')
          window.setTimeout(() => {
            if (epoch === saveEpochRef.current) setSaveState('idle')
          }, 1200)
        }
      } while (persistQueued.current)
    } catch (err) {
      setSaveState('idle')
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      persistInFlight.current = false
      if (persistQueued.current) {
        persistQueued.current = false
        void persist()
      }
    }
  }, [campaignId, instantlyUnbound, unbound])

  const launchToInstantly = useCallback(async () => {
    if (!campaignId || unbound || instantlyUnbound || !campaign) return
    const ok = window.confirm(
      'Create or bind a paused Instantly campaign, push this copy, then push eligible leads. You still activate in Instantly after sign-off.'
    )
    if (!ok) return
    setLaunchBusy(true)
    setError(null)
    try {
      if (sequence) await persist()
      const ensured = await ensureInstantlyCampaign(campaignId, { pushSequence: true })
      setCampaign((current) =>
        current
          ? {
              ...ensured.campaign,
              sequence_draft: sequenceRef.current ?? current.sequence_draft,
              name: current.name,
              cold_expression: current.cold_expression
            }
          : ensured.campaign
      )
      const pushed = await pushInstantlyLeads(campaignId, { dryRun: false })
      setError(null)
      window.alert(
        pushed.created.length
          ? `Pushed ${pushed.created.length} lead${pushed.created.length === 1 ? '' : 's'}. Activate stays in Instantly.`
          : 'Copy is on Instantly. No new leads pushed (preview skips or already there). Activate stays in Instantly.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Instantly push failed')
    } finally {
      setLaunchBusy(false)
    }
  }, [campaign, campaignId, instantlyUnbound, persist, sequence, unbound])

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      void persist()
    }, 800)
  }, [persist])

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [])

  const updateSequence = useCallback(
    (next: OutboundSequence, campaignPatch?: Partial<CompassCampaign>) => {
      const current = campaignRef.current
      if (!current) return
      const nextCampaign = { ...current, ...campaignPatch, structure_id: next.structure_id }
      sequenceRef.current = next
      campaignRef.current = nextCampaign
      setSequence(next)
      setCampaign(nextCampaign)
      scheduleAutosave()
    },
    [scheduleAutosave]
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
    if (!campaignRef.current || !sequenceRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    void persist()
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
      if (variant === 'overlay') closeEditor()
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
            key="sequence-editor-overlay"
            className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 md:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.button
              type="button"
              aria-label="Close editor backdrop"
              className="absolute inset-0 bg-neutral-950/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => closeEditor()}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Sequence editor"
              className="relative flex h-[min(920px,calc(100dvh-2.5rem))] w-full max-w-[1480px] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--compass-wash)] shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </motion.div>
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
    return shell(
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p>{error}</p>
          {variant === 'overlay' ? (
            <button
              type="button"
              onClick={() => closeEditor()}
              className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-800"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!campaign || (!sequence && !instantlyUnbound)) {
    return shell(
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-neutral-500">
        Loading editor…
      </div>
    )
  }

  const tabs: { id: EditorTab; label: string }[] = [
    { id: 'analytics', label: 'Analytics' },
    { id: 'editor', label: 'Editor' },
    { id: 'experiment', label: 'Experiment' },
    { id: 'archive', label: 'Archive' },
    { id: 'settings', label: 'Settings' }
  ]

  const showLeadsPane =
    leadsPane !== 'hidden' && !unbound && Boolean(campaignId || instantlyCampaignId)
  const previewingName = previewLead?.name || previewLead?.company || previewLead?.email

  return shell(
    <>
      {/* Top chrome */}
      <header className="relative z-10 flex shrink-0 flex-wrap items-center gap-3 border-b border-stone-200/80 bg-white px-4 py-3 shadow-soft">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (variant === 'overlay') closeEditor()
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
              if (instantlyUnbound || !sequence) {
                setCampaign({ ...campaign, name: e.target.value })
                return
              }
              const next = { ...campaign, name: e.target.value }
              campaignRef.current = next
              setCampaign(next)
              scheduleAutosave()
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
          {previewOn && previewingName ? (
            <span className="hidden max-w-[10rem] truncate text-[11px] text-neutral-400 md:inline">
              Previewing {previewingName}
            </span>
          ) : null}
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
            disabled={unbound || instantlyUnbound || !campaignId || launchBusy}
            onClick={() => void launchToInstantly()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#e85d2a] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft disabled:opacity-50"
          >
            <Rocket className="size-3.5" />
            {launchBusy ? 'Pushing…' : 'Push to Instantly'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === 'archive' && sequence ? (
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
          ) : tab === 'archive' ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-neutral-500">
              Link a Compass campaign to use the copy archive.
            </div>
          ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'editor' && instantlyUnbound ? (
            <div className="px-4 py-10">
              <InstantlyBindPrompt
                instantlyCampaignId={instantlyCampaignId || campaign.instantly_campaign_id || ''}
                instantlyName={campaign.name}
                onBound={(id) => router.replace(`/sales/outbound/editor/${encodeURIComponent(id)}`)}
              />
            </div>
          ) : null}
          {tab === 'editor' && sequence ? (
            <div
              className={cn(
                'mx-auto w-full px-4 pb-4 pt-4',
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
              {campaign.copy_status === 'live' ? (
                <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  Compass copy. Instantly may differ until you push copy.
                </p>
              ) : null}
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
                      {previewOn ? (
                        <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-3.5 py-2.5">
                          <SequencePreviewText text={step.subject || '(no subject)'} lead={previewLead} />
                        </div>
                      ) : (
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
                      )}
                      {previewOn ? null : (
                      <Zap className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-300" />
                      )}
                    </div>
                    {subjectLooksBanned(step.subject) ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Soft warn: avoid “quick” subject stems.
                      </p>
                    ) : null}

                    {previewOn ? (
                      <div className="mt-3 min-h-[8rem] rounded-xl border border-stone-200 bg-stone-50/60 px-3.5 py-3">
                        <SequencePreviewText text={stepBodyText(step)} lead={previewLead} />
                      </div>
                    ) : (
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
                      rows={previewDevice === 'mobile' ? 8 : 9}
                      placeholder="Write your email body…"
                      className="mt-3 w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[14px] leading-relaxed text-neutral-800 outline-none focus:border-[#e85d2a]/45"
                    />
                    )}
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
            <div className="mx-auto max-w-lg space-y-4 px-4 py-8">
              <CampaignCopyMeta
                campaign={campaign}
                sequence={sequence}
                unbound={unbound}
                onChange={(patch) => {
                  const nextCampaign = { ...campaign, ...patch }
                  campaignRef.current = nextCampaign
                  setCampaign(nextCampaign)
                  if (sequence) scheduleAutosave()
                }}
              />
              {!unbound && !instantlyUnbound ? (
                <div className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-soft">
                  <h2 className="text-[13px] font-semibold text-neutral-900">Instantly</h2>
                  <div className="mt-3">
                    <CampaignInstantlyPanel
                      campaign={campaign}
                      onCampaignChange={(next) => {
                        const merged = {
                          ...next,
                          sequence_draft: sequenceRef.current ?? next.sequence_draft,
                          name: campaignRef.current?.name ?? next.name,
                          cold_expression:
                            campaignRef.current?.cold_expression ?? next.cold_expression
                        }
                        campaignRef.current = merged
                        setCampaign(merged)
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'experiment' ? (
            <CampaignExperimentPanel
              campaign={campaign}
              unbound={unbound}
              onChange={(patch) => {
                const nextCampaign = { ...campaign, ...patch }
                campaignRef.current = nextCampaign
                setCampaign(nextCampaign)
                if (sequence) scheduleAutosave()
              }}
              onChallengerSpawned={(id) => {
                if (onChallengerSpawned) onChallengerSpawned(id)
                else if (typeof window !== 'undefined') {
                  window.location.href = `/sales/pipeline/${id}`
                }
              }}
            />
          ) : null}

          {tab === 'analytics' ? (
            <SequenceAnalyticsPanel
              instantlyCampaignId={campaign.instantly_campaign_id}
              onOpenSettings={() => setTab('settings')}
            />
          ) : null}
          </div>
          )}

          {tab === 'editor' && sequence ? (
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
                      title={previewOn ? 'Edit tokens' : 'Preview delivered email'}
                      aria-label={previewOn ? 'Edit tokens' : 'Preview delivered email'}
                      aria-pressed={previewOn}
                      onClick={() => {
                        setPreviewOn((v) => {
                          const next = !v
                          if (next) {
                            setPreviewLead((current) => {
                              if (current) return current
                              const leads = loadedLeadsRef.current
                              return leads.find((row) => row.opener?.trim()) || leads[0] || null
                            })
                          }
                          return next
                        })
                      }}
                      className={cn(
                        'rounded-xl p-1.5 text-neutral-400 transition hover:bg-stone-50 hover:text-neutral-700',
                        previewOn && 'bg-[#e85d2a]/10 text-[#c2410c]'
                      )}
                    >
                      {previewOn ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
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
        {tab === 'editor' && sequence ? (
          <aside
            className="relative hidden shrink-0 border-l border-stone-200/80 bg-white lg:flex lg:flex-col"
            style={{ width: componentsWidth }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize components panel"
              onMouseDown={(e) => {
                e.preventDefault()
                resizeDrag.current = { startX: e.clientX, startWidth: componentsWidthRef.current }
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
              className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
            />
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

      {tab === 'editor' && showLeadsPane ? (
        <div
          className="flex shrink-0 flex-col border-t border-stone-200/80 bg-white"
          style={{ height: leadsCollapsed ? 40 : `${leadsHeightVh}vh` }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-stone-100 px-3 py-1.5">
            <button
              type="button"
              aria-label="Resize leads list"
              onMouseDown={(e) => {
                e.preventDefault()
                leadsResize.current = { startY: e.clientY, startVh: leadsHeightRef.current }
                document.body.style.cursor = 'row-resize'
                document.body.style.userSelect = 'none'
                setLeadsCollapsed(false)
              }}
              className="h-4 w-8 shrink-0 cursor-row-resize rounded-full hover:bg-stone-100"
            >
              <span className="mx-auto block h-1 w-8 rounded-full bg-stone-300" />
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Campaign leads
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setLeadsCollapsed(false)
                  setLeadsHeightVh(58)
                }}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-500 hover:bg-stone-50 hover:text-neutral-800"
              >
                Expand
              </button>
              <button
                type="button"
                aria-label={leadsCollapsed ? 'Show leads' : 'Collapse leads'}
                onClick={() => setLeadsCollapsed((v) => !v)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-stone-50 hover:text-neutral-700"
              >
                <ChevronDown className={cn('size-4 transition', leadsCollapsed && 'rotate-180')} />
              </button>
            </div>
          </div>
          {leadsCollapsed ? null : (
            <CampaignLeadsPane
              className="min-h-0 flex-1 overflow-hidden"
              pipelineCampaignId={instantlyUnbound ? null : campaignId || campaign.id}
              instantlyCampaignId={campaign.instantly_campaign_id || instantlyCampaignId}
              onLeadSelect={setPreviewLead}
              onLeadsLoaded={(leads) => {
                loadedLeadsRef.current = leads
                if (!previewOn) return
                setPreviewLead((current) => {
                  if (current && leads.some((row) => row.id === current.id)) return current
                  return leads.find((row) => row.opener?.trim()) || leads[0] || null
                })
              }}
            />
          )}
        </div>
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
