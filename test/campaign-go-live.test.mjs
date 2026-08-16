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

test('timed calendar events stay on one day and stack into the next free hour', () => {
  const CALENDAR_HOUR_HEIGHT = 64
  const CALENDAR_EVENT_HEIGHT = 56
  function eventOffsetPx(minutes) {
    return (minutes / 60) * CALENDAR_HOUR_HEIGHT
  }
  function goLiveAtFromSlot(day, hour, minute = 0) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0).toISOString()
  }
  function toDateOnly(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  function nextOpenGoLiveAt(day, preferredHour, occupiedIsos, ignoreIso) {
    const key = toDateOnly(day)
    const occupied = new Set()
    for (const iso of occupiedIsos) {
      if (!iso || iso === ignoreIso) continue
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) continue
      if (toDateOnly(date) !== key) continue
      occupied.add(date.getHours())
    }
    const start = Math.max(0, Math.min(23, Math.floor(preferredHour)))
    if (!occupied.has(start)) return goLiveAtFromSlot(day, start)
    for (let hour = start + 1; hour < 24; hour++) {
      if (!occupied.has(hour)) return goLiveAtFromSlot(day, hour)
    }
    for (let hour = start - 1; hour >= 0; hour--) {
      if (!occupied.has(hour)) return goLiveAtFromSlot(day, hour)
    }
    return goLiveAtFromSlot(day, start)
  }

  assert.ok(CALENDAR_EVENT_HEIGHT < CALENDAR_HOUR_HEIGHT)
  assert.equal(eventOffsetPx(9 * 60), 9 * CALENDAR_HOUR_HEIGHT)

  const tue = new Date(2026, 7, 11)
  const slot = new Date(goLiveAtFromSlot(tue, 12))
  assert.equal(slot.getFullYear(), 2026)
  assert.equal(slot.getMonth(), 7)
  assert.equal(slot.getDate(), 11)
  assert.equal(slot.getHours(), 12)

  const nine = goLiveAtFromSlot(tue, 9)
  const stacked = new Date(nextOpenGoLiveAt(tue, 9, [nine]))
  assert.equal(stacked.getHours(), 10)
  const third = new Date(nextOpenGoLiveAt(tue, 9, [nine, stacked.toISOString()]))
  assert.equal(third.getHours(), 11)
})
