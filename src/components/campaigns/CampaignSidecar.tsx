'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
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

type DetailPayload = {
  campaign: CompassCampaign
  milestones: CompassCampaignMilestone[]
  activity: CompassCampaignActivity[]
}

export function CampaignSidecar({
  campaignId,
  onClose,
  onUpdated
}: {
  campaignId: string
  onClose: () => void
  onUpdated: (campaign: CompassCampaign) => void
}) {
  const [data, setData] = useState<DetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('planned')
  const [priority, setPriority] = useState(0)
  const [health, setHealth] = useState('no_updates')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [summary, setSummary] = useState('')
  const [ownerLabel, setOwnerLabel] = useState('')
  const [color, setColor] = useState('#94a3b8')
  const [milestones, setMilestones] = useState<
    Array<{ id?: string; title: string; description: string; target_date: string; completed: boolean }>
  >([])

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    void fetch(`/api/campaigns/${campaignId}`, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'fetch_failed')
        return body as DetailPayload
      })
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setName(payload.campaign.name)
        setStatus(payload.campaign.status)
        setPriority(payload.campaign.priority)
        setHealth(payload.campaign.health)
        setStartDate(payload.campaign.start_date ?? '')
        setEndDate(payload.campaign.end_date ?? '')
        setSummary(payload.campaign.summary ?? '')
        setOwnerLabel(payload.campaign.owner_label ?? '')
        setColor(payload.campaign.color || '#94a3b8')
        setMilestones(
          payload.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description ?? '',
            target_date: m.target_date ?? '',
            completed: m.completed
          }))
        )
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  const progress = useMemo(() => {
    const scope = milestones.length
    const completed = milestones.filter((m) => m.completed).length
    const started = milestones.filter((m) => m.completed || m.target_date).length
    return { scope, started, completed }
  }, [milestones])

  async function saveCampaign(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(patch)
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || body.error || 'update_failed')
      const campaign = body as CompassCampaign
      setData((prev) => (prev ? { ...prev, campaign } : prev))
      onUpdated(campaign)
      // Refresh activity
      const detail = await fetch(`/api/campaigns/${campaignId}`, {
        headers: { Accept: 'application/json' }
      })
      if (detail.ok) {
        const payload = (await detail.json()) as DetailPayload
        setData(payload)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'update_failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveMilestones(
    next: Array<{ id?: string; title: string; description: string; target_date: string; completed: boolean }>
  ) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/milestones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          milestones: next.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description || null,
            target_date: m.target_date || null,
            completed: m.completed
          }))
        })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.detail || body.error || 'update_failed')
      const rows = body.milestones as CompassCampaignMilestone[]
      setMilestones(
        rows.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? '',
          target_date: m.target_date ?? '',
          completed: m.completed
        }))
      )
      const detail = await fetch(`/api/campaigns/${campaignId}`, {
        headers: { Accept: 'application/json' }
      })
      if (detail.ok) setData((await detail.json()) as DetailPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'update_failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="flex h-full w-full max-w-[360px] flex-col border-l border-neutral-200 bg-[#f7f7f8]">
      <div className="flex items-start gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        <span
          className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (data && name.trim() && name.trim() !== data.campaign.name) {
                void saveCampaign({ name: name.trim() })
              }
            }}
            className="w-full bg-transparent text-[15px] font-semibold text-neutral-900 outline-none"
          />
          <p className="mt-0.5 text-xs text-neutral-500">Campaign details</p>
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

        {!data ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            Loading…
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Properties
              </div>
              <dl className="space-y-2.5 text-sm">
                <Field label="Status">
                  <select
                    value={status}
                    disabled={saving}
                    onChange={(e) => {
                      setStatus(e.target.value)
                      void saveCampaign({ status: e.target.value })
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
                    disabled={saving}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setPriority(next)
                      void saveCampaign({ priority: next })
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
                    disabled={saving}
                    onChange={(e) => {
                      setHealth(e.target.value)
                      void saveCampaign({ health: e.target.value })
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
                    disabled={saving}
                    onChange={(e) => setOwnerLabel(e.target.value)}
                    onBlur={() => void saveCampaign({ owner_label: ownerLabel.trim() || null })}
                    placeholder="Add lead"
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Dates">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={startDate}
                      disabled={saving}
                      onChange={(e) => setStartDate(e.target.value)}
                      onBlur={() =>
                        void saveCampaign({
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
                      disabled={saving}
                      onChange={(e) => setEndDate(e.target.value)}
                      onBlur={() =>
                        void saveCampaign({
                          start_date: startDate || null,
                          end_date: endDate || null
                        })
                      }
                      className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
                    />
                  </div>
                </Field>
                <Field label="Color">
                  <div className="flex flex-wrap gap-1.5">
                    {CAMPAIGN_COLORS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setColor(value)
                          void saveCampaign({ color: value })
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
                    disabled={saving}
                    onChange={(e) => setSummary(e.target.value)}
                    onBlur={() => void saveCampaign({ summary: summary.trim() || null })}
                    rows={3}
                    placeholder="What is this campaign aiming to do?"
                    className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </Field>
              </dl>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Milestones
                </div>
                <button
                  type="button"
                  disabled={saving}
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
              </div>
              {milestones.length === 0 ? (
                <p className="text-xs leading-relaxed text-neutral-500">
                  Add milestones to organize work within your campaign and break it into sequence
                  stages.
                </p>
              ) : (
                <ul className="space-y-2">
                  {milestones.map((milestone, index) => (
                    <li key={milestone.id ?? `new-${index}`} className="rounded-lg border border-neutral-100 p-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={milestone.completed}
                          onChange={(e) => {
                            const next = milestones.map((row, i) =>
                              i === index ? { ...row, completed: e.target.checked } : row
                            )
                            setMilestones(next)
                            void saveMilestones(next)
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
                            onBlur={() => void saveMilestones(milestones)}
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
                            onBlur={() => void saveMilestones(milestones)}
                            className="w-full rounded border border-neutral-200 px-1.5 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Progress
              </div>
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
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Activity
              </div>
              {(data.activity ?? []).length === 0 ? (
                <p className="text-xs text-neutral-500">No activity yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.activity.map((item) => (
                    <li key={item.id} className="text-xs text-neutral-600">
                      <div className="font-medium text-neutral-800">{item.actor}</div>
                      <div>{item.body}</div>
                      <div className="text-neutral-400">
                        {new Date(item.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
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
  return (
    <div className="relative h-24 overflow-hidden rounded-lg bg-neutral-50 ring-1 ring-neutral-100">
      <svg viewBox="0 0 100 40" className="h-full w-full" preserveAspectRatio="none">
        <line x1="0" y1="8" x2="100" y2="8" stroke="#d4d4d8" strokeWidth="0.6" />
        <polyline
          fill="none"
          stroke="#a78bfa"
          strokeWidth="1.4"
          strokeDasharray="2 1.5"
          points={`0,${36 - pct * 0.28} 100,${8 + (100 - pct) * 0.08}`}
        />
        <polyline
          fill="rgba(167,139,250,0.15)"
          stroke="#8b5cf6"
          strokeWidth="1.2"
          points={`0,40 0,${36 - pct * 0.28} 55,${28 - pct * 0.18} 100,${18 - pct * 0.1} 100,40`}
        />
      </svg>
      {!start || !end ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-400">
          Set dates to chart progress
        </div>
      ) : null}
    </div>
  )
}
