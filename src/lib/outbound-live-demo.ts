/** Demo live / history campaign metrics for the Outbound hub. */

export type OutboundLiveCampaign = {
  id: string
  name: string
  status: 'live' | 'launching' | 'paused' | 'completed'
  offer: string
  offerKey: string
  copyNotes: string
  vertical: string
  location: string
  leadCount: number
  sendCount: number
  remaining: number
  progress: number
  replyRate: number
  positiveReplies: number
  meetings: number
  startedAt: string
  updatedAt: string
}

/** Seeded live + recent campaigns for Outbound overview (richer than Sales overview). */
export const OUTBOUND_LIVE_DEMO: OutboundLiveCampaign[] = [
  {
    id: 'ob-live-1',
    name: 'NSW Electricians — Growth System',
    status: 'live',
    offer: 'Switchflow Growth System',
    offerKey: 'growth-system',
    copyNotes: 'Nick 3-step · cold X-in-Y booked chats · permission CTA · au-national opener tier',
    vertical: 'electricians',
    location: 'nsw',
    leadCount: 2400,
    sendCount: 1680,
    remaining: 720,
    progress: 70,
    replyRate: 3.8,
    positiveReplies: 42,
    meetings: 11,
    startedAt: '2026-07-28',
    updatedAt: '2026-08-07T04:12:00Z'
  },
  {
    id: 'ob-live-2',
    name: 'QLD Tradies — AI Receptionist',
    status: 'live',
    offer: 'AI Receptionist System',
    offerKey: 'ai-receptionist-system',
    copyNotes: 'Platten AIDA · missed-call hook · timed call CTA · QLD-only list',
    vertical: 'tradies',
    location: 'qld',
    leadCount: 1850,
    sendCount: 980,
    remaining: 870,
    progress: 53,
    replyRate: 4.1,
    positiveReplies: 31,
    meetings: 8,
    startedAt: '2026-07-30',
    updatedAt: '2026-08-07T03:40:00Z'
  },
  {
    id: 'ob-live-3',
    name: 'Mortgage Brokers AU — Enablement',
    status: 'live',
    offer: 'AI Enablement',
    offerKey: 'ai-enablement',
    copyNotes: 'Connor 3-para · borrower-chat expression · interest-check CTA',
    vertical: 'mortgage-brokers',
    location: 'au-national',
    leadCount: 3200,
    sendCount: 2100,
    remaining: 1100,
    progress: 66,
    replyRate: 2.9,
    positiveReplies: 38,
    meetings: 9,
    startedAt: '2026-07-22',
    updatedAt: '2026-08-06T22:10:00Z'
  },
  {
    id: 'ob-live-4',
    name: 'Agency Owners — Reporting Pack',
    status: 'live',
    offer: 'Agency AI Reporting',
    offerKey: 'agency-ai-reporting',
    copyNotes: 'Nick 4-step · give-first CTA · agencies vertical · soft proof block',
    vertical: 'agencies',
    location: 'au-national',
    leadCount: 1100,
    sendCount: 420,
    remaining: 680,
    progress: 38,
    replyRate: 5.2,
    positiveReplies: 18,
    meetings: 5,
    startedAt: '2026-08-01',
    updatedAt: '2026-08-06T18:00:00Z'
  },
  {
    id: 'ob-live-5',
    name: 'VIC Electricians Wave 2',
    status: 'live',
    offer: 'Switchflow Growth System',
    offerKey: 'growth-system',
    copyNotes: 'Nick 3-step · tighter CTA · VIC metro only',
    vertical: 'electricians',
    location: 'vic',
    leadCount: 900,
    sendCount: 210,
    remaining: 690,
    progress: 23,
    replyRate: 3.1,
    positiveReplies: 5,
    meetings: 1,
    startedAt: '2026-08-04',
    updatedAt: '2026-08-06T12:00:00Z'
  },
  {
    id: 'ob-live-6',
    name: 'Tradies Retarget — Warm',
    status: 'launching',
    offer: 'AI Receptionist System',
    offerKey: 'ai-receptionist-system',
    copyNotes: 'Follow-up fork only · prior openers · launching tomorrow',
    vertical: 'tradies',
    location: 'nsw',
    leadCount: 640,
    sendCount: 40,
    remaining: 600,
    progress: 6,
    replyRate: 7.5,
    positiveReplies: 2,
    meetings: 0,
    startedAt: '2026-08-06',
    updatedAt: '2026-08-07T01:00:00Z'
  },
  {
    id: 'ob-live-7',
    name: 'Brokers QLD Soft Push',
    status: 'live',
    offer: 'AI Enablement',
    offerKey: 'ai-enablement',
    copyNotes: 'Nick 3-step · assumptive CTA · QLD brokers list B',
    vertical: 'mortgage-brokers',
    location: 'qld',
    leadCount: 1500,
    sendCount: 1120,
    remaining: 380,
    progress: 75,
    replyRate: 3.4,
    positiveReplies: 28,
    meetings: 6,
    startedAt: '2026-07-18',
    updatedAt: '2026-08-05T16:30:00Z'
  },
  {
    id: 'ob-live-8',
    name: 'Agencies Sydney Pilot',
    status: 'paused',
    offer: 'Agency AI Reporting',
    offerKey: 'agency-ai-reporting',
    copyNotes: 'Paused for list hygiene · copy ready · resume next week',
    vertical: 'agencies',
    location: 'nsw',
    leadCount: 480,
    sendCount: 260,
    remaining: 220,
    progress: 54,
    replyRate: 4.6,
    positiveReplies: 9,
    meetings: 2,
    startedAt: '2026-07-25',
    updatedAt: '2026-08-03T09:00:00Z'
  },
  {
    id: 'ob-hist-1',
    name: 'June Electricians Closed',
    status: 'completed',
    offer: 'Switchflow Growth System',
    offerKey: 'growth-system',
    copyNotes: 'Completed · 3-step · archived sequence fork',
    vertical: 'electricians',
    location: 'nsw',
    leadCount: 2000,
    sendCount: 2000,
    remaining: 0,
    progress: 100,
    replyRate: 3.6,
    positiveReplies: 51,
    meetings: 14,
    startedAt: '2026-06-01',
    updatedAt: '2026-06-28T00:00:00Z'
  },
  {
    id: 'ob-hist-2',
    name: 'May Brokers National',
    status: 'completed',
    offer: 'AI Enablement',
    offerKey: 'ai-enablement',
    copyNotes: 'Completed · Connor structure · high lead volume',
    vertical: 'mortgage-brokers',
    location: 'au-national',
    leadCount: 4100,
    sendCount: 4100,
    remaining: 0,
    progress: 100,
    replyRate: 2.7,
    positiveReplies: 74,
    meetings: 16,
    startedAt: '2026-05-04',
    updatedAt: '2026-05-30T00:00:00Z'
  },
  {
    id: 'ob-hist-3',
    name: 'April Tradies QLD',
    status: 'completed',
    offer: 'AI Receptionist System',
    offerKey: 'ai-receptionist-system',
    copyNotes: 'Completed · AIDA · seasonal pause after list exhaust',
    vertical: 'tradies',
    location: 'qld',
    leadCount: 1200,
    sendCount: 1200,
    remaining: 0,
    progress: 100,
    replyRate: 4.0,
    positiveReplies: 33,
    meetings: 7,
    startedAt: '2026-04-02',
    updatedAt: '2026-04-26T00:00:00Z'
  },
  {
    id: 'ob-hist-4',
    name: 'March Agencies Soft Launch',
    status: 'completed',
    offer: 'Agency AI Reporting',
    offerKey: 'agency-ai-reporting',
    copyNotes: 'Completed pilot · low volume · copy iterated to live pack',
    vertical: 'agencies',
    location: 'au-national',
    leadCount: 350,
    sendCount: 350,
    remaining: 0,
    progress: 100,
    replyRate: 6.1,
    positiveReplies: 12,
    meetings: 4,
    startedAt: '2026-03-10',
    updatedAt: '2026-03-28T00:00:00Z'
  }
]

export function listActiveOutboundCampaigns(rows = OUTBOUND_LIVE_DEMO): OutboundLiveCampaign[] {
  const rank = (status: OutboundLiveCampaign['status']) =>
    status === 'live' ? 0 : status === 'launching' ? 1 : 2
  return rows
    .filter((c) => c.status === 'live' || c.status === 'launching' || c.status === 'paused')
    .slice()
    .sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status)
      if (byStatus !== 0) return byStatus
      return b.updatedAt.localeCompare(a.updatedAt)
    })
}

export function listHistoryOutboundCampaigns(rows = OUTBOUND_LIVE_DEMO): OutboundLiveCampaign[] {
  return rows
    .filter((c) => c.status === 'completed')
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
