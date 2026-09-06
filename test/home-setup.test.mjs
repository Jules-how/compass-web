import assert from 'node:assert/strict'
import test from 'node:test'

const TASK_TYPES = ['SELL', 'BUILD', 'DELIVER', 'THINK', 'ADMIN']

function mergeScanRecords(existing, incoming) {
  return { ...(existing ?? {}), ...(incoming ?? {}) }
}

function asText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function asTaskType(value) {
  if (typeof value !== 'string') return null
  return TASK_TYPES.includes(value) ? value : null
}

function parseJulesLed(value) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const title = asText(raw.title)
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title,
      detail: asText(raw.detail) ?? undefined,
      taskType: asTaskType(raw.taskType ?? raw.task_type)
    })
  }
  return out
}

function parseHomeSetupScan(scan) {
  const row = scan ?? {}
  return {
    homeBlurb: asText(row.homeBlurb) ?? asText(row.home_blurb),
    writeup: asText(row.writeup),
    julesLed: parseJulesLed(row.julesLed ?? row.jules_led)
  }
}

function slugHomeTitle(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'item'
}

function dailySetupNoteMarker(day, title) {
  return `daily_setup:${day}:${slugHomeTitle(title)}`
}

function cardBriefLine(homeBlurb, recommendation) {
  const text = (homeBlurb || recommendation || '').trim()
  if (!text) return 'Today’s next is waiting.'
  const first = text.split(/(?<=\.)\s+/)[0]?.trim()
  return first || text
}

test('scan merge keeps writeup beside Instantly stats', () => {
  const merged = mergeScanRecords(
    { writeup: 'Do locksmith openers', emailsSentToday: 0 },
    { emailsSentToday: 12, replyRate: 1.3 }
  )
  assert.equal(merged.writeup, 'Do locksmith openers')
  assert.equal(merged.emailsSentToday, 12)
})

test('julesLed parses titles and drops blanks', () => {
  const out = parseJulesLed([
    { title: 'Tick locksmith openers', detail: 'Match Instantly', task_type: 'SELL' },
    { title: '  ' },
    { title: 'Tick locksmith openers' }
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].taskType, 'SELL')
})

test('home scan reads writeup and julesLed', () => {
  const setup = parseHomeSetupScan({
    homeBlurb: 'Wait on land. Lists are empty.',
    writeup: 'Full synthesis',
    julesLed: [{ title: 'Review Gmail' }]
  })
  assert.equal(setup.writeup, 'Full synthesis')
  assert.equal(setup.julesLed[0].title, 'Review Gmail')
})

test('card line uses first sentence then fallback', () => {
  assert.equal(cardBriefLine(null, null), 'Today’s next is waiting.')
  assert.equal(cardBriefLine('Keep watch. Do not land.', null), 'Keep watch.')
})

test('daily setup marker is stable for a title', () => {
  assert.equal(
    dailySetupNoteMarker('2026-09-06', 'Tick locksmith openers'),
    'daily_setup:2026-09-06:tick-locksmith-openers'
  )
})
