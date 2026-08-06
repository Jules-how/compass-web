/** Demo glances for Home. Ads stay demo until ad platforms sync; Instantly cold email uses live API when configured. */

export type AdCreativeMetric = {
  id: string
  name: string
  channel: 'Meta' | 'Google' | 'LinkedIn'
  status: 'winning' | 'learning' | 'fatigued' | 'needs-review'
  spend: number
  ctr: number
  cpa: number
  roas: number
}

export type HomeAdGlance = {
  spendToday: number
  spendDelta: number
  roas: number
  roasDelta: number
  cpa: number
  creativesNeedingReview: number
  creatives: AdCreativeMetric[]
}

export type ColdEmailGlance = {
  emailsSentToday: number
  repliesWaiting: number
  meetingsBooked: number
  replyRate: number
  campaigns: Array<{
    id: string
    name: string
    status: 'live' | 'launching' | 'paused'
    sent: number
    replies: number
    meetings: number
    progress: number
  }>
}

export const HOME_AD_DEMO: HomeAdGlance = {
  spendToday: 412,
  spendDelta: 6.2,
  roas: 3.4,
  roasDelta: 0.3,
  cpa: 48,
  creativesNeedingReview: 2,
  creatives: [
    {
      id: 'ad1',
      name: 'Founder POV — outbound pain',
      channel: 'Meta',
      status: 'winning',
      spend: 1860,
      ctr: 2.8,
      cpa: 36,
      roas: 4.1
    },
    {
      id: 'ad2',
      name: 'Carousel — case proof',
      channel: 'Meta',
      status: 'needs-review',
      spend: 940,
      ctr: 1.1,
      cpa: 72,
      roas: 1.6
    },
    {
      id: 'ad3',
      name: 'Search — agency growth',
      channel: 'Google',
      status: 'learning',
      spend: 620,
      ctr: 4.2,
      cpa: 54,
      roas: 2.9
    },
    {
      id: 'ad4',
      name: 'Thought leadership static',
      channel: 'LinkedIn',
      status: 'fatigued',
      spend: 410,
      ctr: 0.6,
      cpa: 118,
      roas: 0.9
    }
  ]
}

export const HOME_COLD_EMAIL_DEMO: ColdEmailGlance = {
  emailsSentToday: 840,
  repliesWaiting: 7,
  meetingsBooked: 3,
  replyRate: 3.3,
  campaigns: [
    {
      id: 'c1',
      name: 'July Agency Sprint',
      status: 'live',
      sent: 6420,
      replies: 214,
      meetings: 18,
      progress: 72
    },
    {
      id: 'c2',
      name: 'SaaS Founder Wave 3',
      status: 'live',
      sent: 5180,
      replies: 176,
      meetings: 14,
      progress: 58
    },
    {
      id: 'c3',
      name: 'Warm Reply Nurture',
      status: 'launching',
      sent: 420,
      replies: 38,
      meetings: 6,
      progress: 12
    }
  ]
}
