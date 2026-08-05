import assert from 'node:assert/strict'
import test from 'node:test'

import { safePortalRedirect } from '../src/lib/portal-redirect.ts'

test('callback redirects are restricted to role-appropriate local paths', () => {
  assert.equal(safePortalRedirect('/delivery/project-a', 'customer'), '/leads')
  assert.equal(safePortalRedirect('/tasks', 'operator'), '/tasks')
  assert.equal(safePortalRedirect('/leads?city=Sydney', 'operator'), '/leads?city=Sydney')
  assert.equal(safePortalRedirect('/leads', 'customer'), '/leads')
  assert.equal(safePortalRedirect('/tasks', 'customer'), '/leads')
  assert.equal(safePortalRedirect('/projects', 'operator'), '/projects')
  assert.equal(safePortalRedirect('/functions', 'operator'), '/functions')
  assert.equal(safePortalRedirect('/projects', 'customer'), '/leads')
})

test('callback redirects reject external, protocol-relative and encoded escapes', () => {
  for (const candidate of [
    'https://attacker.example',
    '//attacker.example',
    '/\\attacker.example',
    '/%2f%2fattacker.example',
    '/auth/callback',
    '/api/delivery/projects'
  ]) {
    assert.equal(safePortalRedirect(candidate, 'customer'), '/leads')
  }
})
