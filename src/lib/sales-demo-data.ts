export type SalesDateRange = '7d' | '30d' | '90d' | 'ytd'

export type SalesCampaignRef = {
  id: string
  name: string
  status: 'live' | 'launching' | 'paused' | 'completed'
  offer: string
  list: string
  sent: number
  replies: number
  meetings: number
  expectedRevenue: number
  progress: number
}

export type SalesSeriesPoint = {
  date: string
  sent: number
  replies: number
  opens: number
}

export type SalesDeal = {
  id: string
  name: string
  company: string
  stage: 'qualified' | 'meeting' | 'proposal' | 'won'
  value: number
  offer: string
  updatedAt: string
}

export type SalesOverviewModel = {
  kpis: {
    emailsSent: number
    emailsSentDelta: number
    liveOffers: number
    replies: number
    replyRate: number
    expectedRevenue: number
    expectedRevenueDelta: number
    meetingsBooked: number
    bounceRate: number
    positiveReplyRate: number
    contactsRemaining: number
  }
  campaigns: SalesCampaignRef[]
  series: SalesSeriesPoint[]
  deals: SalesDeal[]
  offers: string[]
  lists: string[]
}

const OFFERS = ['Agency Growth Audit', 'Outbound Sprint', 'Retainer Pilot', 'Founder Intro']
const LISTS = ['SaaS Founders AU', 'Agency Owners US', 'Series A Ops', 'Warm Replies Q2']

function buildSeries(days: number): SalesSeriesPoint[] {
  const points: SalesSeriesPoint[] = []
  const start = new Date('2026-07-08T00:00:00Z')
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const wave = Math.sin(i / 4) * 180 + Math.cos(i / 9) * 90
    const sent = Math.max(120, Math.round(620 + wave + (i % 5) * 35))
    const opens = Math.round(sent * (0.42 + (i % 7) * 0.01))
    const replies = Math.round(sent * (0.035 + (i % 9) * 0.002))
    points.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      sent,
      opens,
      replies
    })
  }
  return points
}

export const SALES_OVERVIEW_DEMO: SalesOverviewModel = {
  kpis: {
    emailsSent: 18420,
    emailsSentDelta: 12.7,
    liveOffers: 4,
    replies: 612,
    replyRate: 3.3,
    expectedRevenue: 248470,
    expectedRevenueDelta: 8.1,
    meetingsBooked: 47,
    bounceRate: 1.8,
    positiveReplyRate: 1.4,
    contactsRemaining: 9320
  },
  campaigns: [
    {
      id: 'c1',
      name: 'July Agency Sprint',
      status: 'live',
      offer: OFFERS[0],
      list: LISTS[1],
      sent: 6420,
      replies: 214,
      meetings: 18,
      expectedRevenue: 92000,
      progress: 72
    },
    {
      id: 'c2',
      name: 'SaaS Founder Wave 3',
      status: 'live',
      offer: OFFERS[1],
      list: LISTS[0],
      sent: 5180,
      replies: 176,
      meetings: 14,
      expectedRevenue: 78000,
      progress: 58
    },
    {
      id: 'c3',
      name: 'Warm Reply Nurture',
      status: 'launching',
      offer: OFFERS[3],
      list: LISTS[3],
      sent: 420,
      replies: 38,
      meetings: 6,
      expectedRevenue: 36000,
      progress: 12
    },
    {
      id: 'c4',
      name: 'Ops Leaders Retainer',
      status: 'paused',
      offer: OFFERS[2],
      list: LISTS[2],
      sent: 3100,
      replies: 94,
      meetings: 5,
      expectedRevenue: 28470,
      progress: 40
    },
    {
      id: 'c5',
      name: 'June Closed Book',
      status: 'completed',
      offer: OFFERS[1],
      list: LISTS[0],
      sent: 3300,
      replies: 90,
      meetings: 4,
      expectedRevenue: 14000,
      progress: 100
    }
  ],
  series: buildSeries(30),
  deals: [
    {
      id: 'd1',
      name: 'Outbound rebuild',
      company: 'Northline Media',
      stage: 'proposal',
      value: 42000,
      offer: OFFERS[1],
      updatedAt: '2026-08-05'
    },
    {
      id: 'd2',
      name: 'Growth audit',
      company: 'ParcelOps',
      stage: 'meeting',
      value: 8500,
      offer: OFFERS[0],
      updatedAt: '2026-08-04'
    },
    {
      id: 'd3',
      name: 'Retainer pilot',
      company: 'Kindling Studio',
      stage: 'qualified',
      value: 12000,
      offer: OFFERS[2],
      updatedAt: '2026-08-03'
    },
    {
      id: 'd4',
      name: 'Founder intro pack',
      company: 'Lumen Freight',
      stage: 'won',
      value: 18000,
      offer: OFFERS[3],
      updatedAt: '2026-08-01'
    }
  ],
  offers: OFFERS,
  lists: LISTS
}

export function filterSalesSeries(
  model: SalesOverviewModel,
  filters: {
    range: SalesDateRange
    campaigns: string[]
    offers: string[]
    lists: string[]
  }
): {
  series: SalesSeriesPoint[]
  emailsSent: number
  replies: number
  high: number
  low: number
} {
  const days = filters.range === '7d' ? 7 : filters.range === '90d' ? 90 : filters.range === 'ytd' ? 90 : 30
  let series = model.series.slice(-Math.min(days, model.series.length))

  // Scale series when campaign/offer/list filters narrow the universe.
  const selectedCampaigns = model.campaigns.filter((c) => {
    if (filters.campaigns.length && !filters.campaigns.includes(c.id)) return false
    if (filters.offers.length && !filters.offers.includes(c.offer)) return false
    if (filters.lists.length && !filters.lists.includes(c.list)) return false
    return true
  })
  const totalSent = model.campaigns.reduce((sum, c) => sum + c.sent, 0) || 1
  const filteredSent = selectedCampaigns.reduce((sum, c) => sum + c.sent, 0)
  const ratio = Math.max(0.12, filteredSent / totalSent)

  series = series.map((point) => ({
    ...point,
    sent: Math.round(point.sent * ratio),
    opens: Math.round(point.opens * ratio),
    replies: Math.max(1, Math.round(point.replies * ratio))
  }))

  const emailsSent = series.reduce((sum, p) => sum + p.sent, 0)
  const replies = series.reduce((sum, p) => sum + p.replies, 0)
  const values = series.map((p) => p.sent)
  return {
    series,
    emailsSent,
    replies,
    high: values.length ? Math.max(...values) : 0,
    low: values.length ? Math.min(...values) : 0
  }
}
