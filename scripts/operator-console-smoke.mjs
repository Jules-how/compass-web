#!/usr/bin/env node
/**
 * Static smoke: operator console routes and APIs exist in the source tree.
 * Does not hit a live Vercel deploy (needs Jules login + env).
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const required = [
  'src/app/leads/page.tsx',
  'src/app/inbox/page.tsx',
  'src/app/tasks/page.tsx',
  'src/app/projects/page.tsx',
  'src/app/projects/[id]/page.tsx',
  'src/app/functions/page.tsx',
  'src/components/ProjectDetailPanel.tsx',
  'src/lib/project-stats.ts',
  'src/lib/project-pm.ts',
  'src/lib/open-operator.ts',
  'supabase/migrations/0027_compass_project_management.sql',
  'src/app/api/tasks/route.ts',
  'src/app/api/tasks/[id]/route.ts',
  'src/app/api/projects/route.ts',
  'src/app/api/projects/[id]/route.ts',
  'src/app/api/functions/route.ts',
  'src/app/api/functions/[id]/route.ts',
  'src/components/NavLinks.tsx',
  'src/components/OperatorShell.tsx',
  'vercel.json',
  'scripts/CUTOVER.md'
]

let failed = 0
for (const rel of required) {
  const path = resolve(root, rel)
  if (!existsSync(path)) {
    console.error(`MISSING ${rel}`)
    failed += 1
  } else {
    console.log(`ok ${rel}`)
  }
}

assert.equal(failed, 0, `${failed} required path(s) missing`)
console.log('operator-console-smoke: PASS')
