'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  KanbanBoard,
  type KanbanColumn,
  type KanbanTask,
} from '@/components/ui/kanban-board'
import { WaveAddCampaign } from '@/components/outbound/WaveAddCampaign'
import { WaveCampaignCard } from '@/components/outbound/WaveCampaignCard'
import { CAMPAIGNS_QUERY_KEY, updateCampaign } from '@/lib/campaigns-client'
import {
  OFFER_WAVE_COLUMN_LABELS,
  dateOnlyInZone,
  type CompassCampaign,
  type OfferWaveColumnId,
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { useCachedJson } from '@/lib/use-cached-json'
import {
  INSTANTLY_CAMPAIGN_APP,
  buildLiveDesk,
  formatWaveDate,
  glanceLabel,
  groupCampaignsByWave,
  splitMorningBrief,
  splitNextQueue,
  sydneyDateOnly,
  upcomingSendForecast,
} from '@/lib/wave-desk'
import { cn } from '@/lib/utils'
import { FolioFolders } from '@/components/folio/FolioPrimitives'
import { ArrowUpRight } from 'lucide-react'

type CampaignsPayload = { campaigns: CompassCampaign[] }
type OutboundBoardPayload = {
  live: OutboundBoardCampaign[]
  history?: OutboundBoardCampaign[]
}
type WaveDeskPayload = {
  recontactReady: number
  actionsError?: string | null
  briefsError?: string | null
  thisWeekStart: string
  actions: Array<{
    id: string
    title: string
    kind: string
    detail: string | null
    source: string
    status: string
    week_start: string | null
    created_at?: string
  }>
  briefs: Array<{
    id: string
    reviewState?: 'current' | 'stale' | 'unreviewed' | 'missing'
    generated_at: string
    recommendation: string | null
  }>
}

function tradeCity(campaign: CompassCampaign): { trade: string; city: string } {
  return {
    trade: (campaign.vertical_tags ?? []).filter(Boolean)[0] || 'Trade',
    city: (campaign.location_tags ?? []).filter(Boolean)[0] || 'City',
  }
}

function campaignToKanbanTask(
  campaign: CompassCampaign,
  column: OfferWaveColumnId | 'parked',
  instantly?: OutboundBoardCampaign,
): KanbanTask {
  const { trade, city } = tradeCity(campaign)
  const goLive = campaign.go_live_at
    ? formatWaveDate(dateOnlyInZone(campaign.go_live_at))
    : formatWaveDate(campaign.start_date)
  const sending =
    instantly?.status === 'live' || instantly?.status === 'launching'
  return {
    id: campaign.id,
    title: campaign.name,
    description:
      (column === 'recommended' ? campaign.wave_rationale : campaign.summary) ||
      campaign.wave_approach ||
      undefined,
    priority: sending
      ? 'high'
      : instantly?.status === 'paused'
        ? 'low'
        : 'medium',
    badge: sending ? 'Sending' : undefined,
    tags: [`${trade} · ${city}`],
    dueDate: goLive || undefined,
    metrics: [
      ...(instantly ? [{ label: 'Replies', value: instantly.replyCount }] : []),
      ...(instantly?.remaining != null
        ? [{ label: 'Remaining', value: instantly.remaining }]
        : campaign.wave_list_size != null
          ? [{ label: 'List size', value: campaign.wave_list_size }]
          : []),
    ],
    href: `/sales/outbound/editor/${encodeURIComponent(campaign.id)}`,
    externalHref: instantly
      ? INSTANTLY_CAMPAIGN_APP(instantly.id)
      : campaign.instantly_campaign_id
        ? INSTANTLY_CAMPAIGN_APP(campaign.instantly_campaign_id)
        : undefined,
  }
}

function WaveSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading waves">
      <div className="compass-panel space-y-3 p-5">
        <div className="compass-skeleton h-4 w-28" />
        <div className="compass-skeleton h-16 w-full" />
      </div>
      <div className="compass-panel space-y-3 p-5">
        <div className="compass-skeleton h-4 w-24" />
        <div className="compass-skeleton h-28 w-full" />
      </div>
      <div className="compass-panel space-y-3 p-5">
        <div className="compass-skeleton h-4 w-32" />
        <div className="compass-skeleton h-28 w-full" />
      </div>
    </div>
  )
}

export function OfferWavesBoard({ className }: { className?: string }) {
  const campaignsQuery = useCachedJson<CampaignsPayload>(
    CAMPAIGNS_QUERY_KEY,
    '/api/campaigns',
    {
      staleMs: 30_000,
    },
  )
  const boardQuery = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 30_000 },
  )
  const deskQuery = useCachedJson<WaveDeskPayload>(
    '/api/outbound/wave-desk',
    '/api/outbound/wave-desk',
    { staleMs: 30_000 },
  )
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [addToken, setAddToken] = useState(0)

  const instantlyById = useMemo(() => {
    const map = new Map<string, OutboundBoardCampaign>()
    for (const row of [
      ...(boardQuery.data?.live ?? []),
      ...(boardQuery.data?.history ?? []),
    ]) {
      map.set(row.id, row)
    }
    return map
  }, [boardQuery.data])

  const grouped = useMemo(
    () =>
      groupCampaignsByWave(campaignsQuery.data?.campaigns ?? [], instantlyById),
    [campaignsQuery.data, instantlyById],
  )

  const liveDesk = useMemo(
    () =>
      buildLiveDesk({
        liveCampaigns: grouped.live,
        allCampaigns: campaignsQuery.data?.campaigns ?? [],
        instantlyById,
        instantlyRows: boardQuery.data?.live ?? [],
      }),
    [grouped.live, campaignsQuery.data, instantlyById, boardQuery.data],
  )

  const nextSplit = useMemo(
    () => splitNextQueue(grouped.next, sydneyDateOnly()),
    [grouped.next],
  )

  const latestBrief = deskQuery.data?.briefs?.[0]
  const brief = splitMorningBrief(latestBrief?.recommendation)
  const forecast = boardQuery.data && !boardQuery.error ? upcomingSendForecast(boardQuery.data) : null
  const glance = glanceLabel(boardQuery.updatedAt)
  const loading = Boolean(
    campaignsQuery.loading || boardQuery.loading || deskQuery.loading,
  )

  async function markAction(id: string, status: 'done' | 'queued') {
    setActionBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/outbound/wave-desk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('Could not update action')
      void deskQuery.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action update failed')
    } finally {
      setActionBusy(null)
    }
  }

  const openActions = (deskQuery.data?.actions ?? []).filter(
    (action) => action.status !== 'done' && action.status !== 'cancelled',
  )
  const doneActions = (deskQuery.data?.actions ?? []).filter(
    (action) => action.status === 'done',
  )

  const [campaignFolder, setCampaignFolder] = useState('next')
  const [showAllActions, setShowAllActions] = useState(false)
  const [campaignView, setCampaignView] = useState<'folders' | 'board'>(
    'folders',
  )
  const kanbanColumns = useMemo((): KanbanColumn[] => {
    return [
      {
        id: 'recommended',
        title: OFFER_WAVE_COLUMN_LABELS.recommended,
        color: '#f97316',
        emptyText: 'Drop a campaign here.',
        hint: 'Agent-only until you move it to next.',
        tasks: grouped.recommended.map((campaign) =>
          campaignToKanbanTask(
            campaign,
            'recommended',
            campaign.instantly_campaign_id
              ? instantlyById.get(campaign.instantly_campaign_id)
              : undefined,
          ),
        ),
      },
      {
        id: 'next',
        title: OFFER_WAVE_COLUMN_LABELS.next,
        color: '#a8a29e',
        emptyText: 'Drop a campaign here.',
        onAdd: () => setAddToken((value) => value + 1),
        tasks: nextSplit.upcoming.map((campaign) =>
          campaignToKanbanTask(
            campaign,
            'next',
            campaign.instantly_campaign_id
              ? instantlyById.get(campaign.instantly_campaign_id)
              : undefined,
          ),
        ),
      },
      {
        id: 'live',
        title: OFFER_WAVE_COLUMN_LABELS.live,
        color: '#6B8E23',
        emptyText: 'Drop a campaign here.',
        hint: 'Sending now. Activate stays in Instantly.',
        tasks: liveDesk.sending.map((item) => {
          if (item.campaign) {
            return campaignToKanbanTask(
              item.campaign,
              'live',
              item.instantly ?? undefined,
            )
          }
          const instantly = item.instantly
          return {
            id: item.key,
            title: instantly?.name || 'Instantly campaign',
            description: 'Instantly only. Bind it in Compass to move lanes.',
            priority: 'high' as const,
            badge: 'Sending',
            tags: ['Instantly'],
            metrics: instantly
              ? [
                  { label: 'Replies', value: instantly.replyCount },
                  { label: 'Remaining', value: instantly.remaining },
                ]
              : [],
            externalHref: instantly
              ? INSTANTLY_CAMPAIGN_APP(instantly.id)
              : undefined,
            draggable: false,
          }
        }),
      },
      {
        id: 'parked',
        title: 'Parked',
        color: '#78716c',
        emptyText: 'Drop a campaign here.',
        hint: 'Paused in Instantly. Pause stays in Instantly.',
        tasks: liveDesk.parked.map((campaign) =>
          campaignToKanbanTask(
            campaign,
            'parked',
            campaign.instantly_campaign_id
              ? instantlyById.get(campaign.instantly_campaign_id)
              : undefined,
          ),
        ),
      },
    ]
  }, [grouped.recommended, nextSplit.upcoming, liveDesk, instantlyById])

  async function moveTask(
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
  ) {
    if (fromColumnId === toColumnId) return
    if (taskId.startsWith('instantly-')) {
      setError(
        'That campaign lives in Instantly only. Bind it in Compass before moving lanes.',
      )
      return
    }
    if (toColumnId === 'parked') {
      setError('Parked is Instantly paused. Pause stays in Instantly.')
      return
    }
    if (
      toColumnId !== 'recommended' &&
      toColumnId !== 'next' &&
      toColumnId !== 'live'
    )
      return
    setError(null)
    try {
      await updateCampaign(taskId, { wave_lane: toColumnId })
      setNote(`Moved to ${OFFER_WAVE_COLUMN_LABELS[toColumnId]}.`)
      void campaignsQuery.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
    }
  }

  return (
    <div className={cn('folio-outbound space-y-6', className)}>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-neutral-500">
          {glance || 'Activate stays in Instantly.'}
        </p>
        <div className="relative flex flex-wrap items-center justify-end gap-2">
          {note ? <p role="status" className="text-[12px] text-emerald-800">{note}</p> : null}
          {error ? <p role="alert" className="text-[12px] text-red-700">{error}</p> : null}
          <WaveAddCampaign
            openToken={addToken}
            onCreated={() => {
              setNote('Campaign saved to next.')
              void campaignsQuery.reload()
            }}
          />
        </div>
      </section>

      {campaignsQuery.error || boardQuery.error || deskQuery.error ? (
        <p role="alert" className="text-sm text-red-700">
          {campaignsQuery.error ? 'Campaign records could not be refreshed. ' : ''}
          {boardQuery.error ? 'Instantly status and metrics are unavailable. ' : ''}
          {deskQuery.error ? 'Outlook could not be refreshed. ' : ''}
          <button type="button" className="underline" onClick={() => {
            void campaignsQuery.reload(true)
            void boardQuery.reload(true)
            void deskQuery.reload(true)
          }}>Retry</button>
        </p>
      ) : null}

      {brief.headline ? (
        <details className="folio-outbound-brief">
          <summary>
            <span className="folio-caption">{latestBrief?.reviewState === 'current' ? 'Daily brief' : 'Brief history'}</span>
            <strong>{latestBrief?.reviewState === 'current' ? brief.headline : `Previous advice · ${latestBrief?.id ?? 'date unknown'}`}</strong>
          </summary>
          <Card>
            <CardContent className="space-y-3">
              <p className="text-[11px] font-semibold text-neutral-400">
                {latestBrief?.reviewState === 'current' ? 'Current reviewed brief' : 'Historical or unverified advice'} · {latestBrief?.id}
              </p>
              <h3 className="text-balance text-[16px] font-semibold leading-snug text-neutral-900">
                {brief.headline}
              </h3>
              {brief.watches.length ? (
                <details className="folio-brief-details">
                  <summary>
                    Read the supporting notes ({brief.watches.length})
                  </summary>
                  <ul className="space-y-2 text-[13px] leading-relaxed text-neutral-600">
                    {brief.watches.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-[#e85d2a]"
                          aria-hidden
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </details>
      ) : null}

      {loading && !campaignsQuery.data ? (
        <WaveSkeleton />
      ) : (
        <div className="folio-outbound-workspace" data-view={campaignView}>
          <div className="min-w-0">
            <div className="folio-campaign-toolbar">
              <div className="compass-seg" aria-label="Campaign layout">
                <button
                  className={`compass-seg-btn ${campaignView === 'folders' ? 'compass-seg-btn-active' : ''}`}
                  aria-pressed={campaignView === 'folders'}
                  onClick={() => setCampaignView('folders')}
                >
                  Folders
                </button>
                <button
                  className={`compass-seg-btn ${campaignView === 'board' ? 'compass-seg-btn-active' : ''}`}
                  aria-pressed={campaignView === 'board'}
                  onClick={() => setCampaignView('board')}
                >
                  Board
                </button>
              </div>
              {campaignView === 'folders' ? (
                <FolioFolders
                  label="Campaign folders"
                  value={campaignFolder}
                  onChange={setCampaignFolder}
                  items={kanbanColumns.map((c) => ({
                    id: c.id,
                    label:
                      c.id === 'recommended'
                        ? 'Recommended'
                        : c.id === 'next'
                          ? 'Next'
                          : c.id === 'live'
                            ? 'Live'
                            : c.title,
                    count: c.tasks.length,
                  }))}
                />
              ) : null}
            </div>
            {campaignView === 'board' ? (
              <KanbanBoard columns={kanbanColumns.map(column => ({ ...column, onAdd: undefined }))} onMove={moveTask} />
            ) : (
              <>
                <section className="folio-paper folio-campaign-folder">
                  {kanbanColumns
                    .filter((c) => c.id === campaignFolder)
                    .map((column) => (
                      <div key={column.id}>
                        <div className="folio-section-heading">
                          <h2>{column.title}</h2>
                        </div>
                        <p className="folio-campaign-hint">
                          {column.hint ??
                            'Prepare the copy and schedule before moving a campaign live.'}
                        </p>
                        {column.tasks.length ? (
                          <ul className="folio-campaign-list">
                            {column.tasks.map((task) => (
                              <li key={task.id}>
                                <div className="folio-campaign-title">
                                  <div>
                                    {task.href ? (
                                      <Link href={task.href}>{task.title}</Link>
                                    ) : (
                                      <strong>{task.title}</strong>
                                    )}
                                    <p>{task.description}</p>
                                  </div>
                                  {task.badge ? (
                                    <span className="folio-status">
                                      {task.badge}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="folio-campaign-detail">
                                  {task.dueDate ? (
                                    <span>{task.dueDate}</span>
                                  ) : null}
                                  {task.metrics?.map((metric) => (
                                    <span key={metric.label}>
                                      <b>{metric.value}</b> {metric.label}
                                    </span>
                                  ))}
                                </div>
                                <div className="folio-campaign-actions">
                                  {task.href ? (
                                    <Link
                                      className="compass-btn-secondary"
                                      href={task.href}
                                    >
                                      Open campaign <ArrowUpRight size={14} />
                                    </Link>
                                  ) : null}
                                  {task.externalHref ? (
                                    <a
                                      className="compass-btn-ghost"
                                      href={task.externalHref}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {task.externalLabel ??
                                        'Open in Instantly'}{' '}
                                      <ArrowUpRight size={14} />
                                    </a>
                                  ) : null}
                                  {task.draggable !== false ? (
                                    <label>
                                      <span>Status<span className="sr-only"> for {task.title}</span></span>
                                      <select
                                        className="compass-input"
                                        value={column.id}
                                        onChange={(e) =>
                                          void moveTask(
                                            task.id,
                                            column.id,
                                            e.target.value,
                                          )
                                        }
                                      >
                                        {kanbanColumns.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.title}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="folio-quiet">
                            <p>
                              {column.id === 'next'
                                ? 'No campaigns in the next queue. Add a campaign when you are ready.'
                                : column.id === 'live'
                                  ? 'Nothing is sending in Instantly. Review a prepared campaign before activating there.'
                                  : column.id === 'recommended'
                                    ? 'No campaign recommendations to review.'
                                    : 'No paused campaigns.'}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                </section>
              </>
            )}
          </div>

          <aside className="folio-outlook">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Outlook</CardTitle>
                  <p className="mt-1 text-[12px] text-pretty text-neutral-500">
                    What can be retargeted, what is still queued, and the next
                    moves.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="folio-outlook-metrics">
                  <div>
                    <p className="text-[11px] font-medium text-neutral-500">
                      Leads eligible for recontact
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
                      {deskQuery.error ? 'Unavailable' : deskQuery.data?.recontactReady ?? '—'}
                    </p>
                    <p className="mt-1 text-[12px] text-neutral-500">Existing leads meeting the 90-day recontact criteria</p>
                    <Link
                      href="/leads?recontact_ready=1"
                      className="mt-1 inline-block text-[12px] text-[#c2410c] hover:underline"
                    >
                      Open ready leads
                    </Link>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-neutral-500">
                      Leads remaining
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
                      {boardQuery.error ? 'Unavailable' : forecast?.remaining ?? '—'}
                    </p>
                    <p className="mt-1 text-[12px] text-neutral-500">
                      Leads not yet contacted in live and paused campaigns
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-neutral-500">
                      Campaigns sending
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
                      {boardQuery.error ? 'Unavailable' : forecast?.liveCampaigns ?? '—'}
                    </p>
                    <p className="mt-1 text-[12px] text-neutral-500">
                      Sending in Instantly
                    </p>
                  </div>
                </div>

                <div className="border-t border-stone-100 pt-4">
                  <p className="mb-2 text-[13px] font-semibold text-neutral-900">
                    Pipeline actions
                  </p>
                  {deskQuery.error || deskQuery.data?.actionsError ? <p role="alert">Actions unavailable. Try refreshing.</p> : !deskQuery.data ? <p>Loading actions…</p> : openActions.length === 0 && doneActions.length === 0 ? (
                    <p className="text-[12px] text-pretty text-neutral-400">
                      Nothing queued. Morning scan or Add campaign writes the
                      next move here.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {(showAllActions
                        ? openActions
                        : openActions.slice(0, 3)
                      ).map((action) => (
                        <li
                          key={action.id}
                          className="folio-outlook-action"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-neutral-800">
                              {action.title}
                            </p>
                            {action.detail ? (
                              <p className="mt-0.5 text-[12px] text-pretty text-neutral-500">
                                {action.detail}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" size="sm">
                                {action.kind}
                              </Badge>
                              <span className="text-[11px] text-neutral-400">
                                {action.source} · {formatWaveDate(action.created_at?.slice(0, 10) || action.week_start) || 'Date unavailable'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={actionBusy === action.id}
                            onClick={() => void markAction(action.id, 'done')}
                            className="min-h-8 shrink-0 rounded-xl px-2 text-[12px] font-semibold text-[#c2410c] hover:bg-orange-50"
                            aria-label={`Mark ${action.title} done`}
                          >
                            {actionBusy === action.id ? 'Saving…' : 'Mark done'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {openActions.length > 3 ? (
                    <button
                      className="compass-btn-ghost"
                      onClick={() => setShowAllActions(!showAllActions)}
                    >
                      {showAllActions
                        ? 'Show fewer actions'
                        : `View all ${openActions.length} actions`}
                    </button>
                  ) : null}
                  {doneActions.length ? (
                    <p className="pt-2 text-[11px] tabular-nums text-neutral-400">
                      {doneActions.length} done this week.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </aside>

          <div className="order-3 space-y-8 xl:col-start-1">
            {nextSplit.leftover.length ? (
              <Accordion
                type="single"
                collapsible
                className="rounded-2xl border border-stone-200/70 bg-white px-5 shadow-soft"
              >
                <AccordionItem value="leftovers" className="border-b-0">
                  <AccordionTrigger className="text-[13px] font-semibold text-neutral-700 hover:no-underline">
                    {nextSplit.leftover.length} leftover campaigns
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-5">
                    <p className="text-[12px] text-neutral-500">
                      Go-live date has passed and Instantly was never bound.
                      They stay here until you open or drop them.
                    </p>
                    {nextSplit.leftover.map((campaign) => {
                      const instantly = campaign.instantly_campaign_id
                        ? instantlyById.get(campaign.instantly_campaign_id)
                        : undefined
                      return (
                        <WaveCampaignCard
                          key={campaign.id}
                          campaign={campaign}
                          column="next"
                          instantly={instantly}
                          sends={instantly?.sendCount ?? 0}
                          replies={instantly?.replyCount ?? 0}
                        />
                      )
                    })}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
