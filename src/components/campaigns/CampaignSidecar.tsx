'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import {
  deleteCampaign,
  getCampaignDetail,
  replaceCampaignMilestones,
  updateCampaign,
  type CampaignPatch
} from '@/lib/campaigns-client'
import {
  CAMPAIGN_COLORS,
  CAMPAIGN_HEALTHS,
  CAMPAIGN_STATUSES,
  campaignHealthLabel,
  campaignStatusLabel,
  experimentFactorLabel,
  experimentStatusLabel,
  formatCampaignDate,
  type CompassCampaign,
  type CompassCampaignActivity,
  type CompassCampaignMilestone
} from '@/lib/campaigns'
import { copyStatusLabel, ctaFromSequence, previewExpression } from '@/lib/outbound-copy'
import {
  forkTemplateIntoSequence,
  listLibraryItems
} from '@/lib/outbound-library-client'
import type { OutboundTemplate } from '@/lib/outbound-copy'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'

const SIDECAR_WIDTH_KEY = 'compass.pipeline.sidecarWidth.v1'
const SIDECAR_WIDTH_DEFAULT = 440
const SIDECAR_WIDTH_MIN = 360
const SIDECAR_WIDTH_MAX = 720

function clampSidecarWidth(value: number): number {
  return Math.min(SIDECAR_WIDTH_MAX, Math.max(SIDECAR_WIDTH_MIN, Math.round(value)))
}

function readStoredSidecarWidth(): number {
  if (typeof window === 'undefined') return SIDECAR_WIDTH_DEFAULT
  try {
    const raw = window.localStorage.getItem(SIDECAR_WIDTH_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? clampSidecarWidth(n) : SIDECAR_WIDTH_DEFAULT
  } catch {
    return SIDECAR_WIDTH_DEFAULT
  }
}

export function CampaignSidecar({
  campaignId,
  onClose,
  onUpdated,
  onDeleted,
  variant = 'sidecar'
}: {
  campaignId: string
  onClose?: () => void
  onUpdated: (campaign?: CompassCampaign) => void
  onDeleted?: () => void
  variant?: 'sidecar' | 'page'
}) {
  const router = useRouter()
  const isPage = variant === 'page'
  const detailHref = `/sales/pipeline/${campaignId}`
  const [width, setWidth] = useState(SIDECAR_WIDTH_DEFAULT)
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [activity, setActivity] = useState<CompassCampaignActivity[]>([])
  const [favorited, setFavorited] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [openSections, setOpenSections] = useState({
    properties: true,
    copy: true,
    experiment: true,
    milestones: true,
    progress: true,
    activity: true
  })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTab, setEditorTab] = useState<
    'analytics' | 'editor' | 'experiment' | 'archive' | 'settings'
  >('editor')
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('planned')
  const [priority, setPriority] = useState(0)
  const [health, setHealth] = useState('no_updates')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [summary, setSummary] = useState('')
  const [ownerLabel, setOwnerLabel] = useState('')
  const [color, setColor] = useState('#94a3b8')
  const [labelsText, setLabelsText] = useState('')
  const [milestones, setMilestones] = useState<
    Array<{ id?: string; title: string; description: string; target_date: string; completed: boolean }>
  >([])

  async function hydrate(id: string) {
    try {
      const detail = await getCampaignDetail(id)
      if (!detail) {
        setError('not_found')
        setCampaign(null)
        return
      }
      setError(null)
      setCampaign(detail.campaign)
      setActivity(detail.activity)
      setName(detail.campaign.name)
      setStatus(detail.campaign.status)
      setPriority(detail.campaign.priority)
      setHealth(detail.campaign.health)
      setStartDate(detail.campaign.start_date ?? '')
      setEndDate(detail.campaign.end_date ?? '')
      setSummary(detail.campaign.summary ?? '')
      setOwnerLabel(detail.campaign.owner_label ?? '')
      setColor(detail.campaign.color || '#94a3b8')
      setLabelsText((detail.campaign.labels ?? []).join(', '))
      setMilestones(
        detail.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? '',
          target_date: m.target_date ?? '',
          completed: m.completed
        }))
      )
    } catch {
      setError('not_found')
      setCampaign(null)
    }
  }

  useEffect(() => {
    void hydrate(campaignId)
    setShowAllActivity(false)
    setMenuOpen(false)
    setEditorOpen(false)
    setEditorTab('editor')
  }, [campaignId])

  useEffect(() => {
    if (isPage) return
    setWidth(readStoredSidecarWidth())
  }, [isPage])

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isPage) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      resizeRef.current = { startX: e.clientX, startWidth: width }
      setResizing(true)
    },
    [isPage, width]
  )

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current
    if (!drag) return
    // Dragging the left edge: move left = wider.
    const next = clampSidecarWidth(drag.startWidth + (drag.startX - e.clientX))
    setWidth(next)
  }, [])

  const onResizePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    resizeRef.current = null
    setResizing(false)
    setWidth((current) => {
      try {
        window.localStorage.setItem(SIDECAR_WIDTH_KEY, String(current))
      } catch {
        // ignore quota / private mode
      }
      return current
    })
  }, [])

  const progress = useMemo(() => {
    const scope = milestones.length
    const completed = milestones.filter((m) => m.completed).length
    const started = milestones.filter((m) => m.completed || Boolean(m.target_date)).length
    return { scope, started, completed }
  }, [milestones])

  function saveCampaign(patch: CampaignPatch) {
    void updateCampaign(campaignId, patch)
      .then((updated: CompassCampaign) => {
        void hydrate(campaignId)
        onUpdated(updated)
      })
      .catch(() => setError('not_found'))
  }

  function saveMilestones(
    next: Array<{
      id?: string
      title: string
      description: string
      target_date: string
      completed: boolean
    }>
  ) {
    void replaceCampaignMilestones(
      campaignId,
      next.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description || null,
        target_date: m.target_date || null,
        completed: m.completed
      }))
    )
      .then((rows) => {
        setMilestones(
          rows.map((m: CompassCampaignMilestone) => ({
            id: m.id,
            title: m.title,
            description: m.description ?? '',
            target_date: m.target_date ?? '',
            completed: m.completed
          }))
        )
        onUpdated()
      })
      .catch(() => setError('not_found'))
  }

  const visibleActivity = showAllActivity ? activity : activity.slice(0, 5)

  return (
    <>
    <aside
      className={
        isPage
          ? 'relative flex min-h-0 w-full flex-1 flex-col bg-[#f7f8f9]'
          : `relative flex h-full shrink-0 flex-col border-l border-neutral-200 bg-[#f7f8f9] ${
              resizing ? 'select-none' : ''
            }`
      }
      style={isPage ? undefined : { width, maxWidth: width }}
    >
      {!isPage ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize campaign panel"
          aria-valuemin={SIDECAR_WIDTH_MIN}
          aria-valuemax={SIDECAR_WIDTH_MAX}
          aria-valuenow={width}
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          className="group absolute inset-y-0 -left-1 z-20 w-2.5 cursor-col-resize touch-none"
        >
          <span
            className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition ${
              resizing ? 'bg-[#e85d2a]' : 'bg-transparent group-hover:bg-neutral-300'
            }`}
          />
          <span
            className={`absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition ${
              resizing
                ? 'bg-[#e85d2a]'
                : 'bg-neutral-300/90 group-hover:bg-neutral-400'
            }`}
          />
        </div>
      ) : null}
      <div className="flex items-start gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        {isPage ? (
          <Link
            href="/sales/pipeline"
            className="mt-0.5 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Back to Campaign Planner"
            title="Back to planner"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
        ) : null}
        <span
          className="mt-1 h-4 w-4 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (campaign && name.trim() && name.trim() !== campaign.name) {
                saveCampaign({ name: name.trim() })
              }
            }}
            className="w-full bg-transparent text-[15px] font-semibold text-neutral-900 outline-none"
          />
          <p className="mt-0.5 text-xs text-neutral-500">
            {campaignStatusLabel(status)}
            {startDate && endDate
              ? ` · ${formatCampaignDate(startDate)} → ${formatCampaignDate(endDate)}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFavorited((v) => !v)}
          className={`rounded-md p-1.5 hover:bg-neutral-100 ${
            favorited ? 'text-amber-500' : 'text-neutral-400'
          }`}
          aria-label="Favorite"
          title="Favorite"
        >
          ★
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
            aria-label="More"
          >
            ···
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg">
              {!isPage ? (
                <Link
                  href={detailHref}
                  className="block w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Open campaign page
                </Link>
              ) : null}
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                onClick={() => {
                  void navigator.clipboard?.writeText(name)
                  setMenuOpen(false)
                }}
              >
                Copy name
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                onClick={() => {
                  void deleteCampaign(campaignId).then(() => {
                    onDeleted?.()
                    if (isPage) router.push('/sales/pipeline')
                  })
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
        {!isPage ? (
          <>
            <Link
              href={detailHref}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              aria-label="Open campaign page"
              title="Open campaign page"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              aria-label="Close details"
              title="Close"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

      <div
        className={
          isPage
            ? 'min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-6'
            : 'min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5'
        }
      >
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        {!campaign ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            Loading…
          </div>
        ) : (
          <>
            <Section
              title="Properties"
              open={openSections.properties}
              onToggle={() =>
                setOpenSections((prev) => ({ ...prev, properties: !prev.properties }))
              }
            >
              <dl className="space-y-2.5 text-sm">
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value)
                      saveCampaign({ status: e.target.value })
                    }}
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  >
                    {CAMPAIGN_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {campaignStatusLabel(value)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setPriority(next)
                      saveCampaign({ priority: next })
                    }}
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value={0}>No priority</option>
                    <option value={1}>Urgent</option>
                    <option value={2}>High</option>
                    <option value={3}>Medium</option>
                    <option value={4}>Low</option>
                  </select>
                </Field>
                <Field label="Health">
                  <select
                    value={health}
                    onChange={(e) => {
                      setHealth(e.target.value)
                      saveCampaign({ health: e.target.value })
                    }}
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  >
                    {CAMPAIGN_HEALTHS.map((value) => (
                      <option key={value} value={value}>
                        {campaignHealthLabel(value)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Lead">
                  <input
                    value={ownerLabel}
                    onChange={(e) => setOwnerLabel(e.target.value)}
                    onBlur={() => saveCampaign({ owner_label: ownerLabel.trim() || null })}
                    placeholder="Add lead"
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Members">
                  <div className="rounded-md border border-dashed border-neutral-200 px-2 py-1.5 text-sm text-neutral-400">
                    Add members
                  </div>
                </Field>
                <Field label="Dates">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      onBlur={() =>
                        saveCampaign({
                          start_date: startDate || null,
                          end_date: endDate || null
                        })
                      }
                      className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
                    />
                    <span className="text-neutral-400">→</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      onBlur={() =>
                        saveCampaign({
                          start_date: startDate || null,
                          end_date: endDate || null
                        })
                      }
                      className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
                    />
                  </div>
                </Field>
                <Field label="Team">
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-600">
                    Sales
                  </div>
                </Field>
                <Field label="Labels">
                  <input
                    value={labelsText}
                    onChange={(e) => setLabelsText(e.target.value)}
                    onBlur={() =>
                      saveCampaign({
                        labels: labelsText
                          .split(',')
                          .map((part) => part.trim())
                          .filter(Boolean)
                      })
                    }
                    placeholder="Add label"
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Color">
                  <div className="flex flex-wrap gap-1.5">
                    {CAMPAIGN_COLORS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setColor(value)
                          saveCampaign({ color: value })
                        }}
                        className={`h-5 w-5 rounded-full ring-offset-1 ${
                          color === value ? 'ring-2 ring-neutral-800' : 'ring-1 ring-black/10'
                        }`}
                        style={{ background: value }}
                        aria-label={`Color ${value}`}
                      />
                    ))}
                  </div>
                </Field>
                <Field label="Summary">
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    onBlur={() => saveCampaign({ summary: summary.trim() || null })}
                    rows={3}
                    placeholder="What is this campaign aiming to do?"
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </Field>
              </dl>
            </Section>

            <Section
              title="Copy"
              open={openSections.copy}
              onToggle={() => setOpenSections((prev) => ({ ...prev, copy: !prev.copy }))}
            >
              {(campaign.copy_status && campaign.copy_status !== 'none') ||
              campaign.offer_key ||
              campaign.cold_expression ||
              campaign.sequence_draft ? (
                <div className="space-y-2.5 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {campaign.offer_key ? (
                      <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-[#c2410c]">
                        {campaign.offer_key}
                      </span>
                    ) : null}
                    {campaign.structure_id ? (
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                        {campaign.structure_id}
                      </span>
                    ) : null}
                    {(campaign.vertical_tags ?? []).map((tag) => (
                      <span
                        key={`v-${tag}`}
                        className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600"
                      >
                        {tag}
                      </span>
                    ))}
                    {(campaign.location_tags ?? []).map((tag) => (
                      <span
                        key={`l-${tag}`}
                        className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                      {copyStatusLabel(campaign.copy_status || 'none')}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-neutral-600">
                    {previewExpression(campaign.cold_expression, 200) ||
                      'No locked cold expression yet.'}
                  </p>
                  {ctaFromSequence(campaign.sequence_draft) ? (
                    <p className="text-[11px] text-neutral-500">
                      Email 1 CTA: {ctaFromSequence(campaign.sequence_draft)}
                    </p>
                  ) : null}
                  {campaign.instantly_campaign_id ? (
                    <p className="text-[11px] text-neutral-500">
                      Instantly: {campaign.instantly_campaign_id}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorTab('editor')
                        setEditorOpen(true)
                      }}
                      className="rounded-md bg-[#e85d2a] px-2.5 py-1.5 text-[12px] font-semibold text-white"
                    >
                      Open editor
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-neutral-700"
                      onClick={() => {
                        void listLibraryItems<OutboundTemplate>('templates').then(async (templates) => {
                          const options = templates
                            .map((t) => `${t.id} - ${t.name}`)
                            .join('\n')
                          const pick = window.prompt(
                            `Attach template id:\n${options}`,
                            templates[0]?.id ?? ''
                          )
                          if (!pick) return
                          try {
                            const forked = await forkTemplateIntoSequence(pick)
                            if (!forked) {
                              window.alert('Template not found')
                              return
                            }
                            saveCampaign({
                              sequence_draft: forked,
                              structure_id: forked.structure_id,
                              offer_key: forked.offer_key ?? campaign.offer_key ?? null,
                              copy_status: 'draft'
                            })
                          } catch {
                            window.alert('Template not found')
                          }
                        })
                      }}
                    >
                      Attach template
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs text-neutral-500">
                  <p>No copy attached yet. Compose a sequence or attach a template.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorTab('editor')
                        setEditorOpen(true)
                      }}
                      className="rounded-md bg-[#e85d2a] px-2.5 py-1.5 text-[12px] font-semibold text-white"
                    >
                      Add copy
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-neutral-700"
                      onClick={() => {
                        void listLibraryItems<OutboundTemplate>('templates').then(async (templates) => {
                          const options = templates
                            .map((t) => `${t.id} - ${t.name}`)
                            .join('\n')
                          const pick = window.prompt(
                            `Attach template id:\n${options}`,
                            templates[0]?.id ?? ''
                          )
                          if (!pick) return
                          try {
                            const forked = await forkTemplateIntoSequence(pick)
                            if (!forked) {
                              window.alert('Template not found')
                              return
                            }
                            saveCampaign({
                              sequence_draft: forked,
                              structure_id: forked.structure_id,
                              offer_key: forked.offer_key ?? campaign.offer_key ?? null,
                              copy_status: 'draft'
                            })
                          } catch {
                            window.alert('Template not found')
                          }
                        })
                      }}
                    >
                      Attach template
                    </button>
                  </div>
                </div>
              )}
            </Section>

            <Section
              title="Experiment"
              open={openSections.experiment}
              onToggle={() =>
                setOpenSections((prev) => ({ ...prev, experiment: !prev.experiment }))
              }
            >
              <div className="space-y-3 text-sm">
                {campaign.experiment_status && campaign.experiment_status !== 'none' ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-[#c2410c]">
                      {experimentStatusLabel(campaign.experiment_status)}
                    </span>
                    {campaign.experiment_role && campaign.experiment_role !== 'none' ? (
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                        {campaign.experiment_role}
                      </span>
                    ) : null}
                    {campaign.experiment_factor && campaign.experiment_factor !== 'none' ? (
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                        {experimentFactorLabel(campaign.experiment_factor)}
                      </span>
                    ) : null}
                    {campaign.cta_type ? (
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                        {String(campaign.cta_type).replaceAll('_', ' ')}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">No experiment set yet.</p>
                )}
                <p className="text-xs leading-relaxed text-neutral-600">
                  {campaign.hypothesis || 'Open the editor Experiment tab to set a hypothesis and spawn a challenger.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditorTab('experiment')
                    setEditorOpen(true)
                  }}
                  className="rounded-md bg-[#e85d2a] px-2.5 py-1.5 text-[12px] font-semibold text-white"
                >
                  Open experiment
                </button>
              </div>
            </Section>

            <Section
              title="Milestones"
              open={openSections.milestones}
              onToggle={() =>
                setOpenSections((prev) => ({ ...prev, milestones: !prev.milestones }))
              }
              action={
                <button
                  type="button"
                  onClick={() =>
                    setMilestones((rows) => [
                      ...rows,
                      { title: '', description: '', target_date: '', completed: false }
                    ])
                  }
                  className="rounded-md px-1.5 py-0.5 text-sm text-neutral-500 hover:bg-neutral-100"
                >
                  +
                </button>
              }
            >
              {milestones.length === 0 ? (
                <p className="text-xs leading-relaxed text-neutral-500">
                  Add milestones to organize work within your campaign and break it into sequence
                  stages.
                </p>
              ) : (
                <ul className="space-y-2">
                  {milestones.map((milestone, index) => (
                    <li
                      key={milestone.id ?? `new-${index}`}
                      className="rounded-lg border border-neutral-100 p-2"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={milestone.completed}
                          onChange={(e) => {
                            const next = milestones.map((row, i) =>
                              i === index ? { ...row, completed: e.target.checked } : row
                            )
                            setMilestones(next)
                            saveMilestones(next)
                          }}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            value={milestone.title}
                            placeholder="Milestone title"
                            onChange={(e) =>
                              setMilestones((rows) =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, title: e.target.value } : row
                                )
                              )
                            }
                            onBlur={() => saveMilestones(milestones)}
                            className="w-full bg-transparent text-sm font-medium outline-none"
                          />
                          <input
                            type="date"
                            value={milestone.target_date}
                            onChange={(e) =>
                              setMilestones((rows) =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, target_date: e.target.value } : row
                                )
                              )
                            }
                            onBlur={() => saveMilestones(milestones)}
                            className="w-full rounded border border-neutral-200 px-1.5 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="Progress"
              open={openSections.progress}
              onToggle={() => setOpenSections((prev) => ({ ...prev, progress: !prev.progress }))}
            >
              <div className="mb-3 flex gap-4 text-xs text-neutral-600">
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-neutral-400" />
                  Scope: {progress.scope}
                </span>
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Started: {progress.started}
                </span>
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />
                  Completed: {progress.completed}
                </span>
              </div>
              <ProgressChart
                start={startDate}
                end={endDate}
                scope={progress.scope}
                completed={progress.completed}
              />
              <p className="mt-2 text-[11px] text-neutral-400">
                {formatCampaignDate(startDate)} → {formatCampaignDate(endDate)}
              </p>
            </Section>

            <Section
              title="Activity"
              open={openSections.activity}
              onToggle={() => setOpenSections((prev) => ({ ...prev, activity: !prev.activity }))}
              action={
                activity.length > 5 ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
                    onClick={() => setShowAllActivity((v) => !v)}
                  >
                    {showAllActivity ? 'Show less' : 'See all'}
                  </button>
                ) : null
              }
            >
              {visibleActivity.length === 0 ? (
                <p className="text-xs text-neutral-500">No activity yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {visibleActivity.map((item) => (
                    <li key={item.id} className="flex gap-2 text-xs text-neutral-600">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600">
                        {(item.actor || 'O').slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div>
                          <span className="font-medium text-neutral-800">{item.actor}</span>{' '}
                          {item.body.replace(/^[A-Z][^ ]* /, '')}
                        </div>
                        <div className="text-neutral-400">
                          {new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </aside>
      {editorOpen ? (
        <SequenceEditor
          campaignId={campaignId}
          variant="overlay"
          initialTab={editorTab}
          onClose={() => {
            setEditorOpen(false)
            setEditorTab('editor')
            void hydrate(campaignId).then(() => onUpdated())
          }}
          onChallengerSpawned={(id) => {
            setEditorOpen(false)
            onUpdated()
            router.push(`/sales/pipeline/${id}`)
          }}
        />
      ) : null}
    </>
  )
}

function Section({
  title,
  open,
  onToggle,
  children,
  action
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400"
        >
          <span className="text-[10px]">{open ? '▼' : '▶'}</span>
          {title}
        </button>
        {action}
      </div>
      {open ? children : null}
    </section>
  )
}

function Field({
  label,
  children,
  layout = 'inline'
}: {
  label: string
  children: ReactNode
  layout?: 'inline' | 'stack'
}) {
  if (layout === 'stack') {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-neutral-500">{label}</span>
        {children}
      </label>
    )
  }
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-2.5">
      <dt className="pt-2 text-xs text-neutral-500">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function ProgressChart({
  start,
  end,
  scope,
  completed
}: {
  start: string
  end: string
  scope: number
  completed: number
}) {
  const pct = scope > 0 ? Math.min(100, Math.round((completed / scope) * 100)) : 0
  const y = 36 - pct * 0.28
  return (
    <div className="relative h-28 overflow-hidden rounded-lg bg-neutral-50 ring-1 ring-neutral-100">
      <svg viewBox="0 0 100 40" className="h-full w-full" preserveAspectRatio="none">
        <line x1="0" y1="8" x2="100" y2="8" stroke="#d4d4d8" strokeWidth="0.5" strokeDasharray="2 2" />
        <line x1="0" y1="8" x2="100" y2="36" stroke="#93c5fd" strokeWidth="1" opacity="0.7" />
        <polygon
          fill="rgba(139,92,246,0.12)"
          points={`0,40 0,${y} 55,${(y + 36) / 2} 100,${18 - pct * 0.05} 100,40`}
        />
        <polyline
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="1.4"
          points={`0,${y} 55,${(y + 28) / 2} 100,${16 - pct * 0.04}`}
        />
        <circle cx="55" cy={(y + 28) / 2} r="1.4" fill="#8b5cf6" />
      </svg>
      {!start || !end ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-400">
          Set dates to chart progress
        </div>
      ) : null}
    </div>
  )
}
