/** Reader questions and copy levers for the compose desk. */

export const COLD_EMAIL_QUESTIONS = [
  {
    id: 'why-now',
    n: '01',
    question: 'Why them, why now?',
    leverId: 'signal'
  },
  {
    id: 'social-proof',
    n: '02',
    question: 'What relevant social proof can I show?',
    leverId: 'social_proof'
  },
  {
    id: 'looked',
    n: '03',
    question: 'Why believe you looked?',
    leverId: 'specificity'
  },
  {
    id: 'cost',
    n: '04',
    question: 'What does this cost them?',
    leverId: 'pain_money'
  },
  {
    id: 'risk',
    n: '05',
    question: 'What is their risk in saying yes?',
    leverId: 'risk_reversal'
  },
  {
    id: 'cta',
    n: '06',
    question: 'Is the CTA worth taking alone?',
    leverId: 'cta_effort'
  }
] as const

export type ColdEmailLeverId =
  | 'signal'
  | 'segmentation'
  | 'specificity'
  | 'social_proof'
  | 'pain_money'
  | 'risk_reversal'
  | 'effort'
  | 'cta_worth'
  | 'objection'
  | 'reciprocity'

export type ColdEmailLever = {
  id: ColdEmailLeverId
  name: string
  body: string
  slotKeys: string[]
  listWork?: boolean
}

export const COLD_EMAIL_LEVERS: ColdEmailLever[] = [
  {
    id: 'signal',
    name: 'Signal',
    body: 'A specific, verifiable reason you are emailing today, not last year.',
    slotKeys: ['opener']
  },
  {
    id: 'segmentation',
    name: 'Segmentation',
    body: 'The list is filtered so the signal can even exist. Eligibility, not personalization.',
    slotKeys: [],
    listWork: true
  },
  {
    id: 'specificity',
    name: 'Specificity as proof',
    body: 'A detail only someone who actually looked would have.',
    slotKeys: ['opener', 'who_line']
  },
  {
    id: 'social_proof',
    name: 'Social proof',
    body: 'A customer like them, or a result you got. We did this for a company like yours.',
    slotKeys: ['proof_block']
  },
  {
    id: 'pain_money',
    name: 'Pain in money',
    body: 'The cost named in dollars, framed as a loss they are already taking.',
    slotKeys: ['cold_expression', 'why_priorities_and_outcomes']
  },
  {
    id: 'risk_reversal',
    name: 'Risk reversal',
    body: 'You carry the risk. They pay on results, or try it free.',
    slotKeys: ['risk_reversal']
  },
  {
    id: 'effort',
    name: 'Effort asymmetry',
    body: 'The work is half-done before they reply. You spent the hour, not them.',
    slotKeys: ['interest_mechanism', 'ps']
  },
  {
    id: 'cta_worth',
    name: 'CTA worth taking',
    body: 'The call delivers value even if they never buy a thing.',
    slotKeys: ['cta', 'availability_ask']
  },
  {
    id: 'objection',
    name: 'Objection pre-handle',
    body: 'You answer the obvious “but” before they get to think it.',
    slotKeys: ['ps', 'risk_reversal']
  },
  {
    id: 'reciprocity',
    name: 'Reciprocity',
    body: 'You give something real, up front, with no strings on it.',
    slotKeys: ['interest_mechanism', 'ps']
  }
]

export type LeverPull = {
  id: ColdEmailLeverId
  pulled: boolean
  empty: boolean
}

export function sequenceSlotBodies(sequence: { steps?: Array<{ kind?: string; slots?: Array<{ key: string; body: string }> }> } | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  const email = sequence?.steps?.find((s) => s.kind === 'email') ?? sequence?.steps?.[0]
  for (const slot of email?.slots ?? []) {
    map.set(slot.key, (slot.body || '').trim())
  }
  const bump = sequence?.steps?.find((s) => s.kind === 'followup')
  for (const slot of bump?.slots ?? []) {
    const prev = map.get(slot.key) || ''
    const next = (slot.body || '').trim()
    if (next) map.set(slot.key, prev ? `${prev}\n${next}` : next)
  }
  return map
}

export function leverIsPulled(lever: ColdEmailLever, bodies: Map<string, string>): boolean {
  if (lever.listWork) return false
  return lever.slotKeys.some((key) => Boolean(bodies.get(key)))
}

export function countPulledLevers(sequence: { steps?: Array<{ kind?: string; slots?: Array<{ key: string; body: string }> }> } | null | undefined): {
  pulled: number
  copyLevers: number
  pulls: LeverPull[]
} {
  const bodies = sequenceSlotBodies(sequence)
  const copyLevers = COLD_EMAIL_LEVERS.filter((l) => !l.listWork)
  const pulls = COLD_EMAIL_LEVERS.map((lever) => ({
    id: lever.id,
    pulled: leverIsPulled(lever, bodies),
    empty: lever.listWork ? true : !lever.slotKeys.some((key) => Boolean(bodies.get(key)))
  }))
  return {
    pulled: copyLevers.filter((l) => leverIsPulled(l, bodies)).length,
    copyLevers: copyLevers.length,
    pulls
  }
}

function leverIsPulledFromId(id: ColdEmailLeverId, sequence: Parameters<typeof sequenceSlotBodies>[0]): boolean {
  const lever = COLD_EMAIL_LEVERS.find((l) => l.id === id)
  if (!lever) return false
  return leverIsPulled(lever, sequenceSlotBodies(sequence))
}

export function questionIsAnswered(
  question: (typeof COLD_EMAIL_QUESTIONS)[number],
  sequence: Parameters<typeof sequenceSlotBodies>[0]
): boolean {
  if (question.leverId === 'cta_effort') {
    return leverIsPulledFromId('cta_worth', sequence) || leverIsPulledFromId('effort', sequence)
  }
  return leverIsPulledFromId(question.leverId as ColdEmailLeverId, sequence)
}
