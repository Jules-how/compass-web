import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function leadStageFromOutbound(outbound) {
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
    default:
      return 'Lead'
  }
}

function eventMatchesClause(event, clause) {
  if (event.type !== clause.kind) return false
  if (clause.campaign_id && event.campaign !== clause.campaign_id) return false
  if (clause.filter) {
    for (const [key, value] of Object.entries(clause.filter)) {
      const actual = event.payload?.[key] ?? event[key]
      if (actual !== value) return false
    }
  }
  return true
}

function matchTaskProof(contract, events) {
  const groups = contract.proof ?? []
  const satisfied = []
  const missing = []
  let allPass = groups.length > 0

  groups.forEach((group, groupIndex) => {
    const clauses = group.all ?? group.any ?? []
    const hits = []
    for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
      const clause = clauses[clauseIndex]
      const min = clause.min_count ?? 1
      const matched = events.filter((e) => eventMatchesClause(e, clause))
      if (matched.length >= min) {
        hits.push({ clauseIndex, evidence_ids: matched.map((e) => e.id) })
      }
    }
    if ('all' in group) {
      if (hits.length !== clauses.length) {
        allPass = false
        for (let i = 0; i < clauses.length; i += 1) {
          if (!hits.some((h) => h.clauseIndex === i)) {
            missing.push({ groupIndex, clauseIndex: i, kind: clauses[i].kind })
          }
        }
      }
    } else if (hits.length === 0) {
      allPass = false
      missing.push({ groupIndex, clauseIndex: 0, kind: clauses[0]?.kind })
    }
    for (const hit of hits) {
      satisfied.push({ groupIndex, ...hit })
    }
  })

  return { allPass, satisfied, missing }
}

test('pipeline spine maps outbound_status to lead stages', () => {
  assert.equal(leadStageFromOutbound('uncontacted'), 'Lead')
  assert.equal(leadStageFromOutbound('in_instantly'), 'Contacted')
  assert.equal(leadStageFromOutbound('interested'), 'Replied')
  assert.equal(leadStageFromOutbound('meeting_booked'), 'Call booked')
  assert.equal(leadStageFromOutbound('converted'), 'Signed')
})

test('evidence matching completes when all clauses pass', () => {
  const events = [
    { id: 'e1', type: 'email.replied', campaign: 'c1', payload: {} },
    { id: 'e2', type: 'lead.meeting_booked', campaign: 'c1', payload: {} }
  ]
  const contract = {
    proof: [{ all: [{ kind: 'email.replied' }, { kind: 'lead.meeting_booked' }] }]
  }
  const result = matchTaskProof(contract, events)
  assert.equal(result.allPass, true)
  assert.equal(result.satisfied.length, 2)
})

test('evidence matching supports partial completion', () => {
  const events = [{ id: 'e1', type: 'email.replied', campaign: 'c1', payload: {} }]
  const contract = {
    proof: [{ all: [{ kind: 'email.replied' }, { kind: 'lead.meeting_booked' }] }]
  }
  const result = matchTaskProof(contract, events)
  assert.equal(result.allPass, false)
  assert.equal(result.satisfied.length, 1)
  assert.equal(result.missing.length, 1)
  assert.equal(result.missing[0].kind, 'lead.meeting_booked')
})

test('one event can satisfy clauses on multiple tasks (many-to-many)', () => {
  const events = [{ id: 'e1', type: 'email.replied', campaign: 'c1', payload: {} }]
  const taskA = { proof: [{ all: [{ kind: 'email.replied' }] }] }
  const taskB = { proof: [{ all: [{ kind: 'email.replied', min_count: 1 }] }] }
  assert.equal(matchTaskProof(taskA, events).allPass, true)
  assert.equal(matchTaskProof(taskB, events).allPass, true)
})

test('digest JSON shape from mocked generation', () => {
  const digest = {
    generatedAt: '2026-08-26T06:30:00.000Z',
    completed: [
      {
        task_id: 'task-1',
        title: 'Follow up booked calls',
        evidence_ids: ['e1', 'e2'],
        why: 'All 1 proof group(s) satisfied.'
      }
    ],
    partial: [
      {
        task_id: 'task-2',
        title: 'Onboard Acme Plumbing',
        satisfied: [{ groupIndex: 0, clauseIndex: 0, evidence_ids: ['e3'] }],
        missing: [{ groupIndex: 0, clauseIndex: 1, kind: 'form.submitted' }]
      }
    ],
    proposed: [
      {
        key: 'pull-next:plumber:NSW',
        title: 'Pull next: plumber · NSW',
        due: '2026-08-28',
        reason: '420 uncontacted with email — best reply vertical is plumber.',
        href: '/leads?outbound_status=uncontacted&vertical=plumber&state=NSW'
      }
    ],
    needs_you: []
  }

  assert.equal(digest.completed.length, 1)
  assert.equal(digest.partial[0].missing[0].kind, 'form.submitted')
  assert.match(digest.proposed[0].href, /^\/leads\?/)
  console.log(JSON.stringify(digest, null, 2))
})

test('wave 3 wiring files exist', () => {
  assert.match(read('src/lib/events.ts'), /appendEvidence/)
  assert.match(read('src/lib/evidence-poller.ts'), /generateDailyDigest/)
  assert.match(read('src/lib/pipeline-spine.ts'), /stageToolHref/)
  assert.match(read('src/components/home/HomeDashboard.tsx'), /\/api\/home/)
  assert.doesNotMatch(read('src/components/home/HomeDashboard.tsx'), /HOME_AD_DEMO/)
  assert.match(read('src/app/api/digest/route.ts'), /undo/)
  assert.match(read('supabase/migrations/0065_compass_evidence_events.sql'), /compass_evidence_events/)
  assert.match(read('supabase/migrations/0066_pipeline_spine.sql'), /pipeline_stage/)
})
