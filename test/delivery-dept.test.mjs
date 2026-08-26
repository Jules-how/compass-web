import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDemoInstalls, demoNow } from '../src/lib/delivery-dept/demo.mjs'
import { boardColumns, capacity, loadPipeline } from '../src/lib/delivery-dept/orchestrator.mjs'
import { findVoiceLabRunner } from '../src/lib/delivery-dept/voice-lab.mjs'

test('compass deploy copy of delivery-dept still seeds the three demo shops', () => {
  const pipeline = loadPipeline()
  assert.equal(pipeline.columns.length, 7)
  const installs = buildDemoInstalls()
  const columns = boardColumns(installs, demoNow())
  assert.equal(columns.find((col) => col.id === 'number_strategy')?.cards.length, 1)
  assert.equal(columns.find((col) => col.id === 'calendar_grant')?.cards.length, 1)
  assert.equal(columns.find((col) => col.id === 'checkpoint')?.cards.length, 1)
  assert.equal(capacity(installs).cap, 10)
})

test('voice-lab is visible from the compass copy', () => {
  assert.ok(findVoiceLabRunner())
})
