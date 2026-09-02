export const SOP_STATUSES = ['not_started', 'in_progress', 'blocked', 'verified', 'not_wired'] as const

export type SopStatus = (typeof SOP_STATUSES)[number]
export type SopOwner = 'jules' | 'automated' | 'client'
export type SopIconName =
  | 'clipboard'
  | 'route'
  | 'phone'
  | 'bot'
  | 'calendar'
  | 'database'
  | 'listChecks'
  | 'handoff'
  | 'megaphone'
  | 'chart'
  | 'facebook'
  | 'google'
  | 'image'

export type SopNodeDefinition = {
  id: string
  title: string
  kicker: string
  summary: string
  detail: string
  why: string
  owner: SopOwner
  required: boolean
  dependsOn: string[]
  icon: SopIconName
  channel?: 'meta' | 'google' | 'shared'
  acceptance: string[]
  evidence: string[]
}

export type SopPlan = {
  version: 1
  nodes: string[]
  statuses: Record<string, SopStatus>
  blockers: Record<string, string>
}

export const SOP_NODE_CATALOG: SopNodeDefinition[] = [
  {
    id: 'client_intake',
    title: 'Client intake',
    kicker: 'Start here',
    summary: 'Collect the business details, access, number, service area, and calendar needed to install.',
    detail: 'The client supplies the owner contact, public number, service area, trading hours, calendar, and the ad accounts or pages that will be used.',
    why: 'Without the right access and business rules, the rest of the setup cannot be tested or handed over safely.',
    owner: 'client',
    required: true,
    dependsOn: [],
    icon: 'clipboard',
    channel: 'shared',
    acceptance: ['Owner and business details are complete', 'Public number and service area are confirmed', 'Required account access is available'],
    evidence: ['Submitted onboarding form', 'Access checklist', 'Confirmed trade and service area']
  },
  {
    id: 'channel_plan',
    title: 'Choose channels',
    kicker: 'Decide',
    summary: 'Choose Meta forms, Google Search calls, or a landing page form.',
    detail: 'Meta Instant Forms, Google Search click to call, and Google landing page forms deliver information differently. Record the exact channel and destination before building the intake.',
    why: 'A click to call is not the same thing as a form submission. The workflow must know what payload or phone event to expect.',
    owner: 'jules',
    required: true,
    dependsOn: ['client_intake'],
    icon: 'route',
    channel: 'shared',
    acceptance: ['Acquisition channel is selected', 'Destination number or form is named', 'Source and campaign tracking are defined'],
    evidence: ['Channel choice', 'Campaign or form ID', 'Destination mapping']
  },
  {
    id: 'capture_path',
    title: 'Capture path',
    kicker: 'Protect the spend',
    summary: 'Configure the Twilio number, SMS, missed call or after hours routing, consent, and STOP handling.',
    detail: 'The public number and form response path must reach the booking system. SMS needs consent and STOP handling. Voice covers calls, missed calls, and after hours.',
    why: 'Ads must never send new demand into an untested voicemail or an unowned inbox.',
    owner: 'jules',
    required: true,
    dependsOn: ['client_intake'],
    icon: 'phone',
    channel: 'shared',
    acceptance: ['Number receives the test call', 'SMS sends and receives', 'Consent and STOP behaviour are tested'],
    evidence: ['Test call result', 'Test SMS thread', 'Routing record']
  },
  {
    id: 'agent_rules',
    title: 'Agent rules',
    kicker: 'Bound the agent',
    summary: 'Load the trade context, qualification questions, escalation rules, emergency handling, and no quote policy.',
    detail: 'The assistant collects job details, urgency, location, and availability. It does not provide a hard quote or make licensed safety claims. Anything outside the rules goes to a human.',
    why: 'The agent needs a narrow job and clear exits. A confident wrong answer is worse than a human callback.',
    owner: 'jules',
    required: true,
    dependsOn: ['capture_path'],
    icon: 'bot',
    channel: 'shared',
    acceptance: ['Trade pack is loaded', 'No quote and escalation rules are present', 'Emergency and human handoff paths are tested'],
    evidence: ['Agent configuration', 'Scenario test notes', 'Escalation result']
  },
  {
    id: 'calendar',
    title: 'Calendar',
    kicker: 'Make it bookable',
    summary: 'Connect the client calendar, availability, timezone, booking rules, and reminders.',
    detail: 'A booked lead becomes an event on the client calendar. The event carries the job summary and a link back to the Compass record.',
    why: 'A conversation is not a delivered opportunity until the business can see and act on the booking.',
    owner: 'client',
    required: true,
    dependsOn: ['client_intake'],
    icon: 'calendar',
    channel: 'shared',
    acceptance: ['Calendar write access is granted', 'A test event is created and removed', 'Availability and timezone are confirmed'],
    evidence: ['Calendar grant probe', 'Test event', 'Booking rules']
  },
  {
    id: 'lead_intake',
    title: 'Lead intake',
    kicker: 'Join the source',
    summary: 'Send the selected ad or form payload into Compass, deduplicate it, and start the response clock.',
    detail: 'Compass stores the lead source, phone, consent, campaign, received time, and job details. The first response target is measured from the received timestamp.',
    why: 'A lead cannot be followed up, resumed, or reported if it only exists inside an ad platform or a spreadsheet.',
    owner: 'automated',
    required: true,
    dependsOn: ['channel_plan', 'capture_path'],
    icon: 'database',
    channel: 'shared',
    acceptance: ['A test lead creates one Compass record', 'Duplicate submissions do not create duplicate jobs', 'The response timer is recorded'],
    evidence: ['Source payload', 'Compass record', 'Received and responded timestamps']
  },
  {
    id: 'e2e_test',
    title: 'End to end test',
    kicker: 'Prove it',
    summary: 'Run a real test from source to response, resumed context, booking, and handoff.',
    detail: 'Use a synthetic form or call and follow it through SMS or voice, qualification, booking, owner notification, and the calendar event.',
    why: 'Individual green checks can still hide a broken join between the ad platform, Compass, Twilio, and the calendar.',
    owner: 'jules',
    required: true,
    dependsOn: ['agent_rules', 'calendar', 'lead_intake'],
    icon: 'listChecks',
    channel: 'shared',
    acceptance: ['First response meets the agreed target', 'A later reply resumes the same job thread', 'Booking and handoff succeed without a quote'],
    evidence: ['Test transcript', 'Calendar event', 'Owner notification']
  },
  {
    id: 'handoff',
    title: 'Handoff',
    kicker: 'Give it to the team',
    summary: 'Create the structured job summary and send the owner the booking and context.',
    detail: 'The handoff contains the lead contact, suburb, job type, urgency, context, booking time, source, and links to the Compass record or media.',
    why: 'The client should not have to reread a long thread to understand what was promised or what needs to happen next.',
    owner: 'automated',
    required: true,
    dependsOn: ['e2e_test'],
    icon: 'handoff',
    channel: 'shared',
    acceptance: ['Calendar event includes the useful job context', 'Owner receives the alert', 'Full record is available in Compass'],
    evidence: ['Calendar event body', 'Owner SMS or email', 'Compass job record']
  },
  {
    id: 'ads_launch',
    title: 'Launch ads',
    kicker: 'Turn on demand',
    summary: 'Activate the selected ads only after the capture and end to end tests pass.',
    detail: 'Start with the chosen channel, budget, targeting, and simple job focused copy. Keep a pause condition if enquiries do not enter or book.',
    why: 'The first job is not to maximise lead volume. It is to make sure paid demand reaches a path that can book.',
    owner: 'jules',
    required: true,
    dependsOn: ['e2e_test', 'handoff'],
    icon: 'megaphone',
    channel: 'shared',
    acceptance: ['Capture is verified before spend', 'Budget and targeting are recorded', 'Pause condition is understood'],
    evidence: ['Campaign status', 'Ad destination', 'Launch checklist']
  },
  {
    id: 'monitoring',
    title: 'Monitor',
    kicker: 'Keep it working',
    summary: 'Review response speed, new, missed, booked, showed, and lost outcomes.',
    detail: 'The system is operated after launch. Check that calls, forms, SMS, calendar events, and owner handoffs still connect, then review the weekly outcome note.',
    why: 'A live campaign can hide a broken calendar grant, a missed webhook, or a rising no show rate.',
    owner: 'jules',
    required: true,
    dependsOn: ['ads_launch'],
    icon: 'chart',
    channel: 'shared',
    acceptance: ['New, missed, booked, and showed states can be recorded', 'Broken access creates a visible block', 'A weekly review is completed'],
    evidence: ['Outcome report', 'Calendar check', 'Weekly operator note']
  },
  {
    id: 'meta_instant_form',
    title: 'Meta Instant Form',
    kicker: 'Optional channel',
    summary: 'Create the form, collect permission and job details, and deliver the lead to Compass.',
    detail: 'Meta form leads need a subscribed page, lead retrieval, field mapping, consent language, and an immediate SMS or callback path.',
    why: 'Meta form submissions are not automatically available to the booking system.',
    owner: 'jules',
    required: false,
    dependsOn: ['channel_plan'],
    icon: 'facebook',
    channel: 'meta',
    acceptance: ['Form asks for useful job context and phone', 'SMS permission and privacy link are present', 'Webhook retrieves and maps a test lead'],
    evidence: ['Form ID', 'Test payload', 'Compass record']
  },
  {
    id: 'google_search_call',
    title: 'Google Search call',
    kicker: 'Optional channel',
    summary: 'Configure text Search ads and call assets that point to the tested booking number.',
    detail: 'A click to call creates a phone event, not a form payload. The voice path must answer, capture context, and book or hand off.',
    why: 'Google Search is high intent, but the delivery path is different from a Meta form.',
    owner: 'jules',
    required: false,
    dependsOn: ['channel_plan'],
    icon: 'google',
    channel: 'google',
    acceptance: ['Call asset uses the intended number', 'Search query and service area are recorded', 'A test call reaches the capture path'],
    evidence: ['Campaign and asset IDs', 'Call trace', 'Test booking']
  },
    {
    id: 'google_landing_form',
    title: 'Google landing form',
    kicker: 'Optional channel',
    summary: 'Send a landing page form into the same Compass and SMS path.',
    detail: 'The form needs a server webhook, consent language, source tracking, duplicate handling, and a visible response timer.',
    why: 'A Google link alone does not send lead details to the database.',
    owner: 'jules',
    required: false,
    dependsOn: ['channel_plan'],
    icon: 'google',
    channel: 'google',
    acceptance: ['Form submits into Compass', 'The lead receives the intended response', 'Source and campaign are retained'],
    evidence: ['Test submission', 'Compass record', 'Response timestamp']
  },
  {
    id: 'mms_media',
    title: 'Photos and video',
    kicker: 'Optional capture',
    summary: 'Accept media and attach it to the Compass job record for the business.',
    detail: 'Media should support human triage, not automated quoting. Store it as an attachment or secure link with a retention rule.',
    why: 'Photos can improve handoff, but they add storage, privacy, and moderation work.',
    owner: 'automated',
    required: false,
    dependsOn: ['lead_intake'],
    icon: 'image',
    channel: 'shared',
    acceptance: ['Supported media types are defined', 'A received attachment is linked to the job', 'The agent never quotes from a photo'],
    evidence: ['Media receipt', 'Compass attachment', 'Handoff link']
  }
]

export const SOP_DEFAULT_NODE_IDS = SOP_NODE_CATALOG.filter((node) => node.required).map((node) => node.id)

const SOP_NODE_BY_ID = new Map(SOP_NODE_CATALOG.map((node) => [node.id, node]))

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function initialStatuses(nodeIds: string[]): Record<string, SopStatus> {
  return Object.fromEntries(nodeIds.map((id) => [id, 'not_started'])) as Record<string, SopStatus>
}

export function getSopNode(id: string): SopNodeDefinition | null {
  return SOP_NODE_BY_ID.get(id) || null
}

export function createDefaultSopPlan(): SopPlan {
  return {
    version: 1,
    nodes: [...SOP_DEFAULT_NODE_IDS],
    statuses: initialStatuses(SOP_DEFAULT_NODE_IDS),
    blockers: {}
  }
}

export function normalizeSopPlan(input: unknown): SopPlan {
  if (!isRecord(input)) throw new Error('invalid_sop_plan')
  const rawNodes = input.nodes
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) throw new Error('invalid_sop_nodes')

  const nodes = rawNodes.map((id) => String(id)).filter((id) => id !== 'lsa')
  if (nodes.length === 0) throw new Error('invalid_sop_nodes')
  if (new Set(nodes).size !== nodes.length) throw new Error('duplicate_sop_node')
  if (nodes.some((id) => !SOP_NODE_BY_ID.has(id))) throw new Error('unknown_sop_node')

  const positions = new Map(nodes.map((id, index) => [id, index]))
  for (const id of nodes) {
    const definition = SOP_NODE_BY_ID.get(id)
    if (!definition) throw new Error('unknown_sop_node')
    for (const dependency of definition.dependsOn) {
      const dependencyPosition = positions.get(dependency)
      const nodePosition = positions.get(id)
      if (dependencyPosition == null || nodePosition == null || dependencyPosition >= nodePosition) {
        throw new Error(`invalid_sop_dependency:${id}`)
      }
    }
  }

  for (const requiredId of SOP_DEFAULT_NODE_IDS) {
    if (!positions.has(requiredId)) throw new Error(`missing_required_sop_node:${requiredId}`)
  }

  const rawStatuses = isRecord(input.statuses) ? input.statuses : {}
  const statuses = initialStatuses(nodes)
  for (const id of nodes) {
    const status = rawStatuses[id]
    if (typeof status === 'string' && SOP_STATUSES.includes(status as SopStatus)) {
      statuses[id] = status as SopStatus
    }
  }

  const rawBlockers = isRecord(input.blockers) ? input.blockers : {}
  const blockers: Record<string, string> = {}
  for (const id of nodes) {
    if (typeof rawBlockers[id] === 'string' && rawBlockers[id].trim()) {
      blockers[id] = rawBlockers[id].trim()
    }
  }

  return { version: 1, nodes, statuses, blockers }
}

export function createSopPlanFromLegacySteps(
  steps: Record<string, { status?: string; blockedOn?: string | null }>,
  basePlan = createDefaultSopPlan()
): SopPlan {
  const plan = normalizeSopPlan({
    ...basePlan,
    statuses: Object.fromEntries(basePlan.nodes.map((nodeId) => [nodeId, 'not_started'])),
    blockers: {}
  })
  for (const nodeId of plan.nodes.filter((id) => !getSopNode(id)?.required)) {
    plan.statuses[nodeId] = 'not_wired'
  }
  for (const nodeId of ['channel_plan', 'lead_intake', 'handoff']) {
    if (plan.statuses[nodeId] == null) continue
    plan.statuses[nodeId] = 'not_wired'
  }
  const legacyMap: Record<string, { step: string; partial?: boolean }> = {
    client_intake: { step: 'intake_form' },
    capture_path: { step: 'number_strategy', partial: true },
    agent_rules: { step: 'retell_agent' },
    calendar: { step: 'calendar_grant' },
    e2e_test: { step: 'test_call', partial: true },
    ads_launch: { step: 'go_live', partial: true },
    monitoring: { step: 'checkpoint', partial: true }
  }

  for (const [nodeId, mapping] of Object.entries(legacyMap)) {
    const step = steps[mapping.step]
    if (!step) continue
    if (step.blockedOn) {
      plan.statuses[nodeId] = 'blocked'
      plan.blockers[nodeId] = `Blocked on ${step.blockedOn}`
    } else if (step.status === 'done') {
      plan.statuses[nodeId] = mapping.partial ? 'in_progress' : 'verified'
    } else if (step.status === 'current') {
      plan.statuses[nodeId] = 'in_progress'
    }
  }

  return plan
}

export function reorderSopPlan(plan: SopPlan, fromId: string, toId: string): SopPlan {
  const fromIndex = plan.nodes.indexOf(fromId)
  const toIndex = plan.nodes.indexOf(toId)
  if (fromIndex < 0 || toIndex < 0 || fromId === toId) return plan
  const nodes = [...plan.nodes]
  nodes.splice(fromIndex, 1)
  nodes.splice(toIndex, 0, fromId)
  return normalizeSopPlan({ ...plan, nodes })
}
