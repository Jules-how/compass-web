import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('project create paints the board from cache before list refetch', () => {
  const manager = read('src/components/ProjectManager.tsx')
  const panel = read('src/components/ProjectsPanel.tsx')
  const cache = read('src/lib/projects-cache.ts')
  const queryCache = read('src/lib/query-cache.ts')

  assert.match(manager, /upsertCachedProject/)
  assert.match(manager, /replaceCachedProject/)
  assert.match(manager, /project-temp-/)
  assert.match(manager, /void onRefresh\?\.\(\)/)
  assert.doesNotMatch(
    manager.slice(manager.indexOf('async function createProject'), manager.indexOf('async function patchProjectStatus')),
    /await onRefresh/
  )

  assert.match(panel, /PROJECTS_CACHE_KEY/)
  assert.match(cache, /export function upsertCachedProject/)
  assert.match(cache, /export function replaceCachedProject/)
  assert.match(queryCache, /bumpGeneration/)
  assert.match(queryCache, /generations\.get\(key\) !== gen/)
})
