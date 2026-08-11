'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  factorValue,
  geoFromCampaigns,
  MOCK_CAMPAIGNS,
  MOCK_MIN_SENT,
  rate,
  rollup,
  type FactorKey,
  type MockCampaign,
  type MockEmailStep
} from '@/lib/outbound-compare-mock-data'
import { cn } from '@/lib/utils'

const FACTOR_TABS: Array<{ key: FactorKey; label: string }> = [
  { key: 'location', label: 'Location' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'structure', label: 'Structure' },
  { key: 'offer', label: 'Offer' },
  { key: 'cta', label: 'CTA' }
]

const ease = [0.22, 1, 0.36, 1] as const

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="compass-panel p-5">
      <div className="compass-section-label">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-neutral-500">{hint}</div> : null}
    </div>
  )
}

function statusBadge(status: MockCampaign['status']) {
  if (status === 'live') {
    return (
      <Badge variant="success" appearance="light" size="sm">
        Live
      </Badge>
    )
  }
  if (status === 'paused') {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        Paused
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      Completed
    </Badge>
  )
}

function EmailBlock({ email }: { email: MockEmailStep }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span className="font-semibold uppercase tracking-wide">
          Email {email.step}
          {email.waitDays ? ` · +${email.waitDays}d` : ' · first touch'}
        </span>
        <span className="tabular-nums">
          {email.sent.toLocaleString()} sent · {pct(email.replyRate)} reply
        </span>
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Subject
      </div>
      <p className="mt-1 text-[13px] font-medium text-neutral-900">{email.subject}</p>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Body
      </div>
      <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-neutral-700">
        {email.body}
      </pre>
    </div>
  )
}

function SheetShell({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[1px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        key="drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-stone-200/80 bg-white shadow-lift"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.28, ease }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-neutral-900">{title}</h2>
            {subtitle ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-stone-50"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </motion.aside>
    </AnimatePresence>,
    document.body
  )
}

function CompareDrawer({
  campaigns,
  onClose,
  onRemove
}: {
  campaigns: MockCampaign[]
  onClose: () => void
  onRemove: (id: string) => void
}) {
  const sameExpression =
    campaigns.length >= 2 && campaigns.every((c) => c.expression === campaigns[0].expression)
  const sameStructure =
    campaigns.length >= 2 && campaigns.every((c) => c.structureId === campaigns[0].structureId)
  const sameVertical =
    campaigns.length >= 2 && campaigns.every((c) => c.vertical === campaigns[0].vertical)
  const locations = [...new Set(campaigns.map((c) => c.location))]

  let verdict = 'Pick 2–4 campaigns to compare.'
  if (
    campaigns.length >= 2 &&
    sameVertical &&
    sameExpression &&
    sameStructure &&
    locations.length > 1
  ) {
    verdict = `Fair geo test: same vertical, expression, and structure — difference is location (${locations.join(' vs ')}).`
  } else if (campaigns.length >= 2 && sameVertical && locations.length === 1 && !sameStructure) {
    verdict = `Structure test in ${locations[0]}: expression may match, structures differ.`
  } else if (campaigns.length >= 2) {
    verdict = 'Mixed factors — don’t call a single winner yet. Align on one changed dimension.'
  }

  return (
    <SheetShell title="Compare campaigns" subtitle={verdict} onClose={onClose}>
      <div className={cn('grid gap-5', campaigns.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {campaigns.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-stone-200/70 bg-stone-50/40 p-5 shadow-soft"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-semibold text-neutral-900">{c.name}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {statusBadge(c.status)}
                  <Badge variant="secondary" appearance="light" size="sm">
                    {c.location}
                  </Badge>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                className="text-[11px] font-medium text-neutral-400 hover:text-neutral-700"
              >
                Remove
              </button>
            </div>

            <p className="mt-4 line-clamp-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[12px] leading-relaxed text-neutral-600">
              {c.expression}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ['Sent', c.sent.toLocaleString()],
                ['Reply', pct(rate(c.replies, c.sent))],
                ['Positive', pct(rate(c.positive, c.sent))],
                ['Meetings', String(c.meetings)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white px-3 py-2.5 shadow-soft">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    {label}
                  </div>
                  <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-neutral-900">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SheetShell>
  )
}

function CampaignCellCard({
  campaign,
  compared,
  expanded,
  onToggleCompare,
  onToggleExpand
}: {
  campaign: MockCampaign
  compared: boolean
  expanded: boolean
  onToggleCompare: () => void
  onToggleExpand: () => void
}) {
  const preview = campaign.emails[0]

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-5 shadow-soft transition',
        compared ? 'border-[#e85d2a]/30' : 'border-stone-200/70'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={compared}
              onChange={onToggleCompare}
              className="h-4 w-4 rounded border-stone-300 text-[#e85d2a]"
              aria-label={`Compare ${campaign.name}`}
            />
            <span className="text-[15px] font-semibold text-neutral-900">{campaign.name}</span>
            {statusBadge(campaign.status)}
          </div>
          <div className="mt-2 text-[13px] text-neutral-500">
            {campaign.vertical} · {campaign.location} · {campaign.structureLabel} · {campaign.offer}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-[13px]">
          <MetricChip
            label="Sent"
            value={campaign.sent.toLocaleString()}
            warn={campaign.sent < MOCK_MIN_SENT}
          />
          <MetricChip label="Reply" value={pct(rate(campaign.replies, campaign.sent))} strong />
          <MetricChip label="Meetings" value={String(campaign.meetings)} />
        </div>
      </div>

      {preview ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-50/60">
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Email 1 · subject
            </div>
            <div className="mt-1 text-[13px] font-medium text-neutral-800">{preview.subject}</div>
            {!expanded ? (
              <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">
                {preview.body.replace(/\n+/g, ' ')}
              </p>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                key="seq"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease }}
                className="overflow-hidden"
              >
                <div className="space-y-3 border-t border-stone-200/80 px-4 py-4">
                  <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Cold expression
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-700">
                      {campaign.expression}
                    </p>
                    <div className="mt-3 text-[12px] text-neutral-500">
                      CTA: <span className="text-neutral-800">{campaign.cta}</span>
                    </div>
                  </div>
                  {campaign.emails.map((email) => (
                    <EmailBlock key={email.step} email={email} />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between border-t border-stone-200/80 px-4 py-3 text-left text-[12px] font-medium text-[#c2410c] hover:bg-orange-50/40"
          >
            <span>{expanded ? 'Hide sequence' : 'View full sequence'}</span>
            <span
              className={cn(
                'text-[11px] text-neutral-400 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            >
              ▾
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function OutboundCompareMock() {
  const [factor, setFactor] = useState<FactorKey>('location')
  const [verticalFilter, setVerticalFilter] = useState('Cleaning')
  const [locationFilter, setLocationFilter] = useState('all')
  const [structureFilter, setStructureFilter] = useState('all')
  const [selectedFactorKey, setSelectedFactorKey] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>(['bne-clean-nick3', 'syd-clean-nick3'])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const verticals = useMemo(
    () => ['all', ...Array.from(new Set(MOCK_CAMPAIGNS.map((c) => c.vertical))).sort()],
    []
  )
  const locations = useMemo(
    () => ['all', ...Array.from(new Set(MOCK_CAMPAIGNS.map((c) => c.location))).sort()],
    []
  )
  const structures = useMemo(
    () => ['all', ...Array.from(new Set(MOCK_CAMPAIGNS.map((c) => c.structureLabel))).sort()],
    []
  )

  const filtered = useMemo(() => {
    return MOCK_CAMPAIGNS.filter((c) => {
      if (verticalFilter !== 'all' && c.vertical !== verticalFilter) return false
      if (locationFilter !== 'all' && c.location !== locationFilter) return false
      if (structureFilter !== 'all' && c.structureLabel !== structureFilter) return false
      return true
    })
  }, [verticalFilter, locationFilter, structureFilter])

  const rows = useMemo(() => rollup(filtered, factor), [filtered, factor])
  const maxReply = rows[0]?.replyRate || 1
  const geo = useMemo(() => geoFromCampaigns(filtered), [filtered])

  const totals = useMemo(() => {
    const sent = filtered.reduce((s, c) => s + c.sent, 0)
    const replies = filtered.reduce((s, c) => s + c.replies, 0)
    const meetings = filtered.reduce((s, c) => s + c.meetings, 0)
    return { sent, replies, meetings, replyRate: rate(replies, sent) }
  }, [filtered])

  const compareCampaigns = MOCK_CAMPAIGNS.filter((c) => compareIds.includes(c.id))

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 4) return prev
      return [...prev, id]
    })
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function presetGeo() {
    setVerticalFilter('Cleaning')
    setLocationFilter('all')
    setStructureFilter('Nick 3-step')
    setFactor('location')
    setSelectedFactorKey(null)
    setCompareIds(['bne-clean-nick3', 'syd-clean-nick3'])
  }

  function presetStructure() {
    setVerticalFilter('Cleaning')
    setLocationFilter('Sydney')
    setStructureFilter('all')
    setFactor('structure')
    setSelectedFactorKey(null)
    setCompareIds(['syd-clean-nick3', 'syd-clean-nick4'])
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link
              href="/sales/outbound"
              className="text-[12px] font-medium text-[#c2410c] hover:underline"
            >
              ← Outbound
            </Link>
            <Badge variant="primary" appearance="light" size="sm">
              Mock
            </Badge>
          </div>
          <h1 className="compass-page-title font-display text-2xl text-neutral-900">
            Campaign compare
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            Roll up Instantly metrics by location, vertical, and structure. Expand a campaign to
            read the full sequence copy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={presetGeo}
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[12px] font-medium text-neutral-700 shadow-soft hover:bg-stone-50"
          >
            Preset: Brisbane vs Sydney
          </button>
          <button
            type="button"
            onClick={presetStructure}
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[12px] font-medium text-neutral-700 shadow-soft hover:bg-stone-50"
          >
            Preset: Sydney structure test
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={compareIds.length < 2}
            className="rounded-xl bg-[#e85d2a] px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open compare ({compareIds.length})
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Campaigns in view" value={String(filtered.length)} hint="After filters" />
        <Kpi label="Sent" value={totals.sent.toLocaleString()} hint="Instantly volume" />
        <Kpi label="Reply rate" value={pct(totals.replyRate)} hint={`${totals.replies} replies`} />
        <Kpi label="Meetings" value={String(totals.meetings)} hint="Booked from these cells" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Performance by factor</CardTitle>
            <CardDescription>
              Group Instantly scores by one dimension. Filters hold the other dimensions fixed.
            </CardDescription>
          </div>
          <span className="rounded-xl bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
            Mock data
          </span>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Group by
              </span>
              <div className="inline-flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
                {FACTOR_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setFactor(key)
                      setSelectedFactorKey(null)
                    }}
                    className={cn(
                      'rounded-lg px-3 py-2 text-[12px] font-medium transition',
                      factor === key
                        ? 'bg-white text-neutral-900 shadow-soft'
                        : 'text-neutral-500 hover:text-neutral-800'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <FilterSelect
                label="Vertical"
                value={verticalFilter}
                onChange={(v) => {
                  setVerticalFilter(v)
                  setSelectedFactorKey(null)
                }}
                options={verticals}
              />
              <FilterSelect
                label="Location"
                value={locationFilter}
                onChange={(v) => {
                  setLocationFilter(v)
                  setSelectedFactorKey(null)
                }}
                options={locations}
              />
              <FilterSelect
                label="Structure"
                value={structureFilter}
                onChange={(v) => {
                  setStructureFilter(v)
                  setSelectedFactorKey(null)
                }}
                options={structures}
              />
            </div>
          </div>

          <p className="text-[12px] text-neutral-500">
            Rows under {MOCK_MIN_SENT} sent are greyed — not enough volume to crown a winner.
          </p>

          <div className="space-y-2">
            {rows.map((row) => {
              const active = selectedFactorKey === row.key
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setSelectedFactorKey(active ? null : row.key)}
                  className={cn(
                    'flex w-full flex-col gap-3 rounded-2xl border px-5 py-4 text-left transition sm:flex-row sm:items-center sm:justify-between',
                    active
                      ? 'border-[#e85d2a]/35 bg-orange-50/70 shadow-soft'
                      : 'border-stone-200/70 bg-white hover:bg-stone-50/70',
                    row.thin && 'opacity-55'
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-neutral-900">{row.key}</div>
                    <div className="mt-1 text-[12px] text-neutral-500">
                      {row.campaigns} campaign{row.campaigns === 1 ? '' : 's'}
                      {row.subtitle ? ` · ${row.subtitle}` : ''}
                      {row.thin ? ' · thin sample' : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
                    <MetricChip label="Sent" value={row.sent.toLocaleString()} />
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-[#e85d2a]"
                          style={{
                            width: `${Math.max(8, (row.replyRate / maxReply) * 100)}%`
                          }}
                        />
                      </div>
                      <MetricChip label="Reply" value={pct(row.replyRate)} strong />
                    </div>
                    <MetricChip label="Positive" value={pct(rate(row.positive, row.sent))} />
                    <MetricChip label="Meetings" value={String(row.meetings)} />
                  </div>
                </button>
              )
            })}
          </div>

          {selectedFactorKey ? (
            <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 p-5">
              <div className="text-[13px] font-semibold text-neutral-800">
                Campaigns in “{selectedFactorKey}”
              </div>
              <ul className="mt-3 space-y-2">
                {filtered
                  .filter((c) => factorValue(c, factor) === selectedFactorKey)
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          toggleExpand(c.id)
                          const el = document.getElementById(`cell-${c.id}`)
                          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                        }}
                        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-left text-[13px] shadow-soft hover:bg-orange-50/50"
                      >
                        <span className="font-medium text-neutral-800">{c.name}</span>
                        <span className="tabular-nums text-neutral-500">
                          {c.sent.toLocaleString()} sent · {pct(rate(c.replies, c.sent))} reply →
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Campaign cells</CardTitle>
              <CardDescription>
                One Instantly campaign = one experiment cell. Expand to read the copy; tick 2–4 to
                compare.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {filtered.map((c) => (
                <div key={c.id} id={`cell-${c.id}`}>
                  <CampaignCellCard
                    campaign={c}
                    compared={compareIds.includes(c.id)}
                    expanded={expandedIds.has(c.id)}
                    onToggleCompare={() => toggleCompare(c.id)}
                    onToggleExpand={() => toggleExpand(c.id)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Where it works</CardTitle>
                <CardDescription>Geo heat from the filtered set.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {geo.map((g) => (
                <div key={g.label} className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 shrink-0 rounded-xl shadow-soft"
                    style={{
                      background: `rgba(232, 93, 42, ${0.18 + g.heat * 0.7})`
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-neutral-900">{g.label}</span>
                      <span className="text-[12px] tabular-nums font-semibold text-neutral-800">
                        {pct(g.successRate)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      {g.targeted.toLocaleString()} sent · {g.successes} wins
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-[#e85d2a]"
                        style={{ width: `${Math.max(6, g.heat * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>How to read this</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-[13px] leading-relaxed text-neutral-600">
              <p>
                Expand <span className="font-medium text-neutral-800">View full sequence</span> on a
                card to read every email in place.
              </p>
              <p>
                <span className="font-medium text-neutral-800">Brisbane vs Sydney</span> locks
                Cleaning + Nick 3-step so location is the only variable.
              </p>
              <p>
                Prefer reply / positive / meetings over opens. Grey rows are under the sample floor.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {drawerOpen && compareCampaigns.length >= 2 ? (
        <CompareDrawer
          campaigns={compareCampaigns}
          onClose={() => setDrawerOpen(false)}
          onRemove={(id) => {
            setCompareIds((prev) => {
              const next = prev.filter((x) => x !== id)
              if (next.length < 2) setDrawerOpen(false)
              return next
            })
          }}
        />
      ) : null}
    </div>
  )
}

function MetricChip({
  label,
  value,
  strong,
  warn
}: {
  label: string
  value: string
  strong?: boolean
  warn?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <div
        className={cn(
          'mt-0.5 tabular-nums',
          strong ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700',
          warn && 'text-amber-700'
        )}
      >
        {value}
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === 'all' ? `All ${label.toLowerCase()}s` : o}
          </option>
        ))}
      </select>
    </label>
  )
}
