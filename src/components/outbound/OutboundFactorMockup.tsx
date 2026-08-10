'use client'

/**
 * Temporary coded mockup for Outbound "Performance by factor".
 * Route: /sales/outbound/mock — not wired into production hub yet.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OutboundLibraryAccordion } from '@/components/outbound/OutboundLibraryAccordion'
import { cn } from '@/lib/utils'

type FactorKey = 'offer' | 'cta' | 'length' | 'audience'

type LiveCampaign = {
  id: string
  name: string
  offer: string
  cta: string
  ctaType: string
  length: 'Short' | 'Medium' | 'Long'
  audience: string
  vertical: string
  location: string
  progress: number
  leadCount: number
  sendCount: number
  remaining: number
  replyCount: number
  replyRate: number
  opportunities: number
  meetings: number
  status: 'live' | 'history'
}

const MOCK_CAMPAIGNS: LiveCampaign[] = [
  {
    id: '1',
    name: 'Switchflow | AI Enablement | Tradies AU | W12',
    offer: 'AI Enablement',
    cta: 'Mind if I send a 2-min walkthrough?',
    ctaType: 'permission',
    length: 'Short',
    audience: 'Tradies · AU',
    vertical: 'tradies',
    location: 'AU',
    progress: 62,
    leadCount: 2140,
    sendCount: 1328,
    remaining: 812,
    replyCount: 94,
    replyRate: 7.1,
    opportunities: 18,
    meetings: 8,
    status: 'live'
  },
  {
    id: '2',
    name: 'Switchflow | AI Enablement | Electricians | W11',
    offer: 'AI Enablement',
    cta: 'Mind if I send a 2-min walkthrough?',
    ctaType: 'permission',
    length: 'Short',
    audience: 'Electricians · AU',
    vertical: 'electricians',
    location: 'AU',
    progress: 48,
    leadCount: 1600,
    sendCount: 980,
    remaining: 620,
    replyCount: 82,
    replyRate: 8.4,
    opportunities: 21,
    meetings: 9,
    status: 'live'
  },
  {
    id: '3',
    name: 'Switchflow | Growth System | Brokers NSW | W10',
    offer: 'Growth System',
    cta: 'Mind if I send a 2-min walkthrough?',
    ctaType: 'permission',
    length: 'Medium',
    audience: 'Brokers · NSW',
    vertical: 'mortgage-brokers',
    location: 'NSW',
    progress: 100,
    leadCount: 1900,
    sendCount: 1640,
    remaining: 0,
    replyCount: 113,
    replyRate: 6.9,
    opportunities: 16,
    meetings: 7,
    status: 'history'
  },
  {
    id: '4',
    name: 'Switchflow | Growth System | Brokers VIC | W9',
    offer: 'Growth System',
    cta: 'Worth a 15-min call Thu/Fri?',
    ctaType: 'timed_call',
    length: 'Medium',
    audience: 'Brokers · VIC',
    vertical: 'mortgage-brokers',
    location: 'VIC',
    progress: 100,
    leadCount: 2100,
    sendCount: 1902,
    remaining: 0,
    replyCount: 81,
    replyRate: 4.3,
    opportunities: 11,
    meetings: 4,
    status: 'history'
  },
  {
    id: '5',
    name: 'Switchflow | AI Receptionist | Tradies QLD | W8',
    offer: 'AI Receptionist',
    cta: 'Worth a 15-min call Thu/Fri?',
    ctaType: 'timed_call',
    length: 'Long',
    audience: 'Tradies · QLD',
    vertical: 'tradies',
    location: 'QLD',
    progress: 71,
    leadCount: 2400,
    sendCount: 1700,
    remaining: 700,
    replyCount: 88,
    replyRate: 5.2,
    opportunities: 12,
    meetings: 5,
    status: 'live'
  },
  {
    id: '6',
    name: 'Switchflow | Agency Reporting | Agencies AU | W7',
    offer: 'Agency Reporting',
    cta: 'Open to seeing how peers handle this?',
    ctaType: 'interest_check',
    length: 'Short',
    audience: 'Agencies · AU',
    vertical: 'agencies',
    location: 'AU',
    progress: 100,
    leadCount: 1100,
    sendCount: 980,
    remaining: 0,
    replyCount: 30,
    replyRate: 3.1,
    opportunities: 4,
    meetings: 2,
    status: 'history'
  }
]

function factorValue(c: LiveCampaign, key: FactorKey) {
  if (key === 'offer') return c.offer
  if (key === 'cta') return c.cta
  if (key === 'length') return c.length
  return c.audience
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200/60 bg-stone-50/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-medium tabular-nums text-neutral-800">{value}</div>
    </div>
  )
}

function LiveCampaignCard({ campaign }: { campaign: LiveCampaign }) {
  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-neutral-900">{campaign.name}</h3>
            <Badge variant="success" appearance="light" size="sm">
              Live
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-neutral-600">
            <span className="font-medium text-neutral-800">{campaign.offer}</span>
            <span className="text-neutral-400"> · </span>
            {campaign.ctaType.replace('_', ' ')}
            <span className="text-neutral-400"> · </span>
            {campaign.length}
            <span className="text-neutral-400"> · </span>
            {campaign.audience}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold tabular-nums tracking-tight text-neutral-900">
            {campaign.progress}%
          </div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">complete</div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-[#e85d2a] transition-[width] duration-500 ease-out"
          style={{ width: `${campaign.progress}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Leads" value={campaign.leadCount.toLocaleString()} />
        <Metric label="Sent" value={campaign.sendCount.toLocaleString()} />
        <Metric label="Left" value={campaign.remaining.toLocaleString()} />
        <Metric label="Replies" value={campaign.replyCount.toLocaleString()} />
        <Metric label="Reply rate" value={`${campaign.replyRate}%`} />
        <Metric label="Opportunities" value={campaign.opportunities.toLocaleString()} />
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function OutboundFactorMockup() {
  const [factor, setFactor] = useState<FactorKey>('offer')
  const [selected, setSelected] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | 'live' | 'history'>('all')

  const live = MOCK_CAMPAIGNS.filter((c) => c.status === 'live')
  const history = MOCK_CAMPAIGNS.filter((c) => c.status === 'history')

  const scoped = useMemo(() => {
    if (scope === 'live') return live
    if (scope === 'history') return history
    return MOCK_CAMPAIGNS
  }, [scope, live, history])

  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string
        subtitle?: string
        campaigns: number
        sent: number
        replies: number
        meetings: number
        opportunities: number
      }
    >()
    for (const c of scoped) {
      const key = factorValue(c, factor)
      const cur = map.get(key) ?? {
        key,
        subtitle: factor === 'cta' ? c.ctaType : undefined,
        campaigns: 0,
        sent: 0,
        replies: 0,
        meetings: 0,
        opportunities: 0
      }
      cur.campaigns += 1
      cur.sent += c.sendCount
      cur.replies += c.replyCount
      cur.meetings += c.meetings
      cur.opportunities += c.opportunities
      map.set(key, cur)
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        replyRate: r.sent ? Math.round((r.replies / r.sent) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.replyRate - a.replyRate)
  }, [scoped, factor])

  const maxReply = rows[0]?.replyRate || 1
  const selectedCampaigns = selected
    ? scoped.filter((c) => factorValue(c, factor) === selected)
    : []

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-[13px] text-amber-950 shadow-soft">
        <span className="font-semibold">Mockup only</span>
        <span className="text-amber-800">
          {' '}
          — demo data, not Instantly. Proposed layout for `/sales/outbound`: Live → Performance by
          factor → History. Edit this file to change the mock.
        </span>{' '}
        <Link href="/sales/outbound" className="font-medium text-[#c2410c] hover:underline">
          Back to real Outbound
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Live</CardTitle>
                <CardDescription>
                  Active Instantly campaigns — leads contacted, send volume, replies, and
                  opportunities
                </CardDescription>
              </div>
              <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {live.length} live · mock
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {live.slice(0, 1).map((c) => (
                <LiveCampaignCard key={c.id} campaign={c} />
              ))}
              <p className="text-[12px] text-neutral-500">
                Showing 1 of {live.length} live campaigns (same Live card chrome as production).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Performance by factor</CardTitle>
                <CardDescription>
                  Instantly metrics rolled up by campaign bind — offer, CTA, length, audience
                </CardDescription>
              </div>
              <span className="rounded-xl border border-dashed border-[#e85d2a]/40 bg-[rgba(232,93,42,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[#c94a1f]">
                NEW
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Group by
                  </span>
                  <div className="inline-flex gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
                    {(
                      [
                        ['offer', 'Offer'],
                        ['cta', 'CTA'],
                        ['length', 'Length'],
                        ['audience', 'Audience']
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setFactor(key)
                          setSelected(null)
                        }}
                        className={cn(
                          'rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition',
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
                <Select
                  label="Status"
                  value={scope}
                  onChange={(v) => setScope(v as typeof scope)}
                  options={[
                    { value: 'all', label: 'Live + History' },
                    { value: 'live', label: 'Live only' },
                    { value: 'history', label: 'History only' }
                  ]}
                />
                <Select
                  label="Sort"
                  value="reply"
                  onChange={() => undefined}
                  options={[
                    { value: 'reply', label: 'Reply rate' },
                    { value: 'meetings', label: 'Meetings' },
                    { value: 'sent', label: 'Sent' }
                  ]}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-100 text-[11px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-1 py-3 font-medium capitalize">{factor}</th>
                      <th className="px-3 py-3 font-medium">Campaigns</th>
                      <th className="px-3 py-3 font-medium">Sent</th>
                      <th className="px-3 py-3 font-medium">Reply %</th>
                      <th className="px-3 py-3 font-medium">Meetings</th>
                      <th className="px-3 py-3 font-medium">Opps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const active = selected === row.key
                      return (
                        <tr
                          key={row.key}
                          onClick={() => setSelected(active ? null : row.key)}
                          className={cn(
                            'cursor-pointer border-b border-stone-50 transition',
                            active ? 'bg-orange-50/70' : 'hover:bg-stone-50/60'
                          )}
                        >
                          <td
                            className={cn(
                              'px-1 py-3',
                              active && 'border-l-[3px] border-l-[#e85d2a] pl-2'
                            )}
                          >
                            <div className="font-medium text-neutral-900">{row.key}</div>
                            {row.subtitle ? (
                              <div className="mt-0.5 text-[11px] text-neutral-400">
                                {row.subtitle}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-neutral-600">
                            {row.campaigns}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-neutral-600">
                            {row.sent.toLocaleString()}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cn(
                                'tabular-nums font-semibold',
                                row.replyRate === maxReply ? 'text-emerald-700' : 'text-neutral-800'
                              )}
                            >
                              {row.replyRate}%
                            </span>
                            <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 align-middle">
                              <span
                                className="block h-full rounded-full bg-[#e85d2a]"
                                style={{ width: `${(row.replyRate / maxReply) * 100}%` }}
                              />
                            </span>
                          </td>
                          <td className="px-3 py-3 tabular-nums text-neutral-600">
                            {row.meetings}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-neutral-600">
                            {row.opportunities}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {selected ? (
                <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 p-4">
                  <div className="mb-3 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-neutral-900">
                        Campaigns using this {factor}
                      </div>
                      <div className="text-[12px] text-neutral-500">
                        {selected} · {selectedCampaigns.length} campaign
                        {selectedCampaigns.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="text-[12px] font-medium text-[#c2410c] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-2">
                    {selectedCampaigns.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl border border-stone-200/70 bg-white px-3.5 py-3"
                      >
                        <div className="text-[13px] font-semibold text-neutral-900">{c.name}</div>
                        <div className="mt-0.5 text-[12px] text-neutral-500">
                          {c.length} · {c.audience} · {c.status}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-neutral-500">
                          <span>
                            Sent <b className="font-semibold text-neutral-900">{c.sendCount}</b>
                          </span>
                          <span>
                            Reply{' '}
                            <b className="font-semibold text-neutral-900">{c.replyRate}%</b>
                          </span>
                          <span>
                            Mtgs <b className="font-semibold text-neutral-900">{c.meetings}</b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-neutral-500">
                  Click a row to see matching Live/History campaigns with that bind.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>History</CardTitle>
                <CardDescription>
                  Completed Instantly campaigns — filter by name, volume, and reply rate
                </CardDescription>
              </div>
              <span className="rounded-xl bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                Mock
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Select
                  label="Offer"
                  value="all"
                  onChange={() => undefined}
                  options={[
                    { value: 'all', label: 'All offers' },
                    { value: 'ai', label: 'AI Enablement' }
                  ]}
                />
                <Select
                  label="CTA"
                  value="all"
                  onChange={() => undefined}
                  options={[
                    { value: 'all', label: 'All CTAs' },
                    { value: 'permission', label: 'Permission' }
                  ]}
                />
                <Select
                  label="Length"
                  value="all"
                  onChange={() => undefined}
                  options={[
                    { value: 'all', label: 'Any length' },
                    { value: 'short', label: 'Short' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'long', label: 'Long' }
                  ]}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-stone-100 text-[11px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-1 py-3 font-medium">Campaign</th>
                      <th className="px-3 py-3 font-medium">Sent</th>
                      <th className="px-3 py-3 font-medium">Replies</th>
                      <th className="px-3 py-3 font-medium">Reply %</th>
                      <th className="px-3 py-3 font-medium">Opps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c) => (
                      <tr key={c.id} className="border-b border-stone-50">
                        <td className="px-1 py-3 font-medium text-neutral-900">{c.name}</td>
                        <td className="px-3 py-3 tabular-nums text-neutral-600">
                          {c.sendCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-neutral-600">{c.replyCount}</td>
                        <td className="px-3 py-3 tabular-nums text-neutral-600">{c.replyRate}%</td>
                        <td className="px-3 py-3 tabular-nums text-neutral-600">
                          {c.opportunities}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <OutboundLibraryAccordion />
        </aside>
      </div>
    </div>
  )
}
