import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('cache deduplicates and prevents an older request from overwriting a mutation', async () => {
  const cache = loadTypescript('src/lib/query-cache.ts')
  const request = deferred()
  let calls = 0
  const first = cache.loadQueryCache('a', () => { calls++; return request.promise })
  const second = cache.loadQueryCache('a', () => { calls++; return Promise.resolve('wrong') })
  cache.writeQueryCache('a', 'mutation')
  request.resolve('old')
  await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(cache.peekQueryCache('a').data, 'mutation')
})

test('cache isolates racing keys and preserves stale same-key content on error', async () => {
  const cache = loadTypescript('src/lib/query-cache.ts')
  const request = deferred()
  const first = cache.loadQueryCache('a', () => request.promise)
  await cache.loadQueryCache('b', async () => 'B')
  request.resolve('A')
  await first
  await cache.loadQueryCache('b', async () => { throw new Error('offline') }, { force: true })
  assert.equal(cache.peekQueryCache('a').data, 'A')
  assert.equal(cache.peekQueryCache('b').data, 'B')
  assert.equal(cache.peekQueryCache('b').error, 'offline')
})

test('hook loading derives from current key, and hidden panes do not start refreshes', () => {
  const cache = loadTypescript('src/lib/query-cache.ts')
  cache.writeQueryCache('a', { name: 'A' })
  let active = true
  let effects = []
  const { useCachedJson } = loadTypescript('src/lib/use-cached-json.ts', {
    '@/lib/query-cache': cache,
    '@/components/ActivePane': { useActivePane: () => active },
    '@/lib/workspace-change': { onWorkChanged: () => () => {} },
    react: {
      useCallback: fn => fn, useRef: value => ({ current: value }),
      useEffect: fn => effects.push(fn),
      useSyncExternalStore: (_subscribe, snapshot) => snapshot()
    }
  })
  assert.deepEqual(useCachedJson('a', '/a').data, { name: 'A' })
  const next = useCachedJson('b', '/b')
  assert.equal(next.data, undefined)
  assert.equal(next.loading, true)
  active = false
  effects = []
  const hidden = useCachedJson('/api/tasks', '/api/tasks')
  assert.equal(hidden.loading, false)
  // These effects would access fetch/window if the hidden surface registered work.
  for (const effect of effects) effect()
  assert.equal(cache.peekQueryCache('/api/tasks'), null)
})

test('visible-pane instrumentation is harmless without a navigation measurement', () => {
  const { recordPaneVisibleFrame } = loadTypescript('src/components/ConsoleNav.tsx', {
    'next/navigation': { usePathname: () => '/home', useRouter: () => ({}) }
  })
  // Initial document render is not a click measurement and needs no frame callback.
  assert.equal(typeof recordPaneVisibleFrame('home'), 'function')
})
