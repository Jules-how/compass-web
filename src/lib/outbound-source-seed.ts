/**
 * Converts vault creator-source inventory into Compass library rows.
 * Inventory: outbound-source-inventory.json (from playbook libraries).
 */

import inventory from '@/lib/outbound-source-inventory.json'
import {
  structureSlots,
  type OutboundCta,
  type OutboundCtaType,
  type OutboundExpression,
  type OutboundOpener,
  type OutboundProvenance,
  type OutboundSequence,
  type OutboundStructure,
  type OutboundSubject,
  type OutboundTemplate
} from '@/lib/outbound-copy'
import { isDoctrineOpener } from '@/lib/outbound-library-filter'

const STAMP = '2026-08-10T00:00:00.000Z'

const COMPLIANCE = [
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

type InvExpr = {
  id_slug: string
  label: string
  body: string
  creator: string
  source_file: string
  notes?: string | null
}

type InvStruct = {
  structure_id: string
  name: string
  description: string
  creator: string
  source_file: string
}

type InvCta = {
  id_slug: string
  label: string
  body: string
  cta_type: string
  creator: string
  source_file: string
  notes?: string | null
}

type InvSubj = {
  id_slug: string
  label: string
  pattern: string
  creator: string
  source_file: string
  notes?: string | null
}

type InvOpener = {
  id_slug: string
  label: string
  opener_mode: string
  body: string
  creator: string
  source_file: string
  notes?: string | null
}

type InvTmpl = {
  id_slug: string
  name: string
  structure_id: string
  subject: string | null
  email_body: string | null
  followup_body: string | null
  creator: string
  source_file: string
  notes?: string | null
}

function provenanceMeta(creator: string, sourceFile: string): {
  provenance: OutboundProvenance
  source_creator: string
  source_file: string
} {
  return {
    provenance: 'source',
    source_creator: creator,
    source_file: sourceFile
  }
}

function normalizeCtaType(raw: string): OutboundCtaType | string {
  const t = raw.trim().toLowerCase().replace(/-/g, '_')
  if (t === 'timed_call' || t === 'timedcall') return 'timed_call'
  if (t === 'interest_check' || t === 'interestcheck') return 'interest_check'
  if (t === 'give_first' || t === 'givefirst') return 'give_first'
  if (t === 'permission') return 'permission'
  if (t === 'assumptive') return 'assumptive'
  return t || 'other'
}

function structureRowId(structureId: string): string {
  return `struct-${structureId}`
}

function buildSequenceFromExample(item: InvTmpl): OutboundSequence {
  const structureId = item.structure_id || 'nick-3step'
  const steps: OutboundSequence['steps'] = []
  const emailBody = (item.email_body ?? '').trim()
  const isPlaceholder =
    !emailBody ||
    emailBody === '{{email_1}}' ||
    emailBody === '{{email_1_body}}' ||
    emailBody === '{{email_1_body}}'

  if (emailBody && !isPlaceholder) {
    steps.push({
      id: `step-${item.id_slug}-1`,
      kind: 'email',
      label: 'Email 1',
      subject: item.subject ?? '',
      slots: [
        { key: 'custom', label: 'Full example body', body: emailBody },
        ...COMPLIANCE.map((s) => ({ ...s }))
      ]
    })
  }

  const fu = (item.followup_body ?? '').trim()
  if (fu) {
    steps.push({
      id: `step-${item.id_slug}-fu`,
      kind: 'followup',
      label: 'Follow-up 1',
      delay_days: 3,
      subject: '',
      slots: [
        { key: 'opener', label: 'Bump / follow-up', body: fu },
        { key: 'cta', label: 'CTA', required: true, body: '' },
        ...COMPLIANCE.map((s) => ({ ...s }))
      ]
    })
  }

  if (steps.length === 0) {
    steps.push({
      id: `step-${item.id_slug}-1`,
      kind: 'email',
      label: 'Email 1',
      subject: item.subject ?? '',
      slots: [
        {
          key: 'custom',
          label: 'Full example body',
          body: emailBody || '(Follow-up-only / scaffold — fill Email 1 from campaign)'
        },
        ...COMPLIANCE.map((s) => ({ ...s }))
      ]
    })
  }

  return {
    structure_id: structureId,
    offer_key: null,
    steps,
    updated_at: STAMP
  }
}

export function sourceExpressions(): OutboundExpression[] {
  return (inventory.expressions as InvExpr[]).map((item) => ({
    id: item.id_slug,
    offer_key: null,
    label: `[Source · ${item.creator}] ${item.label}`,
    body: item.body,
    vertical_tags: [],
    location_tags: [],
    status: 'draft',
    notes: [item.notes, `Source file: ${item.source_file}`].filter(Boolean).join(' · ') || null,
    archived: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...provenanceMeta(item.creator, item.source_file)
  }))
}

export function sourceStructures(): OutboundStructure[] {
  return (inventory.structures as InvStruct[]).map((item) => ({
    id: structureRowId(item.structure_id),
    structure_id: item.structure_id,
    name: item.name,
    description: `${item.description} [Source · ${item.creator} · ${item.source_file}]`,
    slots: structureSlots(item.structure_id),
    is_default_candidate: item.structure_id === 'nick-4step' || item.structure_id === 'nick-3step',
    archived: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...provenanceMeta(item.creator, item.source_file)
  }))
}

export function sourceCtas(): OutboundCta[] {
  return (inventory.ctas as InvCta[]).map((item) => ({
    id: item.id_slug,
    label: `[Source · ${item.creator}] ${item.label}`,
    body: item.body,
    cta_type: normalizeCtaType(item.cta_type),
    vertical_tags: [],
    location_tags: [],
    is_default: false,
    archived: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...provenanceMeta(item.creator, item.source_file)
  }))
}

export function sourceSubjects(): OutboundSubject[] {
  return (inventory.subjects as InvSubj[]).map((item) => ({
    id: item.id_slug,
    label: `[Source · ${item.creator}] ${item.label}`,
    pattern: item.pattern,
    notes: [item.notes, `Source file: ${item.source_file}`].filter(Boolean).join(' · ') || null,
    vertical_tags: [],
    archived: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...provenanceMeta(item.creator, item.source_file)
  }))
}

export function sourceOpeners(): OutboundOpener[] {
  return (inventory.openers as InvOpener[]).map((item) => {
    const doctrine = isDoctrineOpener({ label: item.label, body: item.body, notes: item.notes })
    return {
      id: item.id_slug,
      label: `[Source · ${item.creator}] ${item.label}`,
      opener_mode: item.opener_mode || 'custom',
      body: item.body,
      notes:
        [item.notes, doctrine ? 'insertable:no' : '', `Source file: ${item.source_file}`]
          .filter(Boolean)
          .join(' · ') || null,
      vertical_tags: [],
      archived: false,
      created_at: STAMP,
      updated_at: STAMP,
      ...provenanceMeta(item.creator, item.source_file)
    }
  })
}

export function sourceTemplates(): OutboundTemplate[] {
  return (inventory.templates as InvTmpl[]).map((item) => ({
    id: item.id_slug,
    name: `[Source · ${item.creator}] ${item.name}`,
    offer_key: null,
    structure_id: item.structure_id || 'nick-3step',
    vertical_tags: [],
    location_tags: [],
    sequence: buildSequenceFromExample(item),
    archived: false,
    created_at: STAMP,
    updated_at: STAMP,
    ...provenanceMeta(item.creator, item.source_file)
  }))
}

export function sourceInventoryCounts() {
  return {
    expressions: sourceExpressions().length,
    structures: sourceStructures().length,
    ctas: sourceCtas().length,
    subjects: sourceSubjects().length,
    openers: sourceOpeners().length,
    templates: sourceTemplates().length
  }
}
