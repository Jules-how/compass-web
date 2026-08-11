/** Mock data for the outbound compare mockup — not wired to Instantly. */

export type MockCampaignStatus = 'live' | 'paused' | 'completed'

export type MockEmailStep = {
  step: number
  subject: string
  body: string
  sent: number
  replies: number
  replyRate: number
  waitDays?: number
}

export type MockCampaign = {
  id: string
  name: string
  status: MockCampaignStatus
  vertical: string
  location: string
  structureId: string
  structureLabel: string
  offer: string
  expression: string
  cta: string
  ctaType: string
  sent: number
  opens: number
  replies: number
  positive: number
  meetings: number
  bounces: number
  emails: MockEmailStep[]
}

export const MOCK_MIN_SENT = 200

function cleaningNick3Emails(
  city: string,
  metrics: Array<{ sent: number; replies: number; replyRate: number }>
): MockEmailStep[] {
  return [
    {
      step: 1,
      subject: `{{companyName}} — after-hours calls in ${city}`,
      body: `Hey {{firstName}},

Noticed a few ${city} cleaning companies losing booked jobs when the phone rings after 5.

We catch those calls and book them straight into your calendar — no new hire.

Mind if I send a 60-sec loom?`,
      waitDays: 0,
      ...metrics[0]
    },
    {
      step: 2,
      subject: `re: after-hours in ${city}`,
      body: `{{firstName}} — quick bump.

If after-hours is already covered, ignore this.

If not, happy to send the short clip showing how cleaners in ${city} are catching those jobs.`,
      waitDays: 3,
      ...metrics[1]
    },
    {
      step: 3,
      subject: `closing the loop`,
      body: `Last note from me.

If timing’s off, no stress — I’ll leave it here.

If you want the loom, just reply “send it”.`,
      waitDays: 5,
      ...metrics[2]
    }
  ]
}

function cleaningNick4Emails(
  metrics: Array<{ sent: number; replies: number; replyRate: number }>
): MockEmailStep[] {
  return [
    {
      step: 1,
      subject: '{{companyName}} — missed calls after hours',
      body: `Hey {{firstName}},

Sydney cleaners keep telling me the same thing: the job goes to whoever answers first after 5pm.

We pick up those calls and book them while you’re off the tools.

Open to a quick look this week?`,
      waitDays: 0,
      ...metrics[0]
    },
    {
      step: 2,
      subject: 're: missed calls',
      body: `{{firstName}} —

If you’ve already sorted after-hours, all good.

If not, I can show you how it looks in practice in under a minute.`,
      waitDays: 2,
      ...metrics[1]
    },
    {
      step: 3,
      subject: 'one more idea',
      body: `One more angle: most of the value isn’t “answering the phone” — it’s not losing the Saturday clean that would’ve paid for the month.

Worth a peek?`,
      waitDays: 4,
      ...metrics[2]
    },
    {
      step: 4,
      subject: 'last one',
      body: `I’ll close this out.

Reply “yes” and I’ll send the loom. Otherwise I’ll assume it’s not a fit right now.`,
      waitDays: 5,
      ...metrics[3]
    }
  ]
}

export const MOCK_CAMPAIGNS: MockCampaign[] = [
  {
    id: 'bne-clean-nick3',
    name: 'Cleaning · Brisbane · nick-3',
    status: 'live',
    vertical: 'Cleaning',
    location: 'Brisbane',
    structureId: 'nick-3step',
    structureLabel: 'Nick 3-step',
    offer: 'Growth System',
    expression: 'Missed calls after hours are costing cleaners jobs — we catch them.',
    cta: 'Mind if I send a 60-sec loom?',
    ctaType: 'permission',
    sent: 820,
    opens: 410,
    replies: 54,
    positive: 18,
    meetings: 7,
    bounces: 12,
    emails: cleaningNick3Emails('Brisbane', [
      { sent: 820, replies: 31, replyRate: 3.8 },
      { sent: 640, replies: 16, replyRate: 2.5 },
      { sent: 410, replies: 7, replyRate: 1.7 }
    ])
  },
  {
    id: 'syd-clean-nick3',
    name: 'Cleaning · Sydney · nick-3',
    status: 'live',
    vertical: 'Cleaning',
    location: 'Sydney',
    structureId: 'nick-3step',
    structureLabel: 'Nick 3-step',
    offer: 'Growth System',
    expression: 'Missed calls after hours are costing cleaners jobs — we catch them.',
    cta: 'Mind if I send a 60-sec loom?',
    ctaType: 'permission',
    sent: 910,
    opens: 448,
    replies: 41,
    positive: 11,
    meetings: 4,
    bounces: 18,
    emails: cleaningNick3Emails('Sydney', [
      { sent: 910, replies: 22, replyRate: 2.4 },
      { sent: 700, replies: 13, replyRate: 1.9 },
      { sent: 460, replies: 6, replyRate: 1.3 }
    ])
  },
  {
    id: 'syd-clean-nick4',
    name: 'Cleaning · Sydney · nick-4',
    status: 'live',
    vertical: 'Cleaning',
    location: 'Sydney',
    structureId: 'nick-4step',
    structureLabel: 'Nick 4-step',
    offer: 'Growth System',
    expression: 'Missed calls after hours are costing cleaners jobs — we catch them.',
    cta: 'Open to a quick look this week?',
    ctaType: 'interest_check',
    sent: 640,
    opens: 290,
    replies: 38,
    positive: 14,
    meetings: 6,
    bounces: 9,
    emails: cleaningNick4Emails([
      { sent: 640, replies: 18, replyRate: 2.8 },
      { sent: 500, replies: 11, replyRate: 2.2 },
      { sent: 360, replies: 6, replyRate: 1.7 },
      { sent: 220, replies: 3, replyRate: 1.4 }
    ])
  },
  {
    id: 'mel-hvac-nick3',
    name: 'HVAC · Melbourne · nick-3',
    status: 'live',
    vertical: 'HVAC',
    location: 'Melbourne',
    structureId: 'nick-3step',
    structureLabel: 'Nick 3-step',
    offer: 'AI Receptionist',
    expression: 'After-hours HVAC calls going to voicemail — we book them while you sleep.',
    cta: 'Mind if I send over how it works?',
    ctaType: 'permission',
    sent: 540,
    opens: 270,
    replies: 29,
    positive: 9,
    meetings: 3,
    bounces: 8,
    emails: [
      {
        step: 1,
        subject: '{{companyName}} — after-hours breakdowns',
        body: `Hey {{firstName}},

Melbourne HVAC jobs don’t stop at 5 — but a lot of phones do.

We answer those calls and book the job while you’re off the tools.

Mind if I send over how it works?`,
        sent: 540,
        replies: 16,
        replyRate: 3.0,
        waitDays: 0
      },
      {
        step: 2,
        subject: 're: after-hours',
        body: `{{firstName}} — bumping this once.

If after-hours is covered, ignore me.

If not, happy to show the setup in a short note.`,
        sent: 410,
        replies: 9,
        replyRate: 2.2,
        waitDays: 3
      },
      {
        step: 3,
        subject: 'closing the loop',
        body: `Last note — reply “send it” if you want the overview. Otherwise I’ll leave it.`,
        sent: 280,
        replies: 4,
        replyRate: 1.4,
        waitDays: 5
      }
    ]
  },
  {
    id: 'bne-clean-aida',
    name: 'Cleaning · Brisbane · AIDA',
    status: 'paused',
    vertical: 'Cleaning',
    location: 'Brisbane',
    structureId: 'platten-aida',
    structureLabel: 'Platten AIDA',
    offer: 'Growth System',
    expression: 'Brisbane cleaners losing booked jobs to the competitor who answers first.',
    cta: 'Worth a 10-min look Thu/Fri?',
    ctaType: 'timed_call',
    sent: 310,
    opens: 120,
    replies: 12,
    positive: 3,
    meetings: 1,
    bounces: 7,
    emails: [
      {
        step: 1,
        subject: 'Brisbane cleaners losing jobs after 5',
        body: `Hey {{firstName}},

Attention: the cleaner who answers first usually gets the job.

Interest: most Brisbane operators we talk to are losing 2–4 booked cleans a week to after-hours voicemail.

Desire: we catch the call, qualify, and put it on your calendar before the lead cools off.

Worth a 10-min look Thu/Fri?`,
        sent: 310,
        replies: 7,
        replyRate: 2.3,
        waitDays: 0
      },
      {
        step: 2,
        subject: 're: after 5',
        body: `{{firstName}} — still curious if after-hours leakage is a real cost for {{companyName}}.

Happy to walk through a live example Thu or Fri.`,
        sent: 240,
        replies: 3,
        replyRate: 1.3,
        waitDays: 4
      },
      {
        step: 3,
        subject: 'last ping',
        body: `Closing this out. If timing’s better later, just reply and I’ll come back around.`,
        sent: 160,
        replies: 2,
        replyRate: 1.3,
        waitDays: 6
      }
    ]
  },
  {
    id: 'gc-plumb-nick3',
    name: 'Plumbing · Gold Coast · nick-3',
    status: 'completed',
    vertical: 'Plumbing',
    location: 'Gold Coast',
    structureId: 'nick-3step',
    structureLabel: 'Nick 3-step',
    offer: 'AI Receptionist',
    expression: 'Emergency plumbing calls at 9pm — we pick up so you don’t lose the job.',
    cta: 'Mind if I send a short clip?',
    ctaType: 'permission',
    sent: 480,
    opens: 210,
    replies: 19,
    positive: 5,
    meetings: 2,
    bounces: 11,
    emails: [
      {
        step: 1,
        subject: '{{companyName}} — 9pm emergency calls',
        body: `Hey {{firstName}},

Emergency plumbing calls at 9pm shouldn’t go to voicemail — that’s usually the job that pays for the week.

We pick up and book them so you don’t lose it.

Mind if I send a short clip?`,
        sent: 480,
        replies: 11,
        replyRate: 2.3,
        waitDays: 0
      },
      {
        step: 2,
        subject: 're: emergency calls',
        body: `{{firstName}} — quick bump. If nights are already covered, ignore this.`,
        sent: 360,
        replies: 5,
        replyRate: 1.4,
        waitDays: 3
      },
      {
        step: 3,
        subject: 'closing the loop',
        body: `Last note from me. Reply “send it” if you want the clip.`,
        sent: 240,
        replies: 3,
        replyRate: 1.3,
        waitDays: 5
      }
    ]
  },
  {
    id: 'syd-clean-low-n',
    name: 'Cleaning · Sydney · early test',
    status: 'live',
    vertical: 'Cleaning',
    location: 'Sydney',
    structureId: 'nick-3step',
    structureLabel: 'Nick 3-step',
    offer: 'Growth System',
    expression: 'Short test — same expression, thin volume.',
    cta: 'Mind if I send a 60-sec loom?',
    ctaType: 'permission',
    sent: 90,
    opens: 40,
    replies: 6,
    positive: 2,
    meetings: 1,
    bounces: 2,
    emails: cleaningNick3Emails('Sydney', [
      { sent: 90, replies: 4, replyRate: 4.4 },
      { sent: 60, replies: 2, replyRate: 3.3 },
      { sent: 30, replies: 0, replyRate: 0 }
    ]).slice(0, 2)
  }
]

export type FactorKey = 'location' | 'vertical' | 'structure' | 'offer' | 'cta'

export function rate(n: number, d: number) {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}

export function factorValue(c: MockCampaign, key: FactorKey): string {
  if (key === 'location') return c.location
  if (key === 'vertical') return c.vertical
  if (key === 'structure') return c.structureLabel
  if (key === 'offer') return c.offer
  return c.cta
}

export type FactorRow = {
  key: string
  subtitle?: string
  campaigns: number
  sent: number
  replies: number
  replyRate: number
  positive: number
  meetings: number
  thin: boolean
  campaignIds: string[]
}

export function rollup(campaigns: MockCampaign[], key: FactorKey): FactorRow[] {
  const map = new Map<string, FactorRow>()
  for (const c of campaigns) {
    const k = factorValue(c, key)
    const cur = map.get(k) ?? {
      key: k,
      subtitle: key === 'cta' ? c.ctaType.replace(/_/g, ' ') : undefined,
      campaigns: 0,
      sent: 0,
      replies: 0,
      replyRate: 0,
      positive: 0,
      meetings: 0,
      thin: false,
      campaignIds: []
    }
    cur.campaigns += 1
    cur.sent += c.sent
    cur.replies += c.replies
    cur.positive += c.positive
    cur.meetings += c.meetings
    cur.campaignIds.push(c.id)
    map.set(k, cur)
  }
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      replyRate: rate(row.replies, row.sent),
      thin: row.sent < MOCK_MIN_SENT
    }))
    .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent)
}

export type GeoPoint = {
  label: string
  targeted: number
  successes: number
  successRate: number
  heat: number
}

export function geoFromCampaigns(campaigns: MockCampaign[]): GeoPoint[] {
  const map = new Map<string, { targeted: number; successes: number }>()
  for (const c of campaigns) {
    const cur = map.get(c.location) ?? { targeted: 0, successes: 0 }
    cur.targeted += c.sent
    cur.successes += c.positive + c.meetings
    map.set(c.location, cur)
  }
  const rows = Array.from(map.entries()).map(([label, v]) => ({
    label,
    targeted: v.targeted,
    successes: v.successes,
    successRate: rate(v.successes, v.targeted),
    heat: 0
  }))
  const max = Math.max(...rows.map((r) => r.successRate), 0.1)
  return rows
    .map((r) => ({ ...r, heat: r.successRate / max }))
    .sort((a, b) => b.successRate - a.successRate)
}
