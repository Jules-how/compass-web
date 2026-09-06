/** Outbound / Copy domain types, scaffolds, and fork-copy helpers. */

export const OUTBOUND_OFFER_KEYS = [
  'growth-system',
  'ai-enablement',
  'ai-receptionist-system',
  'booked-jobs-system',
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

/** source = creator doctrine (Nick Saraev Cold Email/ACC/Nick/Platten/Connor); yours = Switchflow variation */
export const OUTBOUND_PROVENANCES = ['source', 'yours'] as const
export type OutboundProvenance = (typeof OUTBOUND_PROVENANCES)[number]

export type OutboundProvenanceFields = {
  provenance: OutboundProvenance
  source_creator: string | null
  source_file: string | null
}

export function normalizeProvenance(value: unknown): OutboundProvenance {
  return value === 'source' ? 'source' : 'yours'
}

export function yoursProvenance(): OutboundProvenanceFields {
  return { provenance: 'yours', source_creator: null, source_file: null }
}

export function provenanceBadgeLabel(row: Partial<OutboundProvenanceFields>): string {
  if (normalizeProvenance(row.provenance) === 'source') {
    const who = typeof row.source_creator === 'string' && row.source_creator.trim()
      ? row.source_creator.trim()
      : 'Creator'
    return `Source · ${who}`
  }
  return 'Yours'
}

export const OUTBOUND_SLOT_KEYS = [
  'opener',
  'proof_block',
  'cold_expression',
  'cta',
  'interest_mechanism',
  'who_line',
  'why_priorities_and_outcomes',
  'availability_ask',
  'risk_reversal',
  'ps',
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
  gtm_status?: 'live' | 'testing' | 'retired'
  one_sentence?: string | null
  dream_outcome?: string | null
  install_aud?: number | null
  retainer_low_aud?: number | null
  retainer_high_aud?: number | null
  term_days?: number | null
  guarantee?: string | null
  lock?: unknown
} & OutboundProvenanceFields

export type OutboundExpression = {
  id: string
  offer_key: string | null
  label: string
  body: string
  vertical_tags: string[]
  location_tags: string[]
  status: OutboundExpressionStatus | string
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
} & OutboundProvenanceFields

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
} & OutboundProvenanceFields

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
} & OutboundProvenanceFields

export type OutboundSubject = {
  id: string
  label: string
  pattern: string
  notes: string | null
  vertical_tags: string[]
  archived: boolean
  created_at: string
  updated_at: string
} & OutboundProvenanceFields

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
} & OutboundProvenanceFields

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
} & OutboundProvenanceFields

/** Proven / reusable cold-email sequence snapshots (editor Archive tab). */
export type CopyArchiveSource = 'saved' | 'template' | 'campaign'

export type CopyArchiveComponents = {
  offer_key: string | null
  offer_label: string | null
  structure_id: string
  structure_label: string
  opener_mode: string | null
  opener_preview: string | null
  expression_preview: string | null
  cta_preview: string | null
  risk_preview: string | null
  ps_preview: string | null
  subject: string | null
  step_count: number
  slot_keys: string[]
}

export type CopyArchivePerformance = {
  sendCount: number
  replyCount: number
  replyRate: number
  positiveReplies: number
  meetings: number
  leadCount: number
  campaignCount: number
}

export type CopyArchiveEntry = {
  id: string
  name: string
  source: CopyArchiveSource
  source_id: string | null
  vertical_tags: string[]
  location_tags: string[]
  offer_key: string | null
  structure_id: string
  opener_mode: string | null
  sequence: OutboundSequence
  components: CopyArchiveComponents
  performance: CopyArchivePerformance
  last_used_at: string | null
  first_used_at: string | null
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export const COPY_ARCHIVE_SORT_KEYS = ['positive', 'reply', 'last_used', 'sent', 'name'] as const
export type CopyArchiveSortKey = (typeof COPY_ARCHIVE_SORT_KEYS)[number]

export const STRUCTURE_LABELS: Record<string, string> = {
  'nick-4step': 'Nick 4-step',
  'nick-3step': 'Nick 3-step',
  'platten-aida': 'Platten AIDA',
  'connor-3para': 'Connor 3-para'
}

const ARCHIVE_BODY_SLOT_SKIP = new Set(['accountSignature', 'spam_act_opt_out', 'subject'])

function truncatePreview(text: string, max = 72): string | null {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return null
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Derive scannable component labels from a forked sequence + campaign meta. */
export function deriveCopyArchiveComponents(
  sequence: OutboundSequence,
  meta?: {
    offer_key?: string | null
    offer_label?: string | null
    opener_mode?: string | null
  }
): CopyArchiveComponents {
  const email = sequence.steps.find((s) => s.kind === 'email') ?? sequence.steps[0]
  const slotMap = new Map((email?.slots ?? []).map((s) => [s.key, s.body]))
  const slotKeys = (email?.slots ?? [])
    .filter((s) => !ARCHIVE_BODY_SLOT_SKIP.has(s.key) && s.body.trim())
    .map((s) => s.key)
  const structureId = sequence.structure_id || 'nick-3step'
  const offerKey = meta?.offer_key ?? sequence.offer_key ?? null
  return {
    offer_key: offerKey,
    offer_label: meta?.offer_label ?? null,
    structure_id: structureId,
    structure_label: STRUCTURE_LABELS[structureId] ?? structureId,
    opener_mode: meta?.opener_mode ?? null,
    opener_preview: truncatePreview(slotMap.get('opener') ?? ''),
    expression_preview: truncatePreview(slotMap.get('cold_expression') ?? ''),
    cta_preview: truncatePreview(
      slotMap.get('cta') ?? slotMap.get('availability_ask') ?? ''
    ),
    risk_preview: truncatePreview(slotMap.get('risk_reversal') ?? ''),
    ps_preview: truncatePreview(slotMap.get('ps') ?? ''),
    subject: truncatePreview(email?.subject ?? '', 64),
    step_count: sequence.steps.length,
    slot_keys: slotKeys
  }
}

export function emptyCopyArchivePerformance(): CopyArchivePerformance {
  return {
    sendCount: 0,
    replyCount: 0,
    replyRate: 0,
    positiveReplies: 0,
    meetings: 0,
    leadCount: 0,
    campaignCount: 0
  }
}

export function formatRelativeUsedAt(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never used'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return 'Never used'
  const diffMs = Math.max(0, now - then)
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 45) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/** Flatten email step body for preview / insert-into-step. */
export function sequenceEmailBodyText(sequence: OutboundSequence, stepIndex = 0): string {
  const step = sequence.steps[stepIndex]
  if (!step) return ''
  return step.slots
    .filter((s) => !ARCHIVE_BODY_SLOT_SKIP.has(s.key) && s.body.trim())
    .map((s) => s.body.trim())
    .join('\n\n')
}

export const VERTICAL_TAG_HINTS = [
  'electricians',
  'tradies',
  'mortgage-brokers',
  'agencies'
] as const

export const LOCATION_TAG_HINTS = [
  'sydney',
  'melbourne',
  'brisbane',
  'perth',
  'adelaide',
  'gold-coast',
  'canberra',
  'nsw',
  'qld',
  'au-national'
] as const

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
      { key: 'risk_reversal', label: 'Risk reversal' },
      { key: 'cta', label: 'CTA', required: true },
      { key: 'ps', label: 'P.S.' }
    ],
    'nick-3step': [
      { key: 'opener', label: 'Opener', required: true },
      { key: 'cold_expression', label: 'Cold expression', required: true },
      { key: 'risk_reversal', label: 'Risk reversal' },
      { key: 'cta', label: 'CTA', required: true },
      { key: 'ps', label: 'P.S.' }
    ],
    'platten-aida': [
      { key: 'opener', label: 'Opener / Attention', required: true },
      { key: 'interest_mechanism', label: 'Interest', required: true },
      { key: 'proof_block', label: 'Proof / Desire', required: true },
      { key: 'cold_expression', label: 'Cold expression', required: true },
      { key: 'risk_reversal', label: 'Risk reversal' },
      { key: 'cta', label: 'CTA', required: true },
      { key: 'ps', label: 'P.S.' }
    ],
    'connor-3para': [
      { key: 'who_line', label: 'Who line', required: true },
      { key: 'why_priorities_and_outcomes', label: 'Why / priorities & outcomes', required: true },
      { key: 'cold_expression', label: 'Cold expression (optional)' },
      { key: 'risk_reversal', label: 'Risk reversal' },
      { key: 'availability_ask', label: 'Availability ask', required: true },
      { key: 'ps', label: 'P.S.' }
    ]
  }

export const STRUCTURE_DESCRIPTIONS: Record<OutboundStructureId, string> = {
  'nick-4step':
    'When you have proof. Opener → proof → cold expression → CTA. Use when a real peer number exists.',
  'nick-3step':
    'Opener → cold expression → CTA. Use when proof is light or still campaign-gated.',
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

const NAMED_EDIT_SLOT_KEYS = new Set([
  'opener',
  'proof_block',
  'cold_expression',
  'cta',
  'interest_mechanism',
  'who_line',
  'why_priorities_and_outcomes',
  'availability_ask',
  'risk_reversal',
  'ps'
])

export function editableContentSlots(step: OutboundStep): OutboundSlot[] {
  return (step.slots ?? []).filter((slot) => NAMED_EDIT_SLOT_KEYS.has(slot.key))
}

export function usesSlotEditor(step: OutboundStep): boolean {
  return editableContentSlots(step).length > 0
}

function defaultOpenerBody(openerMode?: string | null): string {
  return openerMode === 'none' ? '' : '{{personalization}}'
}

export function emptyEmailStep(
  label = 'Email 1',
  structureId = 'nick-3step',
  openerMode?: string | null
): OutboundStep {
  const slots = structureSlots(structureId)
  const opener = slots.find((slot) => slot.key === 'opener')
  if (opener) opener.body = defaultOpenerBody(openerMode)
  return {
    id: newId('step'),
    kind: 'email',
    label,
    subject: '',
    slots
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
      { key: 'risk_reversal', label: 'Risk reversal', body: '' },
      { key: 'cta', label: 'CTA', required: true, body: '' },
      { key: 'ps', label: 'P.S.', body: '' },
      ...COMPLIANCE_FOOTER_SLOTS.map((s) => ({ ...s }))
    ]
  }
}

export function scaffoldSequence(
  structureId: string,
  options?: { offerKey?: string | null; withFollowUp?: boolean; openerMode?: string | null }
): OutboundSequence {
  const sid = isOutboundStructureId(structureId) ? structureId : 'nick-3step'
  const steps: OutboundStep[] = [emptyEmailStep('Email 1', sid, options?.openerMode)]
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

function insertSlotBeforeCompliance(step: OutboundStep, slot: OutboundSlot) {
  const footerIdx = step.slots.findIndex(
    (s) => s.key === 'accountSignature' || s.key === 'spam_act_opt_out'
  )
  if (footerIdx >= 0) step.slots.splice(footerIdx, 0, slot)
  else step.slots.push(slot)
}

/** Add risk / P.S. (and other scaffold slots) to drafts that predate those keys. */
export function ensureSequenceSlots(sequence: OutboundSequence): OutboundSequence {
  const next = forkSequence(sequence)
  for (const step of next.steps) {
    if (!usesSlotEditor(step)) continue
    const wanted =
      step.kind === 'followup'
        ? emptyFollowUpStep(1, step.delay_days ?? 3).slots
        : structureSlots(next.structure_id)
    const have = new Set(step.slots.map((s) => s.key))
    for (const slot of wanted) {
      if (have.has(slot.key)) continue
      if (slot.key === 'accountSignature' || slot.key === 'spam_act_opt_out') continue
      insertSlotBeforeCompliance(step, { ...slot, body: slot.body || '' })
      have.add(slot.key)
    }
  }
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
  options?: { offerKey?: string | null; preserveBodies?: boolean; openerMode?: string | null }
): OutboundSequence {
  const scaffold = scaffoldSequence(structureId, {
    offerKey: options?.offerKey ?? sequence?.offer_key ?? null,
    withFollowUp: true,
    openerMode: options?.openerMode
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
  const email = scaffold.steps.find((s) => s.kind === 'email')
  const opener = email?.slots.find((s) => s.key === 'opener')
  if (opener && !opener.body.trim()) opener.body = defaultOpenerBody(options?.openerMode)
  return scaffold
}

export function applyOpenerModeToSequence(
  sequence: OutboundSequence,
  openerMode: string | null | undefined
): OutboundSequence {
  const next = forkSequence(sequence)
  const email = next.steps.find((s) => s.kind === 'email') ?? next.steps[0]
  if (!email) return next
  const opener = email.slots.find((s) => s.key === 'opener')
  const body = defaultOpenerBody(openerMode)
  if (opener) {
    opener.body = openerMode === 'none' ? '' : opener.body.trim() || body
  } else if (openerMode !== 'none') {
    email.slots.unshift({ key: 'opener', label: 'Opener', body })
  }
  return next
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

export function compileStepBody(
  step: OutboundStep,
  options?: { includeCompliance?: boolean }
): string {
  const skip = options?.includeCompliance
    ? new Set(['subject'])
    : ARCHIVE_BODY_SLOT_SKIP
  return (step.slots ?? [])
    .filter((slot) => !skip.has(slot.key) && slot.body.trim())
    .map((slot) => slot.body.trim())
    .join('\n\n')
}

export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function inboxPreview(text: string, max = 52): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (!one) return ''
  if (one.length <= max) return one
  return `${one.slice(0, Math.max(1, max - 1))}…`
}

export function openerLooksScrapeTell(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false
  if (/\bhomepage\b/.test(normalized)) return true
  if (/\bstill lists\b/.test(normalized)) return true
  if (/\bi noticed\b/.test(normalized)) return true
  if (/\bsaw that\b/.test(normalized)) return true
  return false
}

export function subjectLooksSignalFragment(subject: string): boolean {
  const trimmed = subject.trim()
  if (!trimmed) return false
  const words = trimmed.split(/\s+/).length
  return words >= 2 && words <= 7 && !trimmed.includes('?')
}

export function sequenceLintWarnings(step: OutboundStep): string[] {
  const compiled = compileStepBody(step)
  const withFooter = compileStepBody(step, { includeCompliance: true })
  const warnings: string[] = []
  const words = wordCount(withFooter)
  if (compiled && (words < 50 || words > 125)) {
    warnings.push(
      `Compiled body is ${words} words (research band is about 50–125, footer included).`
    )
  }
  const opener = step.slots.find((slot) => slot.key === 'opener')?.body ?? ''
  if (
    subjectLooksSignalFragment(step.subject) &&
    (!opener.trim() || openerLooksScrapeTell(opener))
  ) {
    warnings.push('Subject looks like a trigger fragment; opener is empty or a scrape tell.')
  }
  if (subjectLooksBanned(step.subject)) {
    warnings.push('Avoid “quick” subject stems.')
  }
  return warnings
}

export type PillarStatus = 'pass' | 'warn' | 'fail'

export type PillarCheck = {
  id: string
  label: string
  status: PillarStatus
  detail: string
}

export type PillarsQaResult = {
  email1Words: number
  mobileScan: PillarCheck
  pillars: PillarCheck[]
  threading: PillarCheck
  spintax: PillarCheck
}

const ECONOMIC_PASS_RE = /\b(jobs?|revenue|full|capacity|schedule|booked|showed)\b/i
const ECONOMIC_WARN_RE = /\b(ai receptionist|voice agent|\bcrm\b|chatgpt)\b/i
const SIGNAL_PASS_RE = /\{\{\s*(suburb|city|specialty|personalization)\s*\}\}/i
const MECHANISM_PASS_RE =
  /\b(dedicated search|booking line|direct calendar|instead of shared|dedicated (?:google|local) search)\b/i
const MECHANISM_WARN_RE = /\b(chatgpt ads|seo package)\b/i
const CTA_LINK_WARN_RE = /\b(calendly|zoom|15-minute call|15 minute call)\b/i
const RISK_PASS_RE = /\b(refund|pay once booked|covers fees|only pay.{0,40}booked)\b/i
const SPINTAX_RE = /\{[^{}\n]+\|[^{}\n]+\}/g

function stripMergeAndSpintax(text: string): string {
  return text
    .replace(SPINTAX_RE, (match) => {
      const inner = match.slice(1, -1)
      return inner.split('|')[0]?.trim() || ''
    })
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function lastAskSentence(text: string): string {
  const parts = text
    .split(/(?<=[.?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const questions = parts.filter((part) => part.includes('?'))
  return questions[questions.length - 1] || ''
}

function signatureStripped(text: string): string {
  return text
    .replace(/\n(?:Julian|Switchflow)\s*$/gim, '')
    .replace(/\n(?:Julian|Switchflow)\s*\n/gi, '\n')
    .trim()
}

function pillar(
  id: string,
  label: string,
  status: PillarStatus,
  detail: string
): PillarCheck {
  return { id, label, status, detail }
}

export function evaluatePillarsQa(sequence: OutboundSequence | null | undefined): PillarsQaResult {
  const steps = sequence?.steps ?? []
  const email1 = steps.find((step) => step.kind === 'email') ?? steps[0]
  const bump = steps.find((step) => step.kind === 'followup') ?? steps[1]
  const email1Body = signatureStripped(email1 ? compileStepBody(email1) : '')
  const bumpBody = signatureStripped(bump ? compileStepBody(bump) : '')
  const email1Visible = stripMergeAndSpintax(email1Body)
  const email1Words = wordCount(email1Visible)

  let mobileStatus: PillarStatus = 'pass'
  let mobileDetail = `${email1Words} words on Email 1.`
  if (email1Words > 80) {
    mobileStatus = 'fail'
    mobileDetail = `${email1Words} words. Mobile scan flags copy over 80.`
  } else if (email1Words > 60) {
    mobileStatus = 'warn'
    mobileDetail = `${email1Words} words. Stay at 60 or under for mobile scan.`
  }

  const economicWarn = ECONOMIC_WARN_RE.test(email1Body)
  const economicPass = ECONOMIC_PASS_RE.test(email1Visible)
  const signalPass = SIGNAL_PASS_RE.test(email1Body)
  const mechanismWarn = MECHANISM_WARN_RE.test(email1Body)
  const mechanismPass = MECHANISM_PASS_RE.test(email1Visible)
  const ask = lastAskSentence(email1Visible)
  const askWords = wordCount(ask)
  const ctaLink = CTA_LINK_WARN_RE.test(email1Body)
  const riskSlotText = [email1, bump]
    .flatMap((step) => (step?.slots ?? []).filter((s) => s.key === 'risk_reversal').map((s) => s.body))
    .join('\n')
  const riskPass =
    RISK_PASS_RE.test(bumpBody || email1Body) || Boolean(riskSlotText.replace(/\s+/g, ' ').trim())
  const bumpSubject = (bump?.subject || '').trim()
  const spintaxMatches = email1Body.match(SPINTAX_RE) ?? []
  const danglingBrace = /\{(?!\{)[^{}|]*$|\{\s*\}/.test(email1Body)

  const pillars: PillarCheck[] = [
    pillar(
      'economic',
      'Economic outcome',
      economicWarn ? 'fail' : economicPass ? 'pass' : 'warn',
      economicWarn
        ? 'Flagged a tool or feature term. Lead with jobs, capacity, or revenue.'
        : economicPass
          ? 'Jobs, capacity, or revenue language is on Email 1.'
          : 'No jobs / capacity / revenue noun on Email 1.'
    ),
    pillar(
      'signal',
      'Researched signal',
      signalPass ? 'pass' : 'warn',
      signalPass
        ? 'Local or personalization tags are on Email 1.'
        : 'Add {{suburb}}, {{city}}, {{specialty}}, or {{personalization}}.'
    ),
    pillar(
      'mechanism',
      'Novel mechanism',
      mechanismWarn ? 'fail' : mechanismPass ? 'pass' : 'warn',
      mechanismWarn
        ? 'Flagged a generic agency buzzword.'
        : mechanismPass
          ? 'Dedicated search / booking line contrast is present.'
          : 'Spell the mechanism: dedicated search, booking line, or direct calendar.'
    ),
    pillar(
      'cta',
      'Low-friction CTA',
      ctaLink ? 'fail' : ask && askWords <= 20 && ask.includes('?') ? 'pass' : 'warn',
      ctaLink
        ? 'Meeting links (Calendly, Zoom, 15-minute call) are blocked.'
        : ask && askWords <= 20 && ask.includes('?')
          ? `Ask is ${askWords} words with a binary question.`
          : ask
            ? `Ask is ${askWords} words. Keep it at 20 or under with a question mark.`
            : 'No binary question on Email 1.'
    ),
    pillar(
      'risk',
      'Risk reversal',
      riskPass ? 'pass' : bump ? 'warn' : 'warn',
      riskPass
        ? 'Risk reversal is on Email 1 or the bump.'
        : 'Fill the risk reversal slot (refund / pay once booked / covers fees).'
    )
  ]

  return {
    email1Words,
    mobileScan: pillar('mobile', 'Mobile scan', mobileStatus, mobileDetail),
    pillars,
    threading: pillar(
      'thread',
      'Threading guard',
      !bump ? 'warn' : bumpSubject ? 'warn' : 'pass',
      !bump
        ? 'No bump step yet.'
        : bumpSubject
          ? 'Step 2 has a subject. Leave it blank so Instantly threads as Re: {{subject}}.'
          : 'Step 2 subject is empty. Follow-up will thread.'
    ),
    spintax: pillar(
      'spintax',
      'Spintax guard',
      danglingBrace ? 'fail' : spintaxMatches.length ? 'pass' : 'pass',
      danglingBrace
        ? 'Unbalanced spintax brace on Email 1.'
        : spintaxMatches.length
          ? `${spintaxMatches.length} spintax block${spintaxMatches.length === 1 ? '' : 's'} on Email 1.`
          : 'No spintax. Fine if the body is a single variant.'
    )
  }
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

/** Most-relevant library examples shown when an Email components accordion row expands. */
export type LibraryFeaturedExample = {
  id: string
  title: string
  detail: string
}

export const LIBRARY_FEATURED_EXAMPLES: Record<
  LibraryNavKey,
  readonly LibraryFeaturedExample[]
> = {
  offers: [
    {
      id: 'offer-booked-jobs-system',
      title: 'Booked jobs',
      detail: 'Capture then Google then Meta. Showed jobs, not a lead count. Testing. Default for new waves.'
    },
    {
      id: 'offer-growth-system',
      title: 'Growth System (archived)',
      detail: 'Paid-ads booked appointments. Archived. Do not pick for new waves.'
    }
  ],
  expressions: [
    {
      id: 'expr-proof-fill-capture',
      title: 'Booked jobs · proof',
      detail:
        'Tighten the line, then Google search into showed jobs. Do not pitch after-hours cover as the product.'
    },
    {
      id: 'expr-growth-mortgage',
      title: 'Growth System · mortgage brokers (archived)',
      detail: 'Volume guarantee copy. Archived. Do not use on capture waves.'
    }
  ],
  structures: [
    {
      id: 'struct-nick-3step',
      title: 'Nick 3-step',
      detail: 'Opener → cold expression → CTA — thin-proof skeleton'
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
      title: 'Permission',
      detail: 'Mind if I send over {{asset}}?'
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
