import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const { selectHomeWork } = loadTypescript('src/lib/folio-home.ts')
test('Home keeps blocked work out of ready work and omits closed tasks', () => {
  const tasks = [
    { id: '1', title: 'Waiting on reply', status: 'blocked', priority: 1 },
    { id: '2', title: 'Review brief', status: 'not-started', priority: 2 },
    { id: '3', title: 'Finished', status: 'completed', priority: 1 },
    { id: '4', title: 'Cancelled', status: 'cancelled', priority: 1 },
  ]
  const { ready, waiting } = selectHomeWork(tasks)
  assert.deepEqual(
    ready.map((t) => t.id),
    ['2'],
  )
  assert.deepEqual(
    waiting.map((t) => t.id),
    ['1'],
  )
})
test('Home preserves source records and puts unset priority after explicit priorities', () => {
  const tasks = [
    { id: '0', title: 'Unset', status: 'not-started', priority: 0 },
    { id: '2', title: 'Later', status: 'in-progress', priority: 2 },
    { id: '1', title: 'Urgent', status: 'not-started', priority: 1 },
  ]
  const before = structuredClone(tasks)
  assert.deepEqual(
    selectHomeWork(tasks).ready.map((t) => t.id),
    ['1', '2', '0'],
  )
  assert.deepEqual(tasks, before)
})
