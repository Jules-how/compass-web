import assert from 'node:assert/strict'
import test from 'node:test'

function chunkIds(ids, size = 200) {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  const chunks = []
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size))
  }
  return chunks
}

test('chunkIds dedupes and pages', () => {
  const chunks = chunkIds([' a ', 'b', 'a', '', 'c'], 2)
  assert.deepEqual(chunks, [['a', 'b'], ['c']])
})

test('empty ids yields no chunks', () => {
  assert.deepEqual(chunkIds(['', '  ']), [])
})
