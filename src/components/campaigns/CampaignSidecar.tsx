'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  deleteLocalCampaign,
  getLocalCampaignDetail,
  replaceLocalMilestones,
  updateLocalCampaign
} from '@/lib/campaign-local-store'
import {
  CAMPAIGN_COLORS,
  CAMPAIGN_HEALTHS,
  CAMPAIGN_STATUSES,
  campaignStatusLabel,
  formatCampaignDate,
  type CompassCampaign,
  type CompassCampaignActivity,
  type CompassCampaignMilestone
} from '@/lib/campaigns'

export function CampaignSidecar({
  campaignId,
  onClose,
  onUpdated,
  onDeleted
}: {
  campaignId: string
  onClose: () => void
  onUpdated: (campaign?: CompassCampaign) => void
  onDeleted?: () => void
}) {
  const [campaign, setCampaign] = useState<CompassCampaign | null>(null)
  const [activity, setActivity] = useState<CompassCampaignActivity[]>([])
  const [favorited, setFavorited] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [openSections, setOpenSections] = useState({
    properties: true,
    milestones: true,
    progress: true,
    activity: true
  })
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

  function hydrate(id: string) {
    const detail = getLocalCampaignDetail(id)
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
  }

  useEffect(() => {
    hydrate(campaignId)
    setShowAllActivity(false)
    setMenuOpen(false)
  }, [campaignId])

  const progress = useMemo(() => {
    const scope = milestones.length
    const completed = milestones.filter((m) => m.completed).length
    const started = milestones.filter((m) => m.completed || Boolean(m.target_date)).length
    return { scope, started, completed }
  }, [milestones])

  function saveCampaign(patch: Parameters<typeof updateLocalCampaign>[1]) {
    const updated = updateLocalCampaign(campaignId, patch)
    if (!updated) {
      setError('not_found')
      return
    }
    hydrate(campaignId)
    onUpdated(updated)
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
    const rows = replaceLocalMilestones(
      campaignId,
      next.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description || null,
        target_date: m.target_date || null,
        completed: m.completed
      }))
    )
    setMilestones(
      rows.map((m: CompassCampaignMilestone) => ({
        id: m.id,
        title: m.title,
        description: m.description ?? '',
        target_date: m.target_date ?? '',
        completed: m.completed
      }))
    )
    hydrate(campaignId)
    onUpdated()
  }

  const visibleActivity = showAllActivity ? activity : activity.slice(0, 5)

  return (
    <aside className="flex h-full w-full max-w-[380px] shrink-0 flex-col border-l border-neutral-200 bg-[#f7f8f9]">
      <div className="flex items-start gap-2 border-b border-neutral-200 bg-white px-4 py-3">
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
            <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg">
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
                  deleteLocalCampaign(campaignId)
                  onDeleted?.()
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          aria-label="Close details"
          title="Close"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
                        {value.replaceAll('_', ' ')}
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
    <section className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2">
      <dt className="pt-1.5 text-xs text-neutral-500">{label}</dt>
      <dd>{children}</dd>
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
