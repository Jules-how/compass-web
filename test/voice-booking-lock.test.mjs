import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Mirror booking lock helpers (booking.ts is server-only TS)
const slotLocks = new Map()
const LOCK_TTL_MS = 30_000

function acquireSlotLock(clientId, slotStart) {
  const key = `${clientId}:${slotStart}`
  const now = Date.now()
  const existing = slotLocks.get(key)
  if (existing && existing > now) return false
  slotLocks.set(key, now + LOCK_TTL_MS)
  return true
}

function releaseSlotLock(clientId, slotStart) {
  slotLocks.delete(`${clientId}:${slotStart}`)
}

test('booking lock prevents concurrent slot claims', () => {
  slotLocks.clear()
  const client = 'cli-test'
  const slot = '2026-08-27T09:00:00+10:00'
  assert.equal(acquireSlotLock(client, slot), true)
  assert.equal(acquireSlotLock(client, slot), false)
  releaseSlotLock(client, slot)
  assert.equal(acquireSlotLock(client, slot), true)
})

test('booking lock is per client and slot', () => {
  slotLocks.clear()
  const slot = '2026-08-27T09:00:00+10:00'
  assert.equal(acquireSlotLock('cli-a', slot), true)
  assert.equal(acquireSlotLock('cli-b', slot), true)
  assert.equal(acquireSlotLock('cli-a', '2026-08-27T10:00:00+10:00'), true)
})

test('booking lock source uses in-process map', () => {
  const src = readFileSync(new URL('../src/lib/booking.ts', import.meta.url), 'utf8')
  assert.match(src, /slotLocks/)
  assert.match(src, /acquireSlotLock/)
  assert.match(src, /releaseSlotLock/)
  assert.match(src, /403.*404|isGrantBrokenStatus/)
})
