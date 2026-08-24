'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { CampaignReviewModal } from '@/components/campaigns/CampaignReviewModal'
import { placeInventoryCard, QUEUE_QUERY_KEY } from '@/components/campaigns/OutboundInventoryRail'
import { MockShapeShell } from '@/components/outbound/mock/MockShapeShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CAMPAIGNS_QUERY_KEY
} from '@/lib/campaigns-client'
import {
  INVENTORY_DRAG_MIME,
  mondayOfWeek,
  mondayWeeksAhead,
  parseInventoryDrag,
  RECONTACT_PROMOTE_MIN,
  type InventoryCard,
  type QueuePayload
} from '@/lib/campaign-queue'
import {
  dateOnlyInZone,
  formatGoLiveAt,
  type CompassCampaign
} from '@/lib/campaigns'
import {
  cassetteBayCount,
  nextOpenWeekdayNineAm,
  rankNextSlotsWithPrefs,
  type CadencePrefs
} from '@/lib/outbound-cadence'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type CampaignsPayload = { campaigns: CompassCampaign[] }

type CheckKey = 'list' | 'openers' | 'copy' | 'bind'

type Checklist = {
  list: boolean
  openers: boolean
  copy: boolean
  bind: boolean
}

function todayInZone(): string {
  return dateOnlyInZone(new Date().toISOString())
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekLabel(monday: string): string {
  const sun = addDays(monday, 6)
  const fmt = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC'
    })
  return `${fmt(monday)} to ${fmt(sun)}`
}

function campaignDateOnly(campaign: CompassCampaign): string | null {
  if (campaign.go_live_at) return dateOnlyInZone(campaign.go_live_at)
  return campaign.start_date || null
}

function tradeLabel(campaign: CompassCampaign): string {
  return (campaign.vertical_tags?.[0] || '').trim() || 'No trade'
}

function titleCase(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

function recName(card: InventoryCard): string {
  const trade = titleCase(card.vertical)
  const city = card.city ? titleCase(card.city) : null
  return [card.kind === 'recontact' ? 'Recontact' : null, trade, city].filter(Boolean).join(' · ')
}

function campaignChecklist(campaign: CompassCampaign): Checklist {
  const cohort = campaign.wave_cohort_count ?? 0
  const openers = campaign.wave_opener_count ?? 0
  const copy = (campaign.copy_status || '').trim()
  return {
    list: cohort >= RECONTACT_PROMOTE_MIN,
    openers: cohort > 0 && openers >= cohort,
    copy: copy === 'ready' || copy === 'live',
    bind: Boolean((campaign.instantly_campaign_id || '').trim())
  }
}

function firstFail(checks: Checklist): CheckKey | null {
  const order: CheckKey[] = ['list', 'openers', 'copy', 'bind']
  return order.find((key) => !checks[key]) ?? null
}

const PRIMARY =
  'inline-flex items-center rounded-xl bg-[#e85d2a] px-3 py-1.5 text-[12px] font-semibold text-white shadow-soft hover:bg-[#d24f1f] disabled:opacity-50'
const SECONDARY =
  'rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 shadow-soft hover:bg-stone-50'

export function ClocksPreview() {
  const campaignsQuery = useCachedJson<CampaignsPayload>(CAMPAIGNS_QUERY_KEY, '/api/campaigns', {
    staleMs: 30_000
  })
  const queueQuery = useCachedJson<QueuePayload>(QUEUE_QUERY_KEY, '/api/campaigns/queue', {
    staleMs: 30_000
  })
  const [weekShift, setWeekShift] = useState(0)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = todayInZone()
  const thisMonday = mondayOfWeek(today)
  const weekMonday = mondayWeeksAhead(thisMonday, weekShift)
  const weekSunday = addDays(weekMonday, 6)

  const weekCampaigns = useMemo(() => {
    const rows = campaignsQuery.data?.campaigns ?? []
    return rows
      .filter((c) => {
        const day = campaignDateOnly(c)
        return Boolean(day && day >= weekMonday && day <= weekSunday)
      })
      .sort((a, b) => {
        const as = a.go_live_at || a.start_date || '9999'
        const bs = b.go_live_at || b.start_date || '9999'
        return as.localeCompare(bs) || a.name.localeCompare(b.name)
      })
  }, [campaignsQuery.data, weekMonday, weekSunday])

  const filled = weekCampaigns.length
  const occupiedDateOnly = useMemo(() => {
    const set = new Set<string>()
    for (const c of weekCampaigns) {
      const day = campaignDateOnly(c)
      if (day) set.add(day)
    }
    return set
  }, [weekCampaigns])

  const reloadAll = useCallback(async () => {
    await Promise.all([campaignsQuery.reload(true), queueQuery.reload(true)])
  }, [campaignsQuery.reload, queueQuery.reload])

  const placeOnWeek = useCallback(
    async (card: InventoryCard) => {
      setBusy(true)
      setError(null)
      try {
        const goLiveAt = nextOpenWeekdayNineAm(weekMonday, occupiedDateOnly)
        await placeInventoryCard(card, goLiveAt)
        await reloadAll()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not place campaign')
      } finally {
        setBusy(false)
      }
    },
    [occupiedDateOnly, reloadAll, weekMonday]
  )

  const reviewCampaign = weekCampaigns.find((c) => c.id === reviewId)
    ?? campaignsQuery.data?.campaigns.find((c) => c.id === reviewId)
    ?? null

  return (
    <>
      <MockShapeShell
        title="Two clocks"
        slots={filled}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="compass-btn-secondary h-8 px-3 text-[12px]" onClick={() => setWeekShift((n) => n - 1)}>
              Prev
            </button>
            <button type="button" className="compass-btn-secondary h-8 px-3 text-[12px]" onClick={() => setWeekShift(0)}>
              Today
            </button>
            <button type="button" className="compass-btn-secondary h-8 px-3 text-[12px]" onClick={() => setWeekShift((n) => n + 1)}>
              Next
            </button>
            <p className="pb-0.5 text-[12px] font-medium text-neutral-500">{weekLabel(weekMonday)}</p>
          </div>
        }
      >
        {({ prefs }) => (
          <ClocksBody
            prefs={prefs}
            weekCampaigns={weekCampaigns}
            queue={queueQuery.data}
            loading={!campaignsQuery.data && campaignsQuery.loading}
            error={error || campaignsQuery.error || queueQuery.error}
            busy={busy}
            onPlace={placeOnWeek}
            onReview={(id) => setReviewId(id)}
          />
        )}
      </MockShapeShell>
      {reviewId ? (
        <CampaignReviewModal
          campaignId={reviewId}
          campaign={reviewCampaign}
          onClose={() => setReviewId(null)}
          onUpdated={() => {
            void reloadAll()
          }}
        />
      ) : null}
    </>
  )
}

function ClocksBody({
  prefs,
  weekCampaigns,
  queue,
  loading,
  error,
  busy,
  onPlace,
  onReview
}: {
  prefs: CadencePrefs
  weekCampaigns: CompassCampaign[]
  queue: QueuePayload | undefined
  loading: boolean
  error: string | null
  busy: boolean
  onPlace: (card: InventoryCard) => Promise<void>
  onReview: (id: string) => void
}) {
  const filled = weekCampaigns.length
  const bayCount = cassetteBayCount(filled, prefs)
  const filledBays = weekCampaigns.slice(0, bayCount)
  const overflow = weekCampaigns.slice(bayCount)
  const emptyCount = Math.max(0, bayCount - filledBays.length)

  const recs = useMemo(() => {
    if (!queue) return []
    return rankNextSlotsWithPrefs({
      runway: queue.runway,
      recontactPool: queue.recontactPool,
      thisWeekVerticals: weekCampaigns.flatMap((c) => c.vertical_tags ?? []),
      thisWeekSlots: filled,
      prefs
    })
  }, [filled, prefs, queue, weekCampaigns])

  const emptyRecs = recs.slice(0, emptyCount)

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Card className="shrink-0">
        <CardHeader className="py-3">
          <CardTitle>Launches this week</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading campaigns…</p>
          ) : (
            <ShortBayRow
              filled={filledBays}
              emptyCount={emptyCount}
              recs={emptyRecs}
              busy={busy}
              onPlace={onPlace}
              onReview={onReview}
            />
          )}
          {overflow.length > 0 ? (
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Overflow</p>
              {overflow.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => onReview(campaign.id)}
                  className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-[12px] shadow-soft hover:bg-stone-50"
                >
                  <span className="font-medium text-neutral-900">{campaign.name}</span>
                  <span className="ml-2 text-neutral-500">{tradeLabel(campaign)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="flex min-h-[28rem] flex-1 flex-col">
        <CardHeader className="py-3">
          <CardTitle>Work still owed</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
          {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {weekCampaigns.map((campaign) => (
              <CampaignWorkRow
                key={campaign.id}
                campaign={campaign}
                onReview={onReview}
              />
            ))}
            {emptyRecs.map((card) => (
              <RecWorkRow
                key={card.id}
                card={card}
                busy={busy}
                onPlace={() => onPlace(card)}
              />
            ))}
            {Array.from({ length: Math.max(0, emptyCount - emptyRecs.length) }).map((_, i) => (
              <EmptyBayWorkRow key={`empty-${i}`} />
            ))}
            {!loading && weekCampaigns.length === 0 && emptyCount === 0 ? (
              <p className="text-sm text-neutral-500">No dated launches this week.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ShortBayRow({
  filled,
  emptyCount,
  recs,
  busy,
  onPlace,
  onReview
}: {
  filled: CompassCampaign[]
  emptyCount: number
  recs: InventoryCard[]
  busy: boolean
  onPlace: (card: InventoryCard) => Promise<void>
  onReview: (id: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {filled.map((campaign) => (
        <button
          key={campaign.id}
          type="button"
          onClick={() => onReview(campaign.id)}
          className="compass-panel min-w-[9.5rem] shrink-0 rounded-xl px-3 py-2 text-left shadow-soft"
        >
          <p className="truncate text-[12px] font-semibold text-neutral-900">{campaign.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">{tradeLabel(campaign)}</p>
        </button>
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <EmptyBay
          key={`bay-empty-${i}`}
          rec={recs[i]}
          busy={busy}
          onPlace={onPlace}
        />
      ))}
    </div>
  )
}

function EmptyBay({
  rec,
  busy,
  onPlace
}: {
  rec?: InventoryCard
  busy: boolean
  onPlace: (card: InventoryCard) => Promise<void>
}) {
  const [over, setOver] = useState(false)

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setOver(false)
    const card =
      parseInventoryDrag(event.dataTransfer.getData(INVENTORY_DRAG_MIME)) ||
      parseInventoryDrag(event.dataTransfer.getData('text/plain'))
    if (card) void onPlace(card)
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (rec) void onPlace(rec)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'min-w-[9.5rem] shrink-0 rounded-xl border border-dashed px-3 py-2 text-left text-[11px] text-neutral-400 shadow-soft',
        over ? 'border-[#e85d2a] bg-[#e85d2a]/5' : 'border-stone-300 bg-stone-50/60'
      )}
    >
      Drop here
    </button>
  )
}

function Chip({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      className={cn(
        'rounded-xl px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        pass ? 'bg-stone-100 text-neutral-600' : 'bg-amber-50 text-amber-800'
      )}
    >
      {label}
    </span>
  )
}

function CampaignWorkRow({
  campaign,
  onReview
}: {
  campaign: CompassCampaign
  onReview: (id: string) => void
}) {
  const checks = campaignChecklist(campaign)
  const fail = firstFail(checks)
  const trade = tradeLabel(campaign)
  const offer = (campaign.offer_key || '').trim() || 'No offer'
  const live = campaign.go_live_at ? formatGoLiveAt(campaign.go_live_at) : null

  return (
    <div className="compass-panel flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 shadow-soft">
      <div className="min-w-[10rem] flex-1">
        <p className="text-[13px] font-semibold text-neutral-900">{campaign.name}</p>
        {live ? <p className="text-[11px] text-neutral-400">{live}</p> : null}
      </div>
      <p className="w-28 truncate text-[12px] text-neutral-600">{trade}</p>
      <p className="w-32 truncate text-[12px] text-neutral-600">{offer}</p>
      <div className="flex flex-wrap gap-1">
        <Chip label="list" pass={checks.list} />
        <Chip label="openers" pass={checks.openers} />
        <Chip label="copy" pass={checks.copy} />
        <Chip label="bind" pass={checks.bind} />
      </div>
      <div className="ml-auto">
        {fail === 'list' ? (
          <Link
            href={`/leads?pipeline_campaign_id=${encodeURIComponent(campaign.id)}`}
            className={PRIMARY}
          >
            Attach list
          </Link>
        ) : fail === 'openers' ? (
          <button type="button" className={PRIMARY} onClick={() => onReview(campaign.id)}>
            Review openers
          </button>
        ) : fail === 'copy' ? (
          <Link href={`/sales/outbound/editor/${encodeURIComponent(campaign.id)}`} className={PRIMARY}>
            Open editor
          </Link>
        ) : fail === 'bind' ? (
          <Link href={`/sales/pipeline/${encodeURIComponent(campaign.id)}`} className={PRIMARY}>
            Bind Instantly
          </Link>
        ) : (
          <span className="text-[12px] font-medium text-neutral-500">Ready</span>
        )}
      </div>
    </div>
  )
}

function RecWorkRow({
  card,
  busy,
  onPlace
}: {
  card: InventoryCard
  busy: boolean
  onPlace: () => void
}) {
  const listPass = card.count >= RECONTACT_PROMOTE_MIN
  const href = `/leads?vertical=${encodeURIComponent(card.vertical)}&recontact_ready=1`
  return (
    <div className="compass-panel flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 shadow-soft">
      <div className="min-w-[10rem] flex-1">
        <p className="text-[13px] font-semibold text-neutral-900">{recName(card)}</p>
        <p className="text-[11px] text-neutral-400">Fill this bay</p>
      </div>
      <p className="w-28 truncate text-[12px] text-neutral-600">{titleCase(card.vertical)}</p>
      <p className="w-32 truncate text-[12px] text-neutral-600">{card.reason}</p>
      <div className="flex flex-wrap gap-1">
        <Chip label="list" pass={listPass} />
        <Chip label="openers" pass={false} />
        <Chip label="copy" pass={false} />
        <Chip label="bind" pass={false} />
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!listPass ? (
          <Link href={href} className={SECONDARY}>
            Ready to add
          </Link>
        ) : null}
        <button type="button" className={PRIMARY} disabled={busy} onClick={onPlace}>
          Fill this bay
        </button>
      </div>
    </div>
  )
}

function EmptyBayWorkRow() {
  return (
    <div className="compass-panel flex flex-wrap items-center gap-3 rounded-xl border-dashed px-4 py-3 shadow-soft">
      <p className="flex-1 text-[13px] font-semibold text-neutral-500">Empty bay</p>
      <p className="w-28 text-[12px] text-neutral-400">No trade</p>
      <p className="w-32 text-[12px] text-neutral-400">No ranked card</p>
      <div className="flex flex-wrap gap-1">
        <Chip label="list" pass={false} />
        <Chip label="openers" pass={false} />
        <Chip label="copy" pass={false} />
        <Chip label="bind" pass={false} />
      </div>
    </div>
  )
}
