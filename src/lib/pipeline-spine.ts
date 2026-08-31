/** Pipeline spine stages and deep links for operator navigation. */

export const LEAD_PIPELINE_STAGES = [
  'Lead',
  'Contacted',
  'Replied',
  'Call booked',
  'Proposal sent',
  'Signed'
] as const

export const CLIENT_PIPELINE_STAGES = [
  'Onboarding',
  'Delivery build',
  'Live',
  'Scaling'
] as const

export type LeadPipelineStage = (typeof LEAD_PIPELINE_STAGES)[number]
export type ClientPipelineStage = (typeof CLIENT_PIPELINE_STAGES)[number]
export type PipelineStage = LeadPipelineStage | ClientPipelineStage

const OFF_SPINE_OUTBOUND = new Set([
  'not_interested',
  'suppressed',
  'wrong_person',
  'bounced',
  'unsubscribed'
])

/** Map Instantly / CRM outbound_status → lead pipeline stage. */
export function leadStageFromOutbound(outbound: string | null | undefined): LeadPipelineStage {
  switch ((outbound || '').trim().toLowerCase()) {
    case 'contacted':
    case 'in_instantly':
      return 'Contacted'
    case 'replied':
    case 'interested':
    case 'out_of_office':
      return 'Replied'
    case 'meeting_booked':
    case 'booked':
      return 'Call booked'
    case 'converted':
      return 'Signed'
    case 'uncontacted':
    case 'not_uploaded':
    default:
      return 'Lead'
  }
}

export function isOffSpineOutbound(outbound: string | null | undefined): boolean {
  return OFF_SPINE_OUTBOUND.has((outbound || '').trim().toLowerCase())
}

export type ClientStageContext = {
  status?: string | null
  pipeline_stage?: string | null
  has_live_voice?: boolean
  delivery_project_live?: boolean
  deal_status?: string | null
}

/** Resolve client pipeline stage from status + delivery signals. */
export function clientStageFromContext(ctx: ClientStageContext): ClientPipelineStage {
  if (ctx.pipeline_stage && CLIENT_PIPELINE_STAGES.includes(ctx.pipeline_stage as ClientPipelineStage)) {
    return ctx.pipeline_stage as ClientPipelineStage
  }
  const status = (ctx.status || '').trim().toLowerCase()
  if (status === 'paused') return 'Scaling'
  if (ctx.has_live_voice || ctx.delivery_project_live) return 'Live'
  if (status === 'active') return 'Delivery build'
  return 'Onboarding'
}

/** Operator deep link for a spine stage. */
export function stageToolHref(
  stage: PipelineStage,
  ctx?: { clientId?: string; projectId?: string }
): string {
  switch (stage) {
    case 'Lead':
      return '/leads'
    case 'Contacted':
      return '/sales/outbound'
    case 'Replied':
      return '/inbox?tab=instantly'
    case 'Call booked':
      return '/inbox?tab=instantly'
    case 'Proposal sent':
      return ctx?.clientId ? `/clients/${ctx.clientId}` : '/clients'
    case 'Signed':
      return '/clients'
    case 'Onboarding':
      return ctx?.clientId ? `/clients/${ctx.clientId}` : '/clients'
    case 'Delivery build':
      return ctx?.projectId ? `/projects/${ctx.projectId}` : '/projects'
    case 'Live':
      return ctx?.clientId ? `/clients/${ctx.clientId}` : '/clients'
    case 'Scaling':
      return '/sales/outbound'
    default:
      return '/'
  }
}

export function stageLabel(stage: string): string {
  return stage
}

export function leadStagesInOrder(): LeadPipelineStage[] {
  return [...LEAD_PIPELINE_STAGES]
}

export function clientStagesInOrder(): ClientPipelineStage[] {
  return [...CLIENT_PIPELINE_STAGES]
}
