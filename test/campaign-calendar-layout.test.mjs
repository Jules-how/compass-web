import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function loadSource(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

const timeline = loadSource('../src/lib/campaign-timeline.ts')
const { layoutTimedEvents, CALENDAR_EVENT_HEIGHT, CALENDAR_HOUR_HEIGHT } = loadSource(
  '../src/lib/campaign-calendar.ts', { '@/lib/campaign-timeline': timeline }
)

function events(...minutes) {
  return minutes.map((minutes, index) => ({ id: String(index), minutes }))
}

test('same-time campaigns have equal, separate lanes without changing timestamps', () => {
  const input = events(540, 540, 540)
  const before = structuredClone(input)
  const result = layoutTimedEvents(input)
  assert.deepEqual(result.map(({ lane, laneCount }) => [lane, laneCount]), [[0, 3], [1, 3], [2, 3]])
  assert.deepEqual(result.map(({ minutes }) => minutes), [540, 540, 540])
  assert.deepEqual(input, before)
})

test('partial overlaps share lanes while adjacent and later groups regain full width', () => {
  const result = layoutTimedEvents(events(0, 30, 90, 150), 60)
  assert.deepEqual(result.map(({ lane, laneCount }) => [lane, laneCount]), [[0, 2], [1, 2], [0, 1], [0, 1]])
})

test('transitively overlapping campaigns use consistent widths and never collide', () => {
  const result = layoutTimedEvents(events(0, 10, 20, 60, 70, 80, 110), 60)
  assert.ok(result.every((event) => event.laneCount === 4))
  for (const a of result) for (const b of result) {
    if (a.id === b.id || a.minutes >= b.minutes + 60 || b.minutes >= a.minutes + 60) continue
    const aLeft = a.lane / a.laneCount
    const aRight = (a.lane + 1) / a.laneCount
    const bLeft = b.lane / b.laneCount
    const bRight = (b.lane + 1) / b.laneCount
    assert.ok(aRight <= bLeft || bRight <= aLeft, `${a.id} collides with ${b.id}`)
  }
})

test('default overlap duration follows the rendered card height', () => {
  const duration = CALENDAR_EVENT_HEIGHT / CALENDAR_HOUR_HEIGHT * 60
  const result = layoutTimedEvents(events(0, duration - 1, 2 * duration - 1))
  assert.deepEqual(result.map(({ laneCount }) => laneCount), [2, 2, 1])
  assert.deepEqual(layoutTimedEvents([]), [])
})
