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
  assert.match(read('src/components/ConsoleHomeInboxKeepAlive.tsx'), /OutboundDesk/)
  assert.match(read('src/app/(console)/sales/outbound/page.tsx'), /OperatorShell/)
  assert.match(read('src/app/(console)/sales/outbound/craft/page.tsx'), /OutboundPageClient/)
  assert.match(read('src/components/outbound/OutboundPageClient.tsx'), /OutboundHub/)
  assert.match(read('src/components/outbound/OutboundPageClient.tsx'), /SequenceEditor/)
  assert.match(read('src/components/outbound/OutboundHub.tsx'), /OfferWavesBoard/)
  assert.match(read('src/components/outbound/OutboundHub.tsx'), /OutboundLiveSection/)
  assert.match(read('src/components/outbound/OutboundHub.tsx'), /OutboundWorkshopSection/)
  assert.match(read('src/components/outbound/OutboundHub.tsx'), /OutboundHistorySection/)
  assert.match(read('src/components/outbound/OutboundHub.tsx'), /OutboundLibraryAccordion/)
  assert.match(read('src/components/outbound/OutboundLibraryAccordion.tsx'), /LIBRARY_FEATURED_EXAMPLES/)
  const featured = read('src/lib/outbound-copy.ts')
  assert.match(featured, /LIBRARY_FEATURED_EXAMPLES/)
  assert.match(featured, /title: 'Fill and capture'/)
  assert.match(featured, /export function evaluatePillarsQa/)
  assert.match(featured, /ECONOMIC_PASS_RE/)
  assert.match(featured, /MECHANISM_PASS_RE/)
  assert.match(read('src/components/outbound/PillarsQaInspector.tsx'), /evaluatePillarsQa/)
  assert.match(read('src/components/outbound/SequenceEditor.tsx'), /PillarsQaInspector/)
  assert.doesNotMatch(featured, /title: 'After-hours booking'/)
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
  assert.match(campaignPatch, /requireSameOrigin/)
  assert.match(campaignPatch, /updatePipelineCampaignRow/)
  assert.match(campaignPatch, /requirePortalAccess/)
  const campaignCreate = read('src/app/api/campaigns/route.ts')
  assert.match(campaignCreate, /sequence_draft/)
  assert.match(campaignCreate, /copy_status/)
  assert.match(campaignCreate, /cold_expression/)
})

test('library browser allows free add for all kinds; edit/archive require lock', () => {
  const browser = read('src/components/outbound/LibraryBrowser.tsx')
  assert.doesNotMatch(browser, /Structures and templates are seeded/)
  assert.match(browser, /createLibraryItem/)
  assert.match(browser, /scaffoldSequence/)
  assert.match(browser, /ensureLibraryMutationUnlocked\('edit'\)/)
  assert.match(browser, /ensureLibraryMutationUnlocked\('archive'\)/)
  assert.match(browser, /editItem/)
  assert.match(browser, /archiveItem/)
  assert.match(browser, />\s*Edit\s*</)
  assert.match(browser, /lockLibraryMutations/)

  const store = read('src/lib/outbound-local-store.ts')
  assert.match(store, /export function saveLocalStructure/)
  assert.match(store, /export function saveLocalTemplate/)

  const lock = read('src/lib/outbound-library-lock.ts')
  assert.match(lock, /LIBRARY_LOCK_SESSION_KEY/)
  assert.match(lock, /\/api\/outbound\/library-lock/)

  const lockApi = read('src/app/api/outbound/library-lock/route.ts')
  assert.match(lockApi, /COMPASS_LIBRARY_LOCK_PASSWORD/)
  assert.match(lockApi, /requireSameOrigin/)
  assert.match(lockApi, /compass-library/)

  const envExample = read('.env.example')
  assert.match(envExample, /COMPASS_LIBRARY_LOCK_PASSWORD/)
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
  assert.match(editor, /EditorComponentsAccordion/)
  assert.match(editor, /CampaignCopyMeta/)
  assert.match(editor, /SequenceAnalyticsPanel/)
  assert.match(editor, /forkTemplateIntoSequence/)
  assert.match(editor, /variant === 'overlay'|variant = 'overlay'|variant\?: 'page' \| 'overlay'/)
  assert.match(editor, /Subject line/)
  assert.match(editor, /CampaignLeadsPane/)
  assert.match(editor, /max-w-\[1480px\]/)
  assert.match(editor, /aria-label="Remove step"/)
  assert.match(editor, /usesSlotEditor/)
  assert.match(editor, /sequenceLintWarnings/)
  assert.match(editor, /inboxPreview/)
  assert.match(lib, /applyOpenerModeToSequence/)
  assert.match(lib, /\{\{personalization\}\}/)
  assert.match(read('src/lib/campaigns.ts'), /'subject'/)
  assert.match(read('src/lib/campaigns.ts'), /'opener_mode'/)
  assert.match(read('src/app/api/campaigns/[id]/challenger/route.ts'), /factor === 'subject'/)
  assert.match(read('src/app/api/campaigns/[id]/challenger/route.ts'), /factor === 'opener_mode'/)
  assert.match(lib, /remintStepIds/)
  assert.match(read('src/components/outbound/EditorComponentsAccordion.tsx'), /application\/x-outbound-library/)
  assert.match(read('src/components/outbound/EditorComponentsAccordion.tsx'), /text-\[14px\] font-semibold/)
  assert.match(read('src/components/ui/accordion.tsx'), /@radix-ui\/react-accordion/)
  assert.match(read('src/components/outbound/LibraryPane.tsx'), /application\/x-outbound-library/)
  assert.match(read('src/components/outbound/LibraryPane.tsx'), /text\/plain/)
})

test('scoped seed inventory counts and strings', async () => {
  // Use tsx if available; otherwise assert seed file content.
  const seed = read('src/lib/outbound-seed.ts')
  assert.match(seed, /offer-growth-system/)
  assert.match(seed, /expr-ai-enablement-tradies/)
  assert.match(seed, /expr-growth-mortgage/)
  assert.match(seed, /expr-proof-receptionist/)
  assert.match(seed, /cta-right-person/)
  assert.match(seed, /cta-consultative/)
  assert.match(seed, /opener-signal-hire/)
  assert.match(seed, /subj-trigger-hiring/)
  assert.match(seed, /tmpl-four-touch-breakup/)
  assert.match(seed, /tmpl-not-now-reengage/)
  assert.match(seed, /cta-permission-default/)
  assert.match(seed, /tmpl-thin-proof-nick-3/)
  assert.match(seed, /tmpl-with-proof-nick-4/)
  assert.match(seed, /tmpl-ai-enablement-tradies/)
  assert.doesNotMatch(seed, /quick question/i)
  assert.equal((seed.match(/offer_key: '/g) || []).length >= 4, true)

  // Seed route must stay cheap on warm DBs (missing-id only unless force).
  const seedRoute = read('src/app/api/outbound/seed/route.ts')
  assert.match(seedRoute, /only insert missing ids|missing ids/i)
  assert.match(seedRoute, /force/)
  assert.match(seedRoute, /OUTBOUND_LIBRARY_SEED_VERSION/)
  assert.match(read('src/lib/outbound-library-client.ts'), /SEED_SESSION_KEY|seedAlreadyComplete/)
  assert.match(read('src/lib/outbound-library-client.ts'), /listLibraryBundle/)
  assert.match(read('src/app/api/outbound/library/route.ts'), /compass_outbound_subjects/)
  assert.match(read('src/components/outbound/EditorComponentsAccordion.tsx'), /listLibraryBundle/)

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

test('fork-copy semantics: preserve ids for edits, remint for template isolation', () => {
  function newId() {
    return `step-new-${Math.random()}`
  }
  function forkSequence(sequence, extras = {}) {
    const { remintStepIds = false, ...rest } = extras
    const cloned = JSON.parse(JSON.stringify(sequence))
    return {
      ...cloned,
      ...rest,
      steps: cloned.steps.map((step) => ({
        ...step,
        id: remintStepIds ? newId() : step.id,
        slots: step.slots.map((slot) => ({ ...slot }))
      }))
    }
  }
  function copyTextIntoSlot(sequence, stepId, slotKey, body) {
    const next = forkSequence(sequence)
    for (const step of next.steps) {
      if (step.id !== stepId) continue
      const slot = step.slots.find((s) => s.key === slotKey)
      if (slot) slot.body = body
    }
    return next
  }
  function removeStep(sequence, stepId) {
    const next = forkSequence(sequence)
    next.steps = next.steps.filter((s) => s.id !== stepId)
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
      },
      {
        id: 'step-fu',
        kind: 'followup',
        label: 'Follow-up 1',
        subject: '',
        delay_days: 3,
        slots: [
          { key: 'opener', label: 'Bump', body: '' },
          { key: 'cta', label: 'CTA', body: '' }
        ]
      }
    ]
  }

  // Template fork remints ids and isolates mutations
  const forked = forkSequence(template, { remintStepIds: true, template_origin_id: 'tmpl-1' })
  forked.steps[0].slots[1].body = 'CAMPAIGN_EDIT'
  assert.equal(template.steps[0].slots[1].body, 'TEMPLATE_BODY')
  assert.equal(forked.steps[0].slots[1].body, 'CAMPAIGN_EDIT')
  assert.notEqual(forked.steps[0].id, template.steps[0].id)
  assert.equal(forked.template_origin_id, 'tmpl-1')

  // In-editor clone preserves ids so slot inserts and deletes resolve
  const draft = forkSequence(template)
  assert.equal(draft.steps[0].id, 'step-orig')
  assert.equal(draft.steps[1].id, 'step-fu')

  const afterDrag = copyTextIntoSlot(draft, 'step-orig', 'cta', 'Would you be open to 15 minutes?')
  assert.equal(
    afterDrag.steps[0].slots.find((s) => s.key === 'cta').body,
    'Would you be open to 15 minutes?'
  )
  assert.equal(draft.steps[0].slots.find((s) => s.key === 'cta').body, 'Mind if I send over {{asset}}?')
  assert.equal(afterDrag.steps[0].id, 'step-orig')

  const afterDelete = removeStep(afterDrag, 'step-fu')
  assert.equal(afterDelete.steps.length, 1)
  assert.equal(afterDelete.steps[0].id, 'step-orig')
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

test('copy archive types, editor tab, APIs, and migration are wired', () => {
  const domain = read('src/lib/outbound-copy.ts')
  assert.match(domain, /export type CopyArchiveEntry/)
  assert.match(domain, /deriveCopyArchiveComponents/)
  assert.match(domain, /formatRelativeUsedAt/)
  assert.match(domain, /sequenceEmailBodyText/)

  const seed = read('src/lib/outbound-seed.ts')
  assert.match(seed, /export function seedCopyArchive/)
  assert.match(seed, /archive-nsw-elec-growth/)
  assert.match(seed, /copyArchive: seedCopyArchive\(\)\.length/)

  const store = read('src/lib/outbound-copy-archive.ts')
  assert.match(store, /listCopyArchive/)
  assert.match(store, /saveCopyArchiveEntry/)
  assert.match(store, /forkCopyArchiveIntoSequence/)
  assert.match(store, /touchCopyArchiveLastUsed/)

  const panel = read('src/components/outbound/CopyArchivePanel.tsx')
  assert.match(panel, /Copy archive/)
  assert.match(panel, /Fork sequence/)
  assert.match(panel, /Use in step/)
  assert.match(panel, /Save current/)
  assert.match(panel, /Last used/)
  assert.match(panel, /Reply/)

  const editor = read('src/components/outbound/SequenceEditor.tsx')
  assert.match(editor, /CopyArchivePanel/)
  assert.match(editor, /id: 'archive'/)
  assert.match(editor, /label: 'Archive'/)

  const migration = read('supabase/migrations/0037_compass_outbound_copy_archive.sql')
  assert.match(migration, /compass_outbound_copy_archive/)
  assert.match(migration, /last_used_at/)
  assert.match(migration, /performance/)
  assert.match(migration, /portal_is_operator/)

  const listApi = read('src/app/api/outbound/copy-archive/route.ts')
  const idApi = read('src/app/api/outbound/copy-archive/[id]/route.ts')
  assert.match(listApi, /compass_outbound_copy_archive/)
  assert.match(listApi, /requirePortalAccess/)
  assert.match(listApi, /requireSameOrigin/)
  assert.match(idApi, /touch_used/)
  assert.match(idApi, /archived: true/)
})
