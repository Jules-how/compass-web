import assert from 'node:assert/strict'
import test from 'node:test'

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, n) {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

function goLiveFallsInPeriod(goLiveAt, rangeStart, rangeEnd) {
  if (!goLiveAt) return false
  const date = new Date(goLiveAt)
  if (Number.isNaN(date.getTime())) return false
  const local = startOfDay(date)
  return local >= rangeStart && local <= rangeEnd
}

function datedGoLiveCampaigns(rows) {
  const items = []
  for (const row of rows) {
    if (!row.go_live_at) continue
    const date = new Date(row.go_live_at)
    if (Number.isNaN(date.getTime())) continue
    const day = startOfDay(date)
    items.push({ id: row.id, start: day, end: day })
  }
  return items
}

test('go-live events are a single local day, not a span', () => {
  const goLive = new Date(2026, 7, 11, 9, 0, 0).toISOString()
  const items = datedGoLiveCampaigns([
    { id: 'a', go_live_at: goLive },
    { id: 'b', go_live_at: null }
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].start.getTime(), items[0].end.getTime())
  assert.equal(items[0].start.getDate(), 11)
  assert.equal(items[0].start.getMonth(), 7)

  const weekStart = startOfDay(new Date(2026, 7, 10))
  const weekEnd = addDays(weekStart, 6)
  assert.equal(goLiveFallsInPeriod(goLive, weekStart, weekEnd), true)
  assert.equal(goLiveFallsInPeriod(goLive, addDays(weekStart, 7), addDays(weekEnd, 7)), false)
  assert.equal(goLiveFallsInPeriod(null, weekStart, weekEnd), false)
})
