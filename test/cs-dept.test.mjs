import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CS_AT_RISK_SCORE,
  CS_GUARANTEE_DAY,
  CS_INSTALL_AUD,
  assembleBoard,
  buildDemoBoard,
  demoClientInputs,
  evaluateClient,
  guaranteeState,
  healthBand,
  jobContributionAud,
  roiProjection,
  scoreBookedShowed,
  scoreCallVolume,
  scoreClientHealth,
  scoreOwnerEngagement,
  scorePayment,
  scoreSupport
} from '../src/lib/cs-dept/engine.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('call volume and booked/showed trend scores', () => {
  assert.equal(scoreCallVolume(18, 16), 20)
  assert.equal(scoreCallVolume(4, 14), 2)
  assert.equal(scoreCallVolume(0, 0), 6)
  const booked = scoreBookedShowed({ bookedThis: 7, bookedLast: 6, showedThis: 6, showedLast: 5 })
  assert.equal(booked.points, 20)
  assert.ok(booked.showRate >= 0.8)
  const drop = scoreBookedShowed({ bookedThis: 1, bookedLast: 6, showedThis: 1, showedLast: 5 })
  assert.ok(drop.points < 12)
})

test('owner, payment, and support factors', () => {
  assert.equal(scoreOwnerEngagement(2), 20)
  assert.equal(scoreOwnerEngagement(18), 8)
  assert.equal(scoreOwnerEngagement(24), 4)
  assert.equal(scorePayment('current'), 20)
  assert.equal(scorePayment('overdue'), 4)
  assert.equal(scoreSupport({ openIssues: 0 }), 20)
  assert.equal(scoreSupport({ openIssues: 2, blockedIssues: 1, complaints: 1 }), 0)
})

test('health band and at risk drop', () => {
  assert.equal(healthBand(88), 'healthy')
  assert.equal(healthBand(60), 'watch')
  assert.equal(healthBand(CS_AT_RISK_SCORE - 1), 'at_risk')
  const dropped = scoreClientHealth({
    callsThis: 4,
    callsLast: 14,
    bookedThis: 1,
    bookedLast: 6,
    showedThis: 1,
    showedLast: 5,
    daysSinceOwnerEngaged: 18,
    paymentStatus: 'current',
    openIssues: 1,
    priorScore: 82
  })
  assert.equal(dropped.at_risk, true)
  assert.ok(dropped.drop_points >= 15)
})

test('day 25 guarantee uses showed jobs times contribution', () => {
  const now = new Date('2026-08-26T07:00:00+10:00')
  const pass = guaranteeState(
    {
      startDate: '2026-08-01',
      showedToDate: 13,
      trade: 'electrical',
      jobContributionAud: 380,
      feesPaid: CS_INSTALL_AUD
    },
    now
  )
  assert.equal(pass.due, true)
  assert.equal(pass.day_index, CS_GUARANTEE_DAY)
  assert.equal(pass.made_fees_back, true)
  assert.equal(pass.recovered, 13 * 380)

  const fail = guaranteeState(
    {
      startDate: '2026-08-01',
      showedToDate: 2,
      trade: 'roofing',
      jobContributionAud: 650,
      feesPaid: CS_INSTALL_AUD
    },
    now
  )
  assert.equal(fail.made_fees_back, false)
  assert.equal(fail.shortfall, CS_INSTALL_AUD - 1300)
})

test('demo board covers every CS output and names real numbers in the save play', () => {
  const board = buildDemoBoard()
  assert.equal(board.cards.length, 5)
  const kinds = new Set(board.artifacts.map((row) => row.kind))
  for (const kind of ['weekly_summary', 'monday_sms', 'monday_email', 'save_play', 'guarantee', 'qbr']) {
    assert.ok(kinds.has(kind), `missing ${kind}`)
  }

  const northside = board.cards.find((row) => row.client.id === 'cs-demo-northside')
  assert.ok(northside)
  assert.equal(northside.attention, 'at_risk')
  const save = northside.artifacts.find((row) => row.kind === 'save_play')
  assert.match(save.body, /Priya/)
  assert.match(save.body, /booked 6/)
  assert.match(save.body, /This week it is 1 booked/)
  assert.match(save.body, /Calls went from 14 to 4/)

  const volt = board.cards.find((row) => row.client.id === 'cs-demo-volt')
  assert.equal(volt.checkpoint.made_fees_back, true)
  assert.ok(volt.artifacts.some((row) => row.kind === 'guarantee'))

  const ridge = board.cards.find((row) => row.client.id === 'cs-demo-ridge')
  assert.equal(ridge.checkpoint.made_fees_back, false)
  assert.match(ridge.artifacts.find((row) => row.kind === 'guarantee').body, /Short by/)

  const harbour = board.cards.find((row) => row.client.id === 'cs-demo-harbour')
  assert.equal(harbour.attention, 'healthy')
  const coastal = board.cards.find((row) => row.client.id === 'cs-demo-coastal')
  assert.ok(coastal.artifacts.some((row) => row.kind === 'qbr'))

  const weekly = harbour.artifacts.find((row) => row.kind === 'weekly_summary')
  const roi = roiProjection(weekly)
  assert.equal(roi.booked, 7)
  assert.equal(roi.showed, 6)
  assert.ok(!('health_score' in roi))
})

test('assembleBoard puts at risk before healthy', () => {
  const now = new Date('2026-08-26T07:00:00+10:00')
  const results = demoClientInputs(now).map((client) => evaluateClient(client, now))
  const board = assembleBoard(results, now)
  assert.equal(board.cards[0].attention, 'at_risk')
  assert.equal(board.cards.at(-1).attention, 'healthy')
})

test('job contribution defaults by trade', () => {
  assert.equal(jobContributionAud('plumbing'), 420)
  assert.equal(jobContributionAud('roofing'), 650)
  assert.equal(jobContributionAud('unknown', 275), 275)
})

test('CS routes, nav, and migration are wired', () => {
  const page = read('src/app/(console)/operations/cs/page.tsx')
  const keepAlive = read('src/components/ConsoleHomeInboxKeepAlive.tsx')
  const api = read('src/app/api/cs/route.ts')
  const agent = read('src/app/api/agent/cs/route.ts')
  const nav = read('src/components/NavLinks.tsx')
  const migration = read('supabase/migrations/0075_compass_cs_dept.sql')
  const detail = read('src/components/clients/ClientDetailPanel.tsx')

  assert.match(page, /OperatorShell/)
  assert.match(keepAlive, /CsDeptBoard/)
  assert.match(api, /runCsDept/)
  assert.match(agent, /requireAgentAuth/)
  assert.match(nav, /\/operations\/cs/)
  assert.match(nav, /Retention/)
  assert.match(migration, /compass_cs_snapshots/)
  assert.match(migration, /compass_cs_artifacts/)
  assert.match(migration, /cs-demo-harbour/)
  assert.match(detail, /CsClientHealth/)
})
