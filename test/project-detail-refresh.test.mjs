import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/ProjectDetailPanel.tsx', import.meta.url), 'utf8')
const handler = source.slice(source.indexOf('  const load = useCallback('), source.indexOf('  useEffect(() => {\n    activeProjectId.current'))
const { outputText } = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })

function harness() {
  const state = { dependencies: [], detail: null, projects: [], error: null, requests: 0, fetchOptions: [] }
  const pending = []
  const context = {
    projectId: 'fixture-one', activeProjectId: { current: 'fixture-one' }, loadGeneration: { current: 0 },
    projectsPropRef: { current: [{ id: 'fixture-one', name: 'Original name' }] },
    useCallback: (fn, dependencies) => { state.dependencies = dependencies; return fn },
    setError: error => { state.error = error },
    applyDetail: detail => { state.detail = detail },
    setAllProjects: projects => { state.projects = projects },
    workFetch: (_path, options) => {
      state.requests += 1
      state.fetchOptions.push(options)
      return new Promise((resolve, reject) => pending.push({ resolve, reject }))
    },
  }
  const load = vm.runInNewContext(`${outputText}\nload`, context)
  const resolve = (index, id = 'fixture-one') => pending[index].resolve({ ok: true, json: async () => ({ project: { id } }) })
  return { load, state, context, resolve }
}

test('the detail loader depends on project identity, not the refreshing list array', async () => {
  const run = harness()
  assert.equal(run.state.dependencies.length, 2)
  assert.equal(run.state.dependencies[0], run.context.applyDetail)
  assert.equal(run.state.dependencies[1], 'fixture-one')
  const loading = run.load()
  // A cache refresh updates picker choices without becoming a detail-reset dependency.
  const refreshed = [{ id: 'fixture-one', name: 'New list metadata' }]
  run.context.projectsPropRef.current = refreshed
  run.resolve(0)
  await loading
  assert.equal(run.state.projects, refreshed)
  assert.equal(run.state.requests, 1)
  assert.equal(run.state.fetchOptions[0].cache, 'no-store')
})

test('a response from an older detail request cannot overwrite an explicit newer reload', async () => {
  const run = harness()
  const older = run.load()
  const newer = run.load()
  run.resolve(1, 'new-response')
  await newer
  run.resolve(0, 'old-response')
  await older
  assert.equal(run.state.detail.project.id, 'new-response')
})

test('changing selected project invalidates old responses and old callbacks', async () => {
  const run = harness()
  const loading = run.load()
  run.context.activeProjectId.current = 'fixture-two'
  run.context.loadGeneration.current += 1
  run.resolve(0)
  await loading
  assert.equal(run.state.detail, null)
  await run.load()
  assert.equal(run.state.requests, 1)
})
