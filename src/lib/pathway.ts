/** List-build pathway recipes. Compass stores config. Cursor / list-builds runs it. */

export const PATHWAY_STAGE_IDS = [
  'maps',
  'filter',
  'verify',
  'finder',
  'names',
  'hipages',
  'google_ads',
  'meta_ads',
  'openers'
] as const
export type PathwayStageId = (typeof PATHWAY_STAGE_IDS)[number]

export const PATHWAY_TOOLS = [
  'apify',
  'parallel',
  'firecrawl',
  'filter_leads',
  'generate_openers',
  'skip'
] as const
export type PathwayTool = (typeof PATHWAY_TOOLS)[number]

export const PATHWAY_RUN_STATUSES = [
  'queued',
  'building',
  'ready',
  'reviewed',
  'landed',
  'failed'
] as const
export type PathwayRunStatus = (typeof PATHWAY_RUN_STATUSES)[number]

export type PathwayStage = {
  id: PathwayStageId
  tool: PathwayTool
  skip: boolean
}

export type OpenerSignalWhen = {
  field: string
  op: 'present' | 'eq' | 'contains'
  value?: string
}

export type OpenerTemplateDraft = {
  label: string
  signalWhen: OpenerSignalWhen
  structure: string
  subject: string
  style?: string | null
  sortOrder?: number
}

export const DEFAULT_PATHWAY_STAGES: PathwayStage[] = [
  { id: 'maps', tool: 'apify', skip: false },
  { id: 'filter', tool: 'filter_leads', skip: false },
  { id: 'verify', tool: 'apify', skip: false },
  { id: 'finder', tool: 'apify', skip: false },
  { id: 'names', tool: 'firecrawl', skip: false },
  { id: 'hipages', tool: 'firecrawl', skip: false },
  { id: 'google_ads', tool: 'apify', skip: false },
  { id: 'meta_ads', tool: 'apify', skip: false },
  { id: 'openers', tool: 'generate_openers', skip: false }
]

export const DEFAULT_OPENER_TEMPLATES: OpenerTemplateDraft[] = [
  {
    label: 'Paid demand',
    signalWhen: { field: 'paid_demand', op: 'present' },
    structure:
      'Saw {company} runs paid demand around {suburb}. Reaching out because a lot of paid search clicks walk to voicemail when crews are out on site.',
    subject: '{suburb} paid demand jobs',
    style: 'paid_demand',
    sortOrder: 0
  },
  {
    label: 'Specialty',
    signalWhen: { field: 'specialty', op: 'present' },
    structure: 'Saw {company} handles {specialty} work across {suburb}.',
    subject: '{suburb} {specialty} jobs',
    style: 'specialty',
    sortOrder: 1
  }
]

export function normalizePathwayTool(value: string | null | undefined): PathwayTool {
  if (value && (PATHWAY_TOOLS as readonly string[]).includes(value)) return value as PathwayTool
  return 'apify'
}

export function normalizePathwayRunStatus(value: string | null | undefined): PathwayRunStatus {
  if (value && (PATHWAY_RUN_STATUSES as readonly string[]).includes(value)) {
    return value as PathwayRunStatus
  }
  return 'queued'
}

export function normalizeStages(raw: unknown): PathwayStage[] {
  const byId = new Map<string, PathwayStage>()
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const rec = row as Record<string, unknown>
      const id = String(rec.id || '')
      if (!(PATHWAY_STAGE_IDS as readonly string[]).includes(id)) continue
      byId.set(id, {
        id: id as PathwayStageId,
        tool: normalizePathwayTool(typeof rec.tool === 'string' ? rec.tool : null),
        skip: rec.skip === true || rec.tool === 'skip'
      })
    }
  }
  return DEFAULT_PATHWAY_STAGES.map((stage) => {
    const overlay = byId.get(stage.id)
    if (!overlay) return { ...stage }
    return {
      ...stage,
      tool: overlay.skip ? 'skip' : overlay.tool,
      skip: overlay.skip
    }
  })
}

export function mergeRecipeStages(base: PathwayStage[], overlay: PathwayStage[] | null | undefined): PathwayStage[] {
  if (!overlay || overlay.length === 0) return base.map((stage) => ({ ...stage }))
  const byId = new Map(overlay.map((stage) => [stage.id, stage]))
  return base.map((stage) => {
    const next = byId.get(stage.id)
    return next ? { ...stage, ...next } : { ...stage }
  })
}

export type OpenerFillSlots = {
  firstName?: string | null
  company?: string | null
  suburb?: string | null
  specialty?: string | null
}

export function fillOpenerTemplate(structure: string, slots: OpenerFillSlots): string {
  const company = (slots.company || '').trim() || 'you'
  const suburb = (slots.suburb || '').trim() || 'town'
  const specialty = (slots.specialty || '').trim() || 'the'
  let body = structure
    .replaceAll('{company}', company)
    .replaceAll('{suburb}', suburb)
    .replaceAll('{specialty}', specialty)
    .trim()
  const firstName = (slots.firstName || '').trim()
  if (firstName) {
    if (!/^hi\s/i.test(body)) {
      const rest = body.charAt(0).toLowerCase() + body.slice(1)
      body = `Hi ${firstName}, saw ${rest}`
    }
  } else {
    body = body.replace(/^Hi\s+[^,]+,\s*saw\s+/i, 'Saw ')
    if (/^hi\s/i.test(body)) body = body.replace(/^Hi\s+[^,]+,\s*/i, '')
  }
  return body
}

export function shouldRegenerateOpener(row: { opener_override?: boolean | null }): boolean {
  return row.opener_override !== true
}

export function pickTemplateForSignal(
  templates: Array<{ id: string; signalWhen: OpenerSignalWhen; sortOrder: number }>,
  fields: Record<string, string | null | undefined>
): string | null {
  const ordered = [...templates].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const template of ordered) {
    const raw = fields[template.signalWhen.field]
    const value = (raw || '').trim()
    if (template.signalWhen.op === 'present' && value) return template.id
    if (template.signalWhen.op === 'eq' && value === (template.signalWhen.value || '').trim()) {
      return template.id
    }
    if (
      template.signalWhen.op === 'contains' &&
      value.toLowerCase().includes((template.signalWhen.value || '').trim().toLowerCase())
    ) {
      return template.id
    }
  }
  return null
}
