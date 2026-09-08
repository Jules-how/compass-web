import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deliveryPaths, PIPELINE_PATH, DEMO_PATH } from '../src/lib/delivery-dept/paths.mjs'

test('delivery assets resolve from runtime root when bundled module path no longer exists', () => {
  const runtime = mkdtempSync(join(tmpdir(), 'compass-delivery-paths-'))
  try {
    const assets = join(runtime, 'src/lib/delivery-dept')
    mkdirSync(assets, { recursive: true })
    writeFileSync(join(assets, 'pipeline.json'), '{}')
    writeFileSync(join(assets, 'demo-installs.json'), '{}')
    assert.deepEqual(deliveryPaths(join(runtime, 'missing-build/source'), runtime), {
      pipeline: join(assets, 'pipeline.json'),
      demo: join(assets, 'demo-installs.json')
    })
  } finally {
    rmSync(runtime, { recursive: true, force: true })
  }
})

test('local delivery assets still resolve beside source module', () => {
  assert.equal(PIPELINE_PATH, new URL('../src/lib/delivery-dept/pipeline.json', import.meta.url).pathname)
  assert.equal(DEMO_PATH, new URL('../src/lib/delivery-dept/demo-installs.json', import.meta.url).pathname)
})
