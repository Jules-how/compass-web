import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual submit handler with its UI/cache boundaries supplied by the test.
const manager = readFileSync(new URL('../src/components/ProjectManager.tsx', import.meta.url), 'utf8')
const handler = manager.slice(manager.indexOf('  async function createProject('), manager.indexOf('  async function patchProjectStatus('))
const { outputText } = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })

function harness() {
  const state = { open: true, saving: false, error: null, resets: 0, refreshes: 0, requests: 0 }
  const cache = new Map()
  let resolve, reject
  const response = new Promise((yes, no) => { resolve = yes; reject = no })
  const context = {
    name: 'Fixture project', summary: 'Keep this summary', notes: 'Keep these notes',
    clientId: '', businessFunctionId: '', labels: 'alpha, beta', dependsOn: ['dependency-fixture'],
    milestones: [{ title: 'First milestone', description: 'Keep this milestone', target_date: '2026-09-30' }],
    startDate: '2026-09-10', targetDate: '2026-10-10', status: 'planned', priority: 2, saving: false,
    clientById: {}, crypto: { randomUUID: () => 'fixture' },
    emptyProjectStats: () => ({ issueCount: 0, completedCount: 0, percentComplete: 0 }),
    normalizeProjectStatus: value => value,
    setSaving: value => { state.saving = value; context.saving = value },
    setCreating: value => { state.open = value },
    setError: value => { state.error = value },
    resetCreateForm: () => { state.resets += 1; context.name = ''; context.notes = ''; context.milestones = [] },
    upsertCachedProject: project => cache.set(project.id, project),
    removeCachedProject: id => cache.delete(id),
    replaceCachedProject: (id, project) => { cache.delete(id); cache.set(project.id, project) },
    onRefresh: () => { state.refreshes += 1 },
    workFetch: () => { state.requests += 1; return response },
  }
  const create = vm.runInNewContext(`${outputText}\ncreateProject`, context)
  return { state, cache, context, create: () => create({ preventDefault() {} }), resolve, reject }
}

test('pending project creation keeps the draft open and blocks duplicate submissions', async () => {
  const run = harness()
  const pending = run.create()
  assert.equal(run.state.saving, true)
  assert.equal(run.state.open, true)
  assert.equal(run.state.resets, 0)
  assert.equal(run.cache.size, 1)
  await run.create()
  assert.equal(run.state.requests, 1)
  run.resolve({ ok: false, status: 503, json: async () => ({ error: 'Fixture save failure' }) })
  await pending
  assert.equal(run.context.name, 'Fixture project')
  assert.equal(run.context.notes, 'Keep these notes')
  assert.equal(run.context.milestones[0].title, 'First milestone')
  assert.equal(run.state.open, true)
  assert.equal(run.state.resets, 0)
  assert.equal(run.state.saving, false)
  assert.equal(run.state.error, 'Fixture save failure')
  assert.equal(run.cache.size, 0)
})

test('a network failure keeps the draft available for retry and removes the optimistic row', async () => {
  const run = harness()
  const pending = run.create()
  run.reject(new Error('Network unavailable'))
  await pending
  assert.equal(run.state.open, true)
  assert.equal(run.state.saving, false)
  assert.equal(run.state.resets, 0)
  assert.match(run.state.error, /Network unavailable/)
  assert.equal(run.cache.size, 0)
  run.context.workFetch = async () => ({ ok: true, json: async () => ({ id: 'fixture-saved', name: 'Fixture project' }) })
  await run.create()
  assert.equal(run.state.open, false)
  assert.equal(run.state.resets, 1)
  assert.equal(run.state.saving, false)
  assert.equal(run.state.error, null)
  assert.equal(run.state.refreshes, 1)
  assert.equal(run.cache.has('fixture-saved'), true)
  assert.equal(run.cache.size, 1)
})
