import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

function ingestSkipReason(mapped) {
  if (!normalizeEmail(mapped.email)) return 'missing email'
  if (!mapped.company.trim()) return 'missing company'
  return null
}

function decideLeadCommit(mapped) {
  const reason = ingestSkipReason(mapped)
  if (reason) return { skip: reason }
  return { ok: true }
}

test('commit skips missing email or company before insert', () => {
  const commit = readFileSync(resolve(root, 'src/lib/lead-commit.ts'), 'utf8')
  const route = readFileSync(resolve(root, 'src/app/api/agent/leads/route.ts'), 'utf8')
  assert.match(commit, /export function decideLeadCommit/)
  assert.match(commit, /ingestSkipReason/)
  assert.match(commit, /matched company domain/)
  assert.match(route, /export async function POST/)
  assert.match(route, /commitLeadRows/)
  assert.deepEqual(decideLeadCommit({ email: '', company: 'Acme' }), { skip: 'missing email' })
  assert.deepEqual(decideLeadCommit({ email: 'ada@x.com', company: '' }), { skip: 'missing company' })
  assert.deepEqual(decideLeadCommit({ email: 'ada@x.com', company: 'Acme' }), { ok: true })
})
