import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts/check-deploy-guards.mjs')

test('deploy guards script exists and passes on clean tree', () => {
  assert.ok(fs.existsSync(script))
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /Deploy guards OK/)
})

test('deploy guards catch untracked @/ import targets', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-guards-'))
  const srcLib = path.join(tmp, 'src/lib')
  const srcComp = path.join(tmp, 'src/components')
  fs.mkdirSync(srcLib, { recursive: true })
  fs.mkdirSync(srcComp, { recursive: true })
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
  fs.copyFileSync(script, path.join(tmp, 'scripts/check-deploy-guards.mjs'))

  // Tracked importer; missing module on disk.
  fs.writeFileSync(
    path.join(srcComp, 'Broken.tsx'),
    "import { x } from '@/lib/does-not-exist'\nexport const Broken = x\n"
  )

  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' })
  spawnSync('git', ['add', 'src/components/Broken.tsx', 'scripts/check-deploy-guards.mjs'], {
    cwd: tmp,
    encoding: 'utf8'
  })

  const missing = spawnSync(process.execPath, ['scripts/check-deploy-guards.mjs'], {
    cwd: tmp,
    encoding: 'utf8'
  })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr + missing.stdout, /missing module/)

  // Untracked module present on disk (the Vercel footgun).
  fs.writeFileSync(path.join(srcLib, 'ghost.ts'), 'export const x = 1\n')
  fs.writeFileSync(
    path.join(srcComp, 'Broken.tsx'),
    "import { x } from '@/lib/ghost'\nexport const Broken = x\n"
  )
  spawnSync('git', ['add', 'src/components/Broken.tsx'], { cwd: tmp, encoding: 'utf8' })

  const untracked = spawnSync(process.execPath, ['scripts/check-deploy-guards.mjs'], {
    cwd: tmp,
    encoding: 'utf8'
  })
  assert.notEqual(untracked.status, 0)
  assert.match(untracked.stderr + untracked.stdout, /untracked/)
})

test('deploy guards catch illegal route.ts helper exports', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-guards-route-'))
  const routeDir = path.join(tmp, 'src/app/api/demo')
  fs.mkdirSync(routeDir, { recursive: true })
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true })
  fs.copyFileSync(script, path.join(tmp, 'scripts/check-deploy-guards.mjs'))
  fs.writeFileSync(
    path.join(routeDir, 'route.ts'),
    `export const dynamic = 'force-dynamic'\nexport function helperPassword() { return 'x' }\nexport async function GET() { return Response.json({}) }\n`
  )
  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' })
  spawnSync('git', ['add', '.'], { cwd: tmp, encoding: 'utf8' })

  const result = spawnSync(process.execPath, ['scripts/check-deploy-guards.mjs'], {
    cwd: tmp,
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr + result.stdout, /illegal route export/)
})
