import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultSopPlan,
  createSopPlanFromLegacySteps,
  normalizeSopPlan,
  reorderSopPlan,
  SOP_DEFAULT_NODE_IDS
} from '../src/lib/delivery-dept/sop-template.ts'

test('fill and capture SOP includes a dependency-safe core workflow', () => {
  const plan = createDefaultSopPlan()

  assert.deepEqual(plan.nodes, SOP_DEFAULT_NODE_IDS)
  assert.doesNotThrow(() => normalizeSopPlan(plan))
  assert.equal(plan.statuses.client_intake, 'not_started')
  assert.equal(plan.statuses.monitoring, 'not_started')
})

test('SOP accepts optional channels and rejects dependency-breaking order', () => {
  const base = createDefaultSopPlan()
  const withMeta = normalizeSopPlan({
    ...base,
    nodes: ['client_intake', 'channel_plan', 'meta_instant_form', ...base.nodes.slice(2)]
  })

  assert.equal(withMeta.nodes.includes('meta_instant_form'), true)
  assert.throws(
    () => reorderSopPlan(withMeta, 'lead_intake', 'client_intake'),
    /invalid_sop_dependency/
  )
})

test('legacy voice state is marked partial instead of falsely verified', () => {
  const plan = createSopPlanFromLegacySteps({
    intake_form: { status: 'done', blockedOn: null },
    number_strategy: { status: 'done', blockedOn: null },
    retell_agent: { status: 'done', blockedOn: null },
    calendar_grant: { status: 'done', blockedOn: null },
    test_call: { status: 'done', blockedOn: null },
    go_live: { status: 'done', blockedOn: null },
    checkpoint: { status: 'current', blockedOn: null }
  })

  assert.equal(plan.statuses.client_intake, 'verified')
  assert.equal(plan.statuses.capture_path, 'in_progress')
  assert.equal(plan.statuses.e2e_test, 'in_progress')
  assert.equal(plan.statuses.ads_launch, 'in_progress')
  assert.equal(plan.statuses.lead_intake, 'not_wired')
})

test('stored plans drop the retired lsa node instead of throwing', () => {
  const base = createDefaultSopPlan()
  const plan = normalizeSopPlan({
    ...base,
    nodes: [...base.nodes, 'lsa']
  })

  assert.equal(plan.nodes.includes('lsa'), false)
  assert.deepEqual(plan.nodes, base.nodes)
})

test('new installs snapshot the selected future template', () => {
  const base = createDefaultSopPlan()
  const template = normalizeSopPlan({
    ...base,
    nodes: ['client_intake', 'channel_plan', 'meta_instant_form', ...base.nodes.slice(2)]
  })
  const plan = createSopPlanFromLegacySteps(
    { intake_form: { status: 'done', blockedOn: null } },
    template
  )

  assert.deepEqual(plan.nodes, template.nodes)
  assert.equal(plan.statuses.client_intake, 'verified')
  assert.equal(plan.statuses.meta_instant_form, 'not_wired')
})
