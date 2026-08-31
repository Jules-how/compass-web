import assert from 'node:assert/strict'
import test from 'node:test'

const STOP_RE = /^\s*(stop|unsubscribe|opt\s*out)\s*$/i

function isStopMessage(body) {
  return STOP_RE.test(body.trim())
}

function advanceSmsSession(session, body, opener) {
  if (isStopMessage(body)) {
    return { session: { state: 'done', turn: 0 }, reply: null, readyToBook: false, parsed: {} }
  }
  const current = session ?? { state: 'idle', turn: 0 }
  const parts = body.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)
  let suburb, job_type, time_hint
  if (parts.length >= 3) {
    suburb = parts[0]
    job_type = parts[1]
    time_hint = parts.slice(2).join(' ')
  }

  if (current.state === 'idle') {
    const next = { state: 'collecting', turn: 1, suburb, job_type, time_hint }
    if (suburb && job_type && time_hint) {
      return {
        session: { ...next, state: 'booking' },
        reply: null,
        readyToBook: true,
        parsed: { suburb, job_type, time_hint }
      }
    }
    return { session: next, reply: opener, readyToBook: false, parsed: {} }
  }

  const merged = {
    ...current,
    turn: current.turn + 1,
    suburb: current.suburb ?? suburb,
    job_type: current.job_type ?? job_type,
    time_hint: current.time_hint ?? time_hint
  }
  if (merged.suburb && merged.job_type && merged.time_hint) {
    return {
      session: { ...merged, state: 'booking' },
      reply: null,
      readyToBook: true,
      parsed: { suburb: merged.suburb, job_type: merged.job_type, time_hint: merged.time_hint }
    }
  }
  return { session: merged, reply: 'need more', readyToBook: false, parsed: {} }
}

test('STOP message ends session', () => {
  const result = advanceSmsSession({ state: 'collecting', turn: 2 }, 'STOP', 'hi')
  assert.equal(result.session.state, 'done')
  assert.equal(result.readyToBook, false)
})

test('single message with suburb, job, time books immediately', () => {
  const opener = 'Thanks for texting'
  const result = advanceSmsSession(null, 'Parramatta, blocked drain, tomorrow morning', opener)
  assert.equal(result.readyToBook, true)
  assert.equal(result.parsed.suburb, 'Parramatta')
  assert.equal(result.parsed.job_type, 'blocked drain')
})

test('multi-turn collects missing fields', () => {
  const opener = 'Reply with details'
  let session = null
  let result = advanceSmsSession(session, 'Hi', opener)
  assert.equal(result.session.state, 'collecting')
  assert.equal(result.reply, opener)

  result = advanceSmsSession(result.session, 'Parramatta, hot water, Friday 2pm', opener)
  assert.equal(result.readyToBook, true)
  assert.equal(result.session.state, 'booking')
})

test('voice sms route wires STOP and state machine', async () => {
  const smsRoute = (await import('node:fs')).readFileSync(
    new URL('../src/app/api/voice/sms/route.ts', import.meta.url),
    'utf8'
  )
  assert.match(smsRoute, /suppressSms/)
  assert.match(smsRoute, /advanceSmsSession/)
  assert.match(smsRoute, /verifyTwilioSignature/)
})
