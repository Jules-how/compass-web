import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isOpenOperatorEnabled,
  openOperatorCredentials,
} from '../src/lib/open-operator.ts'

test('hosted builds never automatically grant operator sessions, including explicit flag', () => {
  const keys = [
    'NODE_ENV',
    'COMPASS_OPEN_OPERATOR',
    'COMPASS_OPEN_OPERATOR_EMAIL',
    'COMPASS_OPEN_OPERATOR_PASSWORD',
  ]
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  try {
    process.env.NODE_ENV = 'production'
    process.env.COMPASS_OPEN_OPERATOR = '1'
    process.env.COMPASS_OPEN_OPERATOR_EMAIL = 'fixture@example.com'
    process.env.COMPASS_OPEN_OPERATOR_PASSWORD = 'local-test-only'
    assert.equal(isOpenOperatorEnabled(), false)
    assert.equal(openOperatorCredentials(), null)
    process.env.NODE_ENV = 'development'
    delete process.env.COMPASS_OPEN_OPERATOR
    assert.equal(openOperatorCredentials(), null)
    process.env.COMPASS_OPEN_OPERATOR = '1'
    delete process.env.COMPASS_OPEN_OPERATOR_PASSWORD
    assert.equal(openOperatorCredentials(), null)
  } finally {
    for (const k of keys)
      if (before[k] === undefined) delete process.env[k]
      else process.env[k] = before[k]
  }
})

import { isSessionCurrent } from '../src/lib/session-current.ts'
test('security reset rejects sessions issued before cutoff, including missing or invalid claims', () => {
  const user = { app_metadata: { compass_session_not_before: 100 } }
  const token = (n) =>
    'e30.' +
    Buffer.from(JSON.stringify({ iat: n })).toString('base64url') +
    '.verified-elsewhere'
  assert.equal(isSessionCurrent(user, token(99)), false)
  assert.equal(isSessionCurrent(user, token(100)), true)
  assert.equal(isSessionCurrent(user), false)
  assert.equal(isSessionCurrent(user, 'bad'), false)
  assert.equal(isSessionCurrent({}, token(1)), true)
})
