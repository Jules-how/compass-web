export type SmsConversationState = 'idle' | 'collecting' | 'booking' | 'done'

export type SmsSession = {
  state: SmsConversationState
  turn: number
  suburb?: string
  job_type?: string
  time_hint?: string
  caller_name?: string
}

export type SmsTransitionResult = {
  session: SmsSession
  reply: string | null
  readyToBook: boolean
  parsed: {
    suburb?: string
    job_type?: string
    time_hint?: string
    caller_name?: string
  }
}

const MAX_TURNS = 4

const STOP_RE = /^\s*(stop|unsubscribe|opt\s*out)\s*$/i

export function isStopMessage(body: string): boolean {
  return STOP_RE.test(body.trim())
}

function extractField(body: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return undefined
}

function parseCombinedMessage(body: string): {
  suburb?: string
  job_type?: string
  time_hint?: string
} {
  const lower = body.toLowerCase()
  const suburb =
    extractField(body, [
      /suburb[:\s]+([^,\n]+)/i,
      /in\s+([A-Za-z][A-Za-z\s'-]{2,40})/i
    ]) ?? undefined

  const job_type =
    extractField(body, [/job[:\s]+([^,\n]+)/i, /(?:need|for)\s+(?:a\s+)?([^,\n]+?)(?:\s+in\s+|\s+at\s+|$)/i]) ??
    undefined

  const time_hint =
    extractField(body, [
      /(?:time|when)[:\s]+([^,\n]+)/i,
      /(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
    ]) ?? undefined

  if (!suburb && !job_type && !time_hint && body.trim().length > 2) {
    const parts = body.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 3) {
      return { suburb: parts[0], job_type: parts[1], time_hint: parts.slice(2).join(' ') }
    }
    if (parts.length === 2) {
      return { suburb: parts[0], job_type: parts[1] }
    }
    if (parts.length === 1 && !lower.includes(' ')) {
      return { suburb: parts[0] }
    }
  }

  return { suburb, job_type, time_hint }
}

export function advanceSmsSession(
  session: SmsSession | null,
  body: string,
  opener: string
): SmsTransitionResult {
  if (isStopMessage(body)) {
    return {
      session: { state: 'done', turn: 0 },
      reply: null,
      readyToBook: false,
      parsed: {}
    }
  }

  const current: SmsSession = session ?? { state: 'idle', turn: 0 }
  const parsed = parseCombinedMessage(body)

  if (current.state === 'idle') {
    const next: SmsSession = {
      state: 'collecting',
      turn: 1,
      suburb: parsed.suburb,
      job_type: parsed.job_type,
      time_hint: parsed.time_hint
    }
    if (next.suburb && next.job_type && next.time_hint) {
      return {
        session: { ...next, state: 'booking' },
        reply: null,
        readyToBook: true,
        parsed: {
          suburb: next.suburb,
          job_type: next.job_type,
          time_hint: next.time_hint
        }
      }
    }
    return {
      session: next,
      reply: opener,
      readyToBook: false,
      parsed: {}
    }
  }

  const merged: SmsSession = {
    ...current,
    turn: current.turn + 1,
    suburb: current.suburb ?? parsed.suburb,
    job_type: current.job_type ?? parsed.job_type,
    time_hint: current.time_hint ?? parsed.time_hint
  }

  if (merged.suburb && merged.job_type && merged.time_hint) {
    return {
      session: { ...merged, state: 'booking' },
      reply: null,
      readyToBook: true,
      parsed: {
        suburb: merged.suburb,
        job_type: merged.job_type,
        time_hint: merged.time_hint
      }
    }
  }

  if (merged.turn >= MAX_TURNS) {
    const missing = [
      !merged.suburb ? 'suburb' : null,
      !merged.job_type ? 'job type' : null,
      !merged.time_hint ? 'when you need us' : null
    ]
      .filter(Boolean)
      .join(', ')
    return {
      session: { ...merged, state: 'done' },
      reply: `Thanks. We are missing ${missing}. Someone will call you back to finish the booking.`,
      readyToBook: false,
      parsed: {}
    }
  }

  const missing = [
    !merged.suburb ? 'suburb' : null,
    !merged.job_type ? 'job type' : null,
    !merged.time_hint ? 'when you need us' : null
  ]
    .filter(Boolean)
    .join(', ')

  return {
    session: merged,
    reply: `Got it. Please reply with ${missing}.`,
    readyToBook: false,
    parsed: {}
  }
}

const testSessions = new Map<string, SmsSession>()

export function getSmsSessionStore(): Map<string, SmsSession> {
  return testSessions
}

export function clearSmsSessions(): void {
  testSessions.clear()
}

export function urgencyFromTimeHint(hint: string): 'today' | 'this_week' | 'flexible' {
  const lower = hint.toLowerCase()
  if (/(today|asap|now|urgent)/.test(lower)) return 'today'
  if (/(tomorrow|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower)) {
    return 'this_week'
  }
  return 'flexible'
}
