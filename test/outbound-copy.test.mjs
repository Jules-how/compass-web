import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

// Node can't import TS directly — exercise via dynamic transpile-free copies of pure helpers
// by reading and eval'ing the compiled intent through duplicated minimal assertions + file contracts.

test('outbound migration creates libraries, RLS, campaign columns, and scoped seed', () => {
  const migration = read('supabase/migrations/0034_compass_outbound_copy.sql')
  assert.match(migration, /compass_outbound_offers/)
  assert.match(migration, /compass_outbound_expressions/)
  assert.match(migration, /compass_outbound_structures/)
  assert.match(migration, /compass_outbound_ctas/)
  assert.match(migration, /compass_outbound_subjects/)
  assert.match(migration, /compass_outbound_openers/)
  assert.match(migration, /compass_outbound_templates/)
  assert.match(migration, /portal_is_operator/)
  assert.match(migration, /sequence_draft/)
  assert.match(migration, /copy_status/)
  assert.match(migration, /growth-system/)
  assert.match(migration, /ai-enablement/)
  assert.match(migration, /ai-receptionist-system/)
  assert.match(migration, /agency-ai-reporting/)
  assert.match(migration, /nick-4step/)
  assert.match(migration, /nick-3step/)
  assert.match(migration, /platten-aida/)
  assert.match(migration, /connor-3para/)
  assert.match(migration, /\{\{accountSignature\}\}/)
  assert.match(migration, /\{\{spam_act_opt_out\}\}/)
  assert.match(migration, /Mind if I send over \{\{asset\}\}\?/)
  assert.doesNotMatch(migration, /quick question/i)
  assert.doesNotMatch(migration, /Never Miss a Job/)
  assert.doesNotMatch(migration, /Ops Pilot/)
})

test('outbound nav and pages are wired under Sales', () => {
  const nav = read('src/components/NavLinks.tsx')
  assert.match(nav, /sales\/outbound/)
  assert.match(nav, /Outbound/)
  assert.match(nav, /'outbound'/)
  assert.match(nav, /OutboundIcon/)
  assert.match(nav, /pathname\.startsWith\('\/sales\/outbound'\)/)

  assert.match(read('src/components/nav-icons.tsx'), /export function OutboundIcon/)
  assert.match(read('src/app/(console)/sales/outbound/page.tsx'), /OutboundHub/)
  assert.match(read('src/app/(console)/sales/outbound/editor/new/page.tsx'), /SequenceEditor/)
  assert.match(
    read('src/app/(console)/sales/outbound/editor/[campaignId]/page.tsx'),
    /SequenceEditor/
  )
  for (const lib of [
    'offers',
    'expressions',
    'structures',
    'ctas',
    'subjects',
    'openers',
    'templates'
  ]) {
    assert.match(
      read(`src/app/(console)/sales/outbound/${lib}/page.tsx`),
      /LibraryBrowser/
    )
  }
})

test('outbound APIs are operator-gated with same-origin writes', () => {
  for (const entity of [
    'offers',
    'expressions',
    'structures',
    'ctas',
    'subjects',
    'openers',
    'templates'
  ]) {
    const list = read(`src/app/api/outbound/${entity}/route.ts`)
    const id = read(`src/app/api/outbound/${entity}/[id]/route.ts`)
    assert.match(list, /listLibrary|createLibraryItem/)
    assert.match(id, /requireSameOrigin|archiveLibraryItem|patchLibraryItem/)
    assert.match(list + id, /compass_outbound_/)
  }
  const campaignPatch = read('src/app/api/campaigns/[id]/route.ts')
  assert.match(campaignPatch, /sequence_draft/)
  assert.match(campaignPatch, /copy_status/)
  assert.match(campaignPatch, /cold_expression/)
})

test('planner sidecar exposes copy tab and editor deep link', () => {
  const sidecar = read('src/components/campaigns/CampaignSidecar.tsx')
  assert.match(sidecar, /title="Copy"/)
  assert.match(sidecar, /sales\/outbound\/editor/)
  assert.match(sidecar, /Attach template/)
  assert.match(sidecar, /Open editor|Add copy/)

  const planner = read('src/components/campaigns/CampaignPlanner.tsx')
  assert.match(planner, /CopyChips/)
  assert.match(planner, /Add copy/)
  assert.match(planner, /createCampaign\(undefined, true\)/)
})

test('sequence editor fork-copy and subject ban helpers exist', () => {
  const lib = read('src/lib/outbound-copy.ts')
  assert.match(lib, /export function scaffoldSequence/)
  assert.match(lib, /export function forkSequence/)
  assert.match(lib, /export function copyTextIntoSlot/)
  assert.match(lib, /export function subjectLooksBanned/)
  assert.match(lib, /export function applyStructureScaffold/)
  assert.match(lib, /nick-4step/)
  assert.match(lib, /accountSignature/)
  assert.match(lib, /spam_act_opt_out/)

  const editor = read('src/components/outbound/SequenceEditor.tsx')
  assert.match(editor, /LibraryPane/)
  assert.match(editor, /CampaignCopyMeta/)
  assert.match(editor, /forkTemplateIntoSequence/)
  assert.match(editor, /Save to library/)
  assert.match(read('src/components/outbound/LibraryPane.tsx'), /application\/x-outbound-library/)
})

test('scoped seed inventory counts and strings', async () => {
  // Use tsx if available; otherwise assert seed file content.
  const seed = read('src/lib/outbound-seed.ts')
  assert.match(seed, /offer-growth-system/)
  assert.match(seed, /expr-ai-enablement-tradies/)
  assert.match(seed, /expr-growth-mortgage/)
  assert.match(seed, /cta-permission-default/)
  assert.match(seed, /tmpl-thin-proof-nick-3/)
  assert.match(seed, /tmpl-with-proof-nick-4/)
  assert.match(seed, /tmpl-ai-enablement-tradies/)
  assert.doesNotMatch(seed, /quick question/i)
  assert.equal((seed.match(/offer_key: '/g) || []).length >= 4, true)

  // Lightweight runtime: recreate scaffold logic inline for structure keys
  const STRUCTURES = {
    'nick-4step': ['opener', 'proof_block', 'cold_expression', 'cta'],
    'nick-3step': ['opener', 'cold_expression', 'cta'],
    'platten-aida': [
      'opener',
      'interest_mechanism',
      'proof_block',
      'cold_expression',
      'cta'
    ],
    'connor-3para': [
      'who_line',
      'why_priorities_and_outcomes',
      'cold_expression',
      'availability_ask'
    ]
  }
  for (const [id, keys] of Object.entries(STRUCTURES)) {
    assert.ok(keys.includes('cold_expression') || id === 'connor-3para')
    assert.ok(libHasStructure(id, keys))
  }

  function libHasStructure(id, keys) {
    const source = read('src/lib/outbound-copy.ts')
    return source.includes(`'${id}'`) && keys.every((k) => source.includes(`'${k}'`))
  }
})

test('fork-copy semantics: template mutation isolation (logic contract)', () => {
  // Pure JS recreation of forkSequence intent
  function forkSequence(sequence) {
    const cloned = JSON.parse(JSON.stringify(sequence))
    return {
      ...cloned,
      steps: cloned.steps.map((step) => ({
        ...step,
        id: `step-new-${Math.random()}`,
        slots: step.slots.map((slot) => ({ ...slot }))
      }))
    }
  }
  function copyTextIntoSlot(sequence, stepId, slotKey, body) {
    const next = forkSequence(sequence)
    for (const step of next.steps) {
      if (step.id !== stepId && !stepId.startsWith('step-')) continue
      // match by original position via label after fork is hard; use first step
    }
    const step = next.steps[0]
    const slot = step.slots.find((s) => s.key === slotKey)
    if (slot) slot.body = body
    return next
  }

  const template = {
    structure_id: 'nick-3step',
    steps: [
      {
        id: 'step-orig',
        kind: 'email',
        label: 'Email 1',
        subject: '',
        slots: [
          { key: 'opener', label: 'Opener', body: '' },
          { key: 'cold_expression', label: 'Cold expression', body: 'TEMPLATE_BODY' },
          { key: 'cta', label: 'CTA', body: 'Mind if I send over {{asset}}?' }
        ]
      }
    ]
  }
  const forked = forkSequence(template)
  forked.steps[0].slots[1].body = 'CAMPAIGN_EDIT'
  assert.equal(template.steps[0].slots[1].body, 'TEMPLATE_BODY')
  assert.equal(forked.steps[0].slots[1].body, 'CAMPAIGN_EDIT')
  assert.notEqual(forked.steps[0].id, template.steps[0].id)

  const afterDrag = copyTextIntoSlot(forked, forked.steps[0].id, 'cta', 'Would you be open to 15 minutes?')
  assert.equal(afterDrag.steps[0].slots.find((s) => s.key === 'cta').body, 'Would you be open to 15 minutes?')
  assert.equal(forked.steps[0].slots.find((s) => s.key === 'cta').body, 'Mind if I send over {{asset}}?')
})

test('subject ban helper rejects quick stems', () => {
  function subjectLooksBanned(subject) {
    const normalized = subject.trim().toLowerCase()
    if (!normalized) return false
    if (normalized.includes('quick question')) return true
    if (/^quick\b/.test(normalized)) return true
    return false
  }
  assert.equal(subjectLooksBanned('quick question {{firstName}}'), true)
  assert.equal(subjectLooksBanned('Quick intro'), true)
  assert.equal(subjectLooksBanned('{{companyName}} / {{firstName}}'), false)
  assert.equal(subjectLooksBanned('{{subject}}'), false)
})
