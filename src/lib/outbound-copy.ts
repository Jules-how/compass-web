/** Outbound / Copy domain types, scaffolds, and fork-copy helpers. */

export const OUTBOUND_OFFER_KEYS = [
  'growth-system',
  'ai-enablement',
  'ai-receptionist-system',
  'agency-ai-reporting'
] as const
export type OutboundOfferKey = (typeof OUTBOUND_OFFER_KEYS)[number]

export const OUTBOUND_STRUCTURE_IDS = [
  'nick-4step',
  'nick-3step',
  'platten-aida',
  'connor-3para'
] as const
export type OutboundStructureId = (typeof OUTBOUND_STRUCTURE_IDS)[number]

export const OUTBOUND_EXPRESSION_STATUSES = ['approved', 'campaign_gated', 'draft'] as const
export type OutboundExpressionStatus = (typeof OUTBOUND_EXPRESSION_STATUSES)[number]

export const OUTBOUND_CTA_TYPES = [
  'permission',
  'timed_call',
  'interest_check',
  'give_first',
  'assumptive',
  'other'
] as const
export type OutboundCtaType = (typeof OUTBOUND_CTA_TYPES)[number]

export const OUTBOUND_OPENER_MODES = [
  'nick-tier',
  'platten-hook',
  'connor-intel',
  'none',
  'custom'
] as const
export type OutboundOpenerMode = (typeof OUTBOUND_OPENER_MODES)[number]

export const OUTBOUND_COPY_STATUSES = ['none', 'draft', 'ready', 'live'] as const
export type OutboundCopyStatus = (typeof OUTBOUND_COPY_STATUSES)[number]

export const OUTBOUND_SLOT_KEYS = [
  'opener',
  'proof_block',
  'cold_expression',
  'cta',
  'interest_mechanism',
  'who_line',
  'why_priorities_and_outcomes',
  'availability_ask',
  'subject',
  'accountSignature',
  'spam_act_opt_out',
  'custom'
] as const
export type OutboundSlotKey = (typeof OUTBOUND_SLOT_KEYS)[number]

export type OutboundSlot = {
  key: string
  label: string
  required?: boolean
  body: string
}

export type OutboundStep = {
  id: string
  kind: 'email' | 'followup'
  label: string
  delay_days?: number
  subject: string
  slots: OutboundSlot[]
}

export type OutboundSequence = {
  structure_id: string
  offer_key?: string | null
  steps: OutboundStep[]
  updated_at?: string
  template_origin_id?: string | null
}

export type OutboundOffer = {
  id: string
  offer_key: string
  name: string
  pack_summary: string
  positioning_line: string | null
  vertical_tags: string[]
  location_tags: string[]
  sort_order: number
  archived: boolean
  created_at: string
  updated_at: string
}

export type OutboundExpression = {
  id: string
  offer_key: string
  label: string
  body: string
  vertical_tags: string[]
  location_tags: string[]
  status: OutboundExpressionStatus | string
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export type OutboundStructure = {
  id: string
  structure_id: string
  name: string
  description: string | null
  slots: OutboundSlot[]
  is_default_candidate: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export type OutboundCta = {
  id: string
  label: string
  body: string
  cta_type: OutboundCtaType | string
  vertical_tags: string[]
  location_tags: string[]
  is_default: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export type OutboundSubject = {
  id: string
  label: string
  pattern: string
  notes: string | null
  vertical_tags: string[]
  archived: boolean
  created_at: string
  updated_at: string
}

export type OutboundOpener = {
  id: string
  label: string
  opener_mode: OutboundOpenerMode | string
  body: string
  notes: string | null
  vertical_tags: string[]
  archived: boolean
  created_at: string
  updated_at: string
}

export type OutboundTemplate = {
  id: string
  name: string
  offer_key: string | null
  structure_id: string
  vertical_tags: string[]
  location_tags: string[]
  sequence: OutboundSequence
  archived: boolean
  created_at: string
  updated_at: string
}

export const VERTICAL_TAG_HINTS = [
  'electricians',
  'tradies',
  'mortgage-brokers',
  'agencies'
] as const

export const LOCATION_TAG_HINTS = ['nsw', 'qld', 'au-national'] as const

export const COMPLIANCE_FOOTER_SLOTS: OutboundSlot[] = [
  {
    key: 'accountSignature',
    label: 'Account signature',
    required: true,
    body: '{{accountSignature}}'
  },
  {
    key: 'spam_act_opt_out',
    label: 'Spam Act opt-out',
    required: true,
    body: '{{spam_act_opt_out}}'
  }
]

const STRUCTURE_SLOT_MAP: Record<OutboundStructureId, Array<{ key: string; label: string; required?: boolean }>> =
  {
    'nick-4step': [
      { key: 'opener', label: 'Opener', required: true },
      { key: 'proof_block', label: 'Proof', required: true },
      { key: 'cold_expression', label: 'Cold expression', required: true },
      { key: 'cta', label: 'CTA', required: true }
    ],
    'nick-3step': [
      { key: 'opener', label: 'Opener', required: true },
      { key: 'cold_expression', label: 'Cold expression', required: true },
      { key: 'cta', label: 'CTA', required: true }
    ],
    'platten-aida': [
      { key: 'opener', label: 'Opener / Attention', required: true },
      { key: 'interest_mechanism', label: 'Interest', required: true },
      { key: 'proof_block', label: 'Proof / Desire', required: true },
      { key: 'cold_expression', label: 'Cold expression', required: true },
      { key: 'cta', label: 'CTA', required: true }
    ],
    'connor-3para': [
      { key: 'who_line', label: 'Who line', required: true },
      { key: 'why_priorities_and_outcomes', label: 'Why / priorities & outcomes', required: true },
      { key: 'cold_expression', label: 'Cold expression (optional)' },
      { key: 'availability_ask', label: 'Availability ask', required: true }
    ]
  }

export const STRUCTURE_DESCRIPTIONS: Record<OutboundStructureId, string> = {
  'nick-4step':
    'Default when you have proof. Opener → proof → cold expression → CTA. Prefer for campaigns with standing proof.',
  'nick-3step':
    'Thin-proof default. Opener → cold expression → CTA. Use when proof is light or still campaign-gated.',
  'platten-aida': 'AIDA-shaped: opener → interest mechanism → proof → expression → CTA.',
  'connor-3para':
    'Who → why/priorities → optional expression → availability ask. Assumptive CTA only valid here.'
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function normalizeTags(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter(Boolean)
    .slice(0, max)
}

export function normalizeCopyStatus(value: string | undefined | null): OutboundCopyStatus {
  if (value && (OUTBOUND_COPY_STATUSES as readonly string[]).includes(value)) {
    return value as OutboundCopyStatus
  }
  return 'none'
}

export function isOutboundStructureId(value: string): value is OutboundStructureId {
  return (OUTBOUND_STRUCTURE_IDS as readonly string[]).includes(value)
}

export function structureSlots(structureId: string): OutboundSlot[] {
  const id = isOutboundStructureId(structureId) ? structureId : 'nick-3step'
  const core = STRUCTURE_SLOT_MAP[id].map((slot) => ({
    key: slot.key,
    label: slot.label,
    required: slot.required,
    body: ''
  }))
  return [...core, ...COMPLIANCE_FOOTER_SLOTS.map((s) => ({ ...s }))]
}

export function emptyEmailStep(label = 'Email 1', structureId = 'nick-3step'): OutboundStep {
  return {
    id: newId('step'),
    kind: 'email',
    label,
    subject: '',
    slots: structureSlots(structureId)
  }
}

export function emptyFollowUpStep(index = 1, delayDays = 3): OutboundStep {
  return {
    id: newId('step'),
    kind: 'followup',
    label: `Follow-up ${index}`,
    delay_days: delayDays,
    subject: '',
    slots: [
      { key: 'opener', label: 'Bump', body: '' },
      { key: 'cta', label: 'CTA', required: true, body: '' },
      ...COMPLIANCE_FOOTER_SLOTS.map((s) => ({ ...s }))
    ]
  }
}

export function scaffoldSequence(
  structureId: string,
  options?: { offerKey?: string | null; withFollowUp?: boolean }
): OutboundSequence {
  const sid = isOutboundStructureId(structureId) ? structureId : 'nick-3step'
  const steps: OutboundStep[] = [emptyEmailStep('Email 1', sid)]
  if (options?.withFollowUp !== false) {
    steps.push(emptyFollowUpStep(1, 3))
  }
  return {
    structure_id: sid,
    offer_key: options?.offerKey ?? null,
    steps,
    updated_at: new Date().toISOString()
  }
}

type ForkSequenceExtras = Partial<
  Pick<OutboundSequence, 'offer_key' | 'template_origin_id' | 'structure_id'>
> & {
  /** When true, assign fresh step ids (template isolation). Default preserves ids for in-editor edits. */
  remintStepIds?: boolean
}

/** Deep-clone sequence so library/template rows are never mutated by campaign edits. */
export function forkSequence(
  sequence: OutboundSequence,
  extras?: ForkSequenceExtras
): OutboundSequence {
  const { remintStepIds = false, ...sequenceExtras } = extras ?? {}
  const cloned = JSON.parse(JSON.stringify(sequence)) as OutboundSequence
  return {
    ...cloned,
    ...sequenceExtras,
    steps: (cloned.steps ?? []).map((step) => ({
      ...step,
      id: remintStepIds ? newId('step') : step.id,
      slots: (step.slots ?? []).map((slot) => ({ ...slot }))
    })),
    updated_at: new Date().toISOString()
  }
}

export function copyTextIntoSlot(
  sequence: OutboundSequence,
  stepId: string,
  slotKey: string,
  body: string
): OutboundSequence {
  const next = forkSequence(sequence)
  next.template_origin_id = sequence.template_origin_id ?? null
  for (const step of next.steps) {
    if (step.id !== stepId) continue
    const slot = step.slots.find((s) => s.key === slotKey)
    if (slot) {
      slot.body = body
    } else {
      step.slots.push({ key: slotKey, label: slotKey, body })
    }
  }
  next.updated_at = new Date().toISOString()
  return next
}

export function setStepSubject(sequence: OutboundSequence, stepId: string, subject: string): OutboundSequence {
  const next = forkSequence(sequence)
  next.template_origin_id = sequence.template_origin_id ?? null
  for (const step of next.steps) {
    if (step.id === stepId) step.subject = subject
  }
  next.updated_at = new Date().toISOString()
  return next
}

export function applyStructureScaffold(
  sequence: OutboundSequence | null | undefined,
  structureId: string,
  options?: { offerKey?: string | null; preserveBodies?: boolean }
): OutboundSequence {
  const scaffold = scaffoldSequence(structureId, {
    offerKey: options?.offerKey ?? sequence?.offer_key ?? null,
    withFollowUp: true
  })
  if (!options?.preserveBodies || !sequence?.steps?.length) return scaffold

  const prevEmail = sequence.steps.find((s) => s.kind === 'email')
  const nextEmail = scaffold.steps.find((s) => s.kind === 'email')
  if (prevEmail && nextEmail) {
    nextEmail.subject = prevEmail.subject
    for (const slot of nextEmail.slots) {
      const prev = prevEmail.slots.find((s) => s.key === slot.key)
      if (prev) slot.body = prev.body
    }
  }
  const prevFu = sequence.steps.filter((s) => s.kind === 'followup')
  const nextFu = scaffold.steps.filter((s) => s.kind === 'followup')
  nextFu.forEach((step, i) => {
    const prev = prevFu[i]
    if (!prev) return
    step.subject = prev.subject
    step.delay_days = prev.delay_days
    for (const slot of step.slots) {
      const matched = prev.slots.find((s) => s.key === slot.key)
      if (matched) slot.body = matched.body
    }
  })
  return scaffold
}

export function coldExpressionFromSequence(sequence: OutboundSequence | null | undefined): string | null {
  if (!sequence?.steps?.length) return null
  const email = sequence.steps.find((s) => s.kind === 'email') ?? sequence.steps[0]
  const slot = email.slots.find((s) => s.key === 'cold_expression')
  const body = slot?.body?.trim()
  return body || null
}

export function ctaFromSequence(sequence: OutboundSequence | null | undefined): string | null {
  if (!sequence?.steps?.length) return null
  const email = sequence.steps.find((s) => s.kind === 'email') ?? sequence.steps[0]
  const slot = email.slots.find((s) => s.key === 'cta' || s.key === 'availability_ask')
  const body = slot?.body?.trim()
  return body || null
}

export function previewExpression(text: string | null | undefined, max = 200): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

/** Soft-warn helper: subjects must not use "quick question" stems. */
export function subjectLooksBanned(subject: string): boolean {
  const normalized = subject.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.includes('quick question')) return true
  if (/^quick\b/.test(normalized)) return true
  return false
}

export function isValidSequence(value: unknown): value is OutboundSequence {
  if (!value || typeof value !== 'object') return false
  const seq = value as OutboundSequence
  if (typeof seq.structure_id !== 'string' || !seq.structure_id) return false
  if (!Array.isArray(seq.steps)) return false
  return seq.steps.every(
    (step) =>
      step &&
      typeof step.id === 'string' &&
      (step.kind === 'email' || step.kind === 'followup') &&
      typeof step.label === 'string' &&
      typeof step.subject === 'string' &&
      Array.isArray(step.slots) &&
      step.slots.every(
        (slot) =>
          slot &&
          typeof slot.key === 'string' &&
          typeof slot.label === 'string' &&
          typeof slot.body === 'string'
      )
  )
}

export function copyStatusLabel(status: string): string {
  switch (status) {
    case 'none':
      return 'No copy'
    case 'draft':
      return 'Draft'
    case 'ready':
      return 'Ready'
    case 'live':
      return 'Live'
    default:
      return status
  }
}

export const LIBRARY_NAV = [
  { key: 'offers', href: '/sales/outbound/offers', label: 'Offers', blurb: 'Pack offer keys + short summaries' },
  {
    key: 'expressions',
    href: '/sales/outbound/expressions',
    label: 'Expressions',
    blurb: 'Cold X-in-Y-or-Z lines'
  },
  {
    key: 'structures',
    href: '/sales/outbound/structures',
    label: 'Structures',
    blurb: 'Slot-order skeletons'
  },
  { key: 'ctas', href: '/sales/outbound/ctas', label: 'CTAs', blurb: 'One ask per email' },
  { key: 'subjects', href: '/sales/outbound/subjects', label: 'Subjects', blurb: 'Subject patterns' },
  { key: 'openers', href: '/sales/outbound/openers', label: 'Openers', blurb: 'Opener modes' },
  {
    key: 'templates',
    href: '/sales/outbound/templates',
    label: 'Templates',
    blurb: 'Multi-step sequence forks'
  }
] as const

export type LibraryNavKey = (typeof LIBRARY_NAV)[number]['key']

/** Two most-relevant library examples shown when an Email components accordion row expands. */
export type LibraryFeaturedExample = {
  id: string
  title: string
  detail: string
}

export const LIBRARY_FEATURED_EXAMPLES: Record<
  LibraryNavKey,
  readonly [LibraryFeaturedExample, LibraryFeaturedExample]
> = {
  offers: [
    {
      id: 'offer-growth-system',
      title: 'Growth System',
      detail: 'Qualified booked appointments from paid ads — hybrid signup + retainer + performance'
    },
    {
      id: 'offer-ai-enablement',
      title: 'AI enablement',
      detail: 'Install marketing, quote follow-up, and review tools in-house; install fee refund path'
    }
  ],
  expressions: [
    {
      id: 'expr-growth-mortgage',
      title: 'Growth System · mortgage brokers',
      detail:
        "I'll get you {{bookedN}} booked borrower chats in the first 30 days after access and budget are live, or I refund the setup fee in full."
    },
    {
      id: 'expr-ai-enablement-tradies',
      title: 'AI Enablement · tradies',
      detail:
        'Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back.'
    }
  ],
  structures: [
    {
      id: 'struct-nick-3step',
      title: 'Nick 3-step',
      detail: 'Opener → cold expression → CTA — default thin-proof skeleton'
    },
    {
      id: 'struct-nick-4step',
      title: 'Nick 4-step',
      detail: 'Opener → proof → cold expression → CTA — when social proof earns a slot'
    }
  ],
  ctas: [
    {
      id: 'cta-permission-default',
      title: 'Permission default',
      detail: 'Mind if I send over {{asset}}?'
    },
    {
      id: 'cta-timed-call',
      title: 'Timed call',
      detail: 'Would you be open to 15 minutes? If so, I can ring at {{t1}} or {{t2}}.'
    }
  ],
  subjects: [
    {
      id: 'subj-colleague-register',
      title: 'Colleague register',
      detail: '{{companyName}} / {{firstName}}'
    },
    {
      id: 'subj-outcome-stem',
      title: 'Outcome stem',
      detail: '{{outcome}} for {{companyName}}'
    }
  ],
  openers: [
    {
      id: 'opener-nick-tier',
      title: 'Nick tier',
      detail: 'Research-backed fact — usually filled per lead via Instantly vars'
    },
    {
      id: 'opener-platten-hook',
      title: 'Platten hook',
      detail: 'Optional hook-style opener for AIDA-style sequences'
    }
  ],
  templates: [
    {
      id: 'tmpl-thin-proof-nick-3',
      title: 'Thin proof · nick-3step',
      detail: 'Forkable 3-step with permission CTA and cold-expression placeholder'
    },
    {
      id: 'tmpl-ai-enablement-tradies',
      title: 'AI Enablement · tradies',
      detail: 'Enablement expression + dream-ask CTA on nick-3step'
    }
  ]
}
