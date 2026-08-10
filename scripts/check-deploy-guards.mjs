#!/usr/bin/env node
/**
 * Fast guards for the two Vercel failure modes that kept red-deploying main:
 * 1) Illegal App Router route exports (helpers leaking from route.ts)
 * 2) @/ imports that resolve only to untracked/missing files (local build passes, Vercel fails)
 *
 * Usage: node scripts/check-deploy-guards.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

const ALLOWED_ROUTE_EXPORTS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'runtime',
  'dynamic',
  'revalidate',
  'preferredRegion',
  'maxDuration',
  'fetchCache',
  'dynamicParams',
  'segmentConfig',
  'generateStaticParams',
  'config'
])

const errors = []

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      walk(full, out)
    } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    })
    return new Set(out.split('\0').filter(Boolean))
  } catch {
    return null
  }
}

function resolveImport(spec) {
  const base = path.join(SRC, spec)
  // Explicit extension (e.g. .json via resolveJsonModule) — use the path as-is.
  if (path.extname(spec) && fs.existsSync(base) && fs.statSync(base).isFile()) {
    return base
  }
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js')
  ]
  return candidates.find((c) => fs.existsSync(c)) || null
}

function checkIllegalRouteExports(files) {
  const exportRe =
    /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_]+)/gm
  for (const file of files) {
    if (!file.endsWith(`${path.sep}route.ts`) && !file.endsWith(`${path.sep}route.js`)) {
      continue
    }
    if (!file.includes(`${path.sep}app${path.sep}`)) continue
    const text = fs.readFileSync(file, 'utf8')
    let match
    while ((match = exportRe.exec(text))) {
      const name = match[1]
      if (ALLOWED_ROUTE_EXPORTS.has(name)) continue
      errors.push(
        `${path.relative(ROOT, file)}: illegal route export \`${name}\` ` +
          `(Next only allows HTTP handlers / segment config — move helpers out of route.ts)`
      )
    }
  }
}

function checkAliasImports(files, tracked) {
  const importRe = /from\s+['"]@\/([^'"]+)['"]/g
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    let match
    while ((match = importRe.exec(text))) {
      const spec = match[1]
      // Skip type-only path quirks and CSS
      if (spec.endsWith('.css')) continue
      const resolved = resolveImport(spec)
      if (!resolved) {
        errors.push(
          `${path.relative(ROOT, file)}: missing module \`@/${spec}\` ` +
            `(import will fail on Vercel)`
        )
        continue
      }
      if (!tracked) continue
      const rel = path.relative(ROOT, resolved).split(path.sep).join('/')
      if (!tracked.has(rel)) {
        errors.push(
          `${path.relative(ROOT, file)}: \`@/${spec}\` resolves to untracked \`${rel}\` ` +
            `(local build can pass; Vercel only sees committed files)`
        )
      }
    }
  }
}

const files = walk(SRC)
const tracked = trackedFiles()
checkIllegalRouteExports(files)
checkAliasImports(files, tracked)

if (errors.length) {
  console.error('Deploy guards failed:\n')
  for (const err of errors) console.error(`  • ${err}`)
  console.error(`\n${errors.length} issue(s). Fix before pushing main.\n`)
  process.exit(1)
}

console.log('Deploy guards OK (route exports + tracked @/ imports).')
