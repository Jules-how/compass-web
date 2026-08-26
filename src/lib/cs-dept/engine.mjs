/** Client health, Monday drafts, guarantee, and QBR. Pure. Safe for node:test. */

export const CS_INSTALL_AUD = 1997
export const CS_MONTHLY_VANS_3 = 1497
export const CS_MONTHLY_VANS_4_8 = 1997
export const CS_AT_RISK_SCORE = 55
export const CS_WATCH_SCORE = 75
export const CS_DROP_ALERT = 15
export const CS_GUARANTEE_DAY = 25
export const CS_GUARANTEE_WINDOW_DAYS = 7
export const CS_QBR_MIN_DAYS = 28
export const CS_FACTOR_MAX = 20

export const CS_ARTIFACT_KINDS = [
  'weekly_summary',
  'monday_sms',
  'monday_email',
  'save_play',
  'guarantee',
  'qbr'
]

export const JOB_CONTRIBUTION_BY_TRADE = {
  plumbing: 420,
  gas: 420,
  hvac: 480,
  refrigeration: 480,
  electrical: 380,
  av: 380,
  roofing: 650
}

const DEMO_NOW = '2026-08-26T07:00:00+10:00'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function roundAud(value) {
  return Math.round(Number(value) * 100) / 100
}

export function parseIso(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Calendar date in Australia/Sydney. Offer clocks are Sydney, not UTC. */
export function sydneyYmd(value) {
  if (!value && value !== 0) return null
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    if (m && !value.includes('T')) return m[1]
  }
  const d = value instanceof Date ? value : parseIso(value)
  if (!d) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

export function daysBetween(later, earlier) {
  const a = sydneyYmd(later)
  const b = sydneyYmd(earlier)
  if (!a || !b) return null
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

export function addDays(date, days) {
  const ymd = sydneyYmd(date)
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 2, 0, 0))
}

export function isoDate(date) {
  return sydneyYmd(date)
}

export function weekWindows(now = new Date()) {
  const end = now instanceof Date ? now : parseIso(now) || new Date()
  const thisStart = addDays(end, -7) || new Date(end.getTime() - 7 * 86_400_000)
  const priorStart = addDays(end, -14) || new Date(end.getTime() - 14 * 86_400_000)
  return {
    thisStart,
    priorStart,
    end,
    thisStartIso: thisStart.toISOString(),
    priorStartIso: priorStart.toISOString(),
    endIso: end.toISOString()
  }
}

export function jobContributionAud(trade, override) {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return roundAud(override)
  }
  const key = String(trade || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')[0]
  return JOB_CONTRIBUTION_BY_TRADE[key] || 400
}

export function healthBand(score) {
  if (score < CS_AT_RISK_SCORE) return 'at_risk'
  if (score < CS_WATCH_SCORE) return 'watch'
  return 'healthy'
}

export function projectHealthFromBand(band) {
  if (band === 'at_risk') return 'off_track'
  if (band === 'watch') return 'at_risk'
  return 'on_track'
}

function trendScore(current, prior, max = CS_FACTOR_MAX) {
  const c = Number(current) || 0
  const p = Number(prior) || 0
  if (p === 0 && c === 0) return Math.round(max * 0.3)
  if (p === 0 && c > 0) return Math.round(max * 0.9)
  const ratio = c / p
  if (ratio >= 1) return max
  if (ratio >= 0.85) return Math.round(max * 0.8)
  if (ratio >= 0.7) return Math.round(max * 0.6)
  if (ratio >= 0.5) return Math.round(max * 0.3)
  return Math.round(max * 0.1)
}

export function scoreCallVolume(thisWeek, lastWeek) {
  return trendScore(thisWeek, lastWeek)
}

export function scoreBookedShowed({ bookedThis, bookedLast, showedThis, showedLast }) {
  const bookedPts = trendScore(bookedThis, bookedLast, 10)
  const booked = Number(bookedThis) || 0
  const showed = Number(showedThis) || 0
  const lastBooked = Number(bookedLast) || 0
  const lastShowed = Number(showedLast) || 0
  if (booked === 0 && lastBooked === 0) {
    return { points: 4, showRate: 0, bookedPts, showPts: 0 }
  }
  const showRate = booked > 0 ? showed / booked : lastBooked > 0 ? lastShowed / lastBooked : 0
  let showPts = 1
  if (showRate >= 0.8) showPts = 10
  else if (showRate >= 0.6) showPts = 7
  else if (showRate >= 0.4) showPts = 4
  return { points: clamp(bookedPts + showPts, 0, CS_FACTOR_MAX), showRate, bookedPts, showPts }
}

export function scoreOwnerEngagement(daysSince) {
  if (daysSince == null) return 8
  if (daysSince <= 7) return 20
  if (daysSince <= 14) return 14
  if (daysSince <= 21) return 8
  if (daysSince <= 30) return 4
  return 0
}

export function scorePayment(status) {
  switch (status) {
    case 'current':
    case 'paid':
      return 20
    case 'due_soon':
      return 14
    case 'overdue':
      return 4
    case 'paused':
      return 6
    case 'ended':
      return 0
    case 'draft':
      return 10
    default:
      return 10
  }
}

export function scoreSupport({ openIssues = 0, blockedIssues = 0, complaints = 0 }) {
  let points = 20
  if (openIssues >= 3) points = 4
  else if (openIssues === 2) points = 8
  else if (openIssues === 1) points = 12
  if (blockedIssues > 0) points = Math.min(points, 2)
  if (complaints > 0) points = Math.max(0, points - 6)
  return points
}

export function scoreClientHealth(input) {
  const calls = scoreCallVolume(input.callsThis, input.callsLast)
  const booked = scoreBookedShowed({
    bookedThis: input.bookedThis,
    bookedLast: input.bookedLast,
    showedThis: input.showedThis,
    showedLast: input.showedLast
  })
  const engaged = scoreOwnerEngagement(input.daysSinceOwnerEngaged)
  const payment = scorePayment(input.paymentStatus)
  const support = scoreSupport({
    openIssues: input.openIssues,
    blockedIssues: input.blockedIssues,
    complaints: input.complaints
  })
  const factors = {
    call_volume: { points: calls, max: CS_FACTOR_MAX, this_week: input.callsThis, last_week: input.callsLast },
    booked_showed: {
      points: booked.points,
      max: CS_FACTOR_MAX,
      booked_this: input.bookedThis,
      booked_last: input.bookedLast,
      showed_this: input.showedThis,
      showed_last: input.showedLast,
      show_rate: booked.showRate
    },
    owner_engaged: { points: engaged, max: CS_FACTOR_MAX, days: input.daysSinceOwnerEngaged },
    payment: { points: payment, max: CS_FACTOR_MAX, status: input.paymentStatus },
    support: {
      points: support,
      max: CS_FACTOR_MAX,
      open_issues: input.openIssues || 0,
      blocked_issues: input.blockedIssues || 0,
      complaints: input.complaints || 0
    }
  }
  const score = calls + booked.points + engaged + payment + support
  const prior = typeof input.priorScore === 'number' ? input.priorScore : null
  const drop = prior == null ? 0 : prior - score
  const band = healthBand(score)
  const atRisk = band === 'at_risk' || drop >= CS_DROP_ALERT
  return {
    score,
    band,
    at_risk: atRisk,
    prior_score: prior,
    drop_points: drop,
    factors
  }
}

export function guaranteeState(input, now = new Date()) {
  const start = parseIso(input.startDate)
  if (!start) {
    return { due: false, day_index: null, fees_paid: input.feesPaid ?? CS_INSTALL_AUD, recovered: 0, made_fees_back: null }
  }
  const dayIndex = daysBetween(now, start)
  const fees = typeof input.feesPaid === 'number' ? input.feesPaid : CS_INSTALL_AUD
  const contrib = jobContributionAud(input.trade, input.jobContributionAud)
  const recovered = roundAud((Number(input.showedToDate) || 0) * contrib)
  const due =
    dayIndex != null &&
    dayIndex >= CS_GUARANTEE_DAY &&
    dayIndex < CS_GUARANTEE_DAY + CS_GUARANTEE_WINDOW_DAYS
  return {
    due,
    day_index: dayIndex,
    start_date: isoDate(start),
    fees_paid: fees,
    job_contribution_aud: contrib,
    showed_to_date: Number(input.showedToDate) || 0,
    recovered,
    made_fees_back: recovered >= fees,
    shortfall: Math.max(0, roundAud(fees - recovered))
  }
}

export function qbrDue(input, now = new Date()) {
  const start = parseIso(input.startDate)
  if (!start) return false
  const age = daysBetween(now, start)
  if (age == null || age < CS_QBR_MIN_DAYS) return false
  const last = parseIso(input.lastQbrAt)
  if (!last) return true
  const since = daysBetween(now, last)
  return since != null && since >= CS_QBR_MIN_DAYS
}

function money(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(value)
}

function firstName(name) {
  const raw = String(name || '').trim()
  if (!raw) return 'there'
  return raw.split(/\s+/)[0]
}

function deltaPhrase(current, prior, noun) {
  const c = Number(current) || 0
  const p = Number(prior) || 0
  if (p === 0 && c === 0) return `no ${noun} either week`
  if (p === 0) return `${c} ${noun} this week, none the week before`
  const diff = c - p
  if (diff === 0) return `${c} ${noun} both weeks`
  if (diff > 0) return `${c} ${noun} this week, up from ${p}`
  return `${c} ${noun} this week, down from ${p}`
}

export function draftWeeklySummary(client, health, now = new Date()) {
  const recoveredWeek = roundAud((Number(client.showedThis) || 0) * jobContributionAud(client.trade, client.jobContributionAud))
  const recoveredLast = roundAud((Number(client.showedLast) || 0) * jobContributionAud(client.trade, client.jobContributionAud))
  const windows = weekWindows(now)
  const body = [
    `${client.name} this week: ${client.callsThis} calls, ${client.bookedThis} booked, ${client.showedThis} showed.`,
    `Last week: ${client.callsLast} calls, ${client.bookedLast} booked, ${client.showedLast} showed.`,
    `Recovered contribution this week ${money(recoveredWeek)} (last week ${money(recoveredLast)}).`,
    `Health ${health.score} (${health.band.replace('_', ' ')}).`
  ].join(' ')
  return {
    kind: 'weekly_summary',
    title: `${client.name} weekly results`,
    body,
    payload: {
      client_id: client.id,
      client_name: client.name,
      city: client.city || null,
      trade: client.trade || null,
      period_start: isoDate(windows.thisStart),
      period_end: isoDate(windows.end),
      calls_this: client.callsThis,
      calls_last: client.callsLast,
      booked_this: client.bookedThis,
      booked_last: client.bookedLast,
      showed_this: client.showedThis,
      showed_last: client.showedLast,
      recovered_this: recoveredWeek,
      recovered_last: recoveredLast,
      job_contribution_aud: jobContributionAud(client.trade, client.jobContributionAud),
      health_score: health.score,
      health_band: health.band,
      owner_name: client.ownerName || null
    }
  }
}

export function draftMondaySms(client, health) {
  const who = firstName(client.ownerName)
  const recovered = roundAud((Number(client.showedThis) || 0) * jobContributionAud(client.trade, client.jobContributionAud))
  const body =
    `${who}, last week the after hours line took ${client.callsThis} calls, booked ${client.bookedThis}, and ${client.showedThis} showed` +
    (client.showedThis > 0 ? ` (about ${money(recovered)} back).` : '.') +
    ` Full numbers in the email. Jules`
  return {
    kind: 'monday_sms',
    title: `Monday SMS · ${client.name}`,
    body,
    payload: { to_name: client.ownerName || null, health_score: health.score }
  }
}

export function draftMondayEmail(client, health) {
  const who = firstName(client.ownerName)
  const recovered = roundAud((Number(client.showedThis) || 0) * jobContributionAud(client.trade, client.jobContributionAud))
  const body = [
    `Hi ${who},`,
    '',
    `Numbers for ${client.name} for the week just gone.`,
    '',
    `Calls: ${client.callsThis} (week before ${client.callsLast})`,
    `Booked: ${client.bookedThis} (week before ${client.bookedLast})`,
    `Showed: ${client.showedThis} (week before ${client.showedLast})`,
    `Recovered contribution this week: ${money(recovered)}`,
    '',
    health.at_risk
      ? 'I want a short call on these numbers this week. I will text a time.'
      : 'No action needed from you unless a number looks off.',
    '',
    'Jules'
  ].join('\n')
  return {
    kind: 'monday_email',
    title: `Monday email · ${client.name}`,
    body,
    payload: { to_name: client.ownerName || null, health_score: health.score }
  }
}

export function draftSavePlay(client, health) {
  const who = firstName(client.ownerName)
  const lines = [
    `Call ${who} at ${client.name}.`,
    `Open with their numbers, not a check in.`,
    `"${who}, two weeks ago the after hours line booked ${client.bookedLast} jobs and ${client.showedLast} showed. This week it is ${client.bookedThis} booked and ${client.showedThis} showed."`,
    `"Calls went from ${client.callsLast} to ${client.callsThis}."`
  ]
  if (health.factors.owner_engaged.days != null && health.factors.owner_engaged.days > 14) {
    lines.push(`You last spoke ${health.factors.owner_engaged.days} days ago. Say that.`)
  }
  if (health.factors.payment.status === 'overdue') {
    lines.push('Invoice is overdue. Ask if PayID landed. Do not threaten pause on this call.')
  }
  if ((health.factors.support.open_issues || 0) > 0) {
    lines.push(`They have ${health.factors.support.open_issues} open support item(s). Name the latest one if you have it.`)
  }
  lines.push('Ask: "Did the number change, or did the calendar stop offering slots?"')
  lines.push('Close: one change this week, and a 10 minute follow up Friday.')
  return {
    kind: 'save_play',
    title: `Save play · ${client.name}`,
    body: lines.join('\n'),
    payload: {
      health_score: health.score,
      drop_points: health.drop_points,
      calls_this: client.callsThis,
      calls_last: client.callsLast,
      booked_this: client.bookedThis,
      booked_last: client.bookedLast,
      showed_this: client.showedThis,
      showed_last: client.showedLast
    }
  }
}

export function draftGuarantee(client, checkpoint) {
  const who = firstName(client.ownerName)
  const passed = checkpoint.made_fees_back
  const body = passed
    ? [
        `Day ${checkpoint.day_index} for ${client.name}.`,
        `They paid ${money(checkpoint.fees_paid)}. Showed jobs to date: ${checkpoint.showed_to_date} at ${money(checkpoint.job_contribution_aud)} contribution.`,
        `Recovered ${money(checkpoint.recovered)}. Fees are covered.`,
        `Tell ${who}: the 30 day clock is on track. Renewal talk can wait until the numbers stay up.`
      ].join(' ')
    : [
        `Day ${checkpoint.day_index} for ${client.name}.`,
        `They paid ${money(checkpoint.fees_paid)}. Showed jobs to date: ${checkpoint.showed_to_date} at ${money(checkpoint.job_contribution_aud)} contribution.`,
        `Recovered ${money(checkpoint.recovered)}. Short by ${money(checkpoint.shortfall)}.`,
        `Tell ${who}: if this holds at day 30 they get the fees back. Routing can stay on. Do not wait until renewal to say it.`
      ].join(' ')
  return {
    kind: 'guarantee',
    title: `Day ${CS_GUARANTEE_DAY} · ${client.name}`,
    body,
    payload: checkpoint
  }
}

export function draftQbr(client, health, checkpoint, now = new Date()) {
  const recoveredToDate = roundAud((Number(client.showedToDate) || 0) * jobContributionAud(client.trade, client.jobContributionAud))
  const body = [
    `# ${client.name}`,
    `${client.city || ''} ${client.trade || ''}`.trim(),
    '',
    `Health ${health.score} · ${health.band.replace('_', ' ')}`,
    `This week ${client.callsThis} calls / ${client.bookedThis} booked / ${client.showedThis} showed`,
    `Prior week ${client.callsLast} calls / ${client.bookedLast} booked / ${client.showedLast} showed`,
    `Showed to date ${client.showedToDate || 0} · recovered ${money(recoveredToDate)}`,
    checkpoint.day_index != null
      ? `Guarantee day ${checkpoint.day_index}: ${checkpoint.made_fees_back ? 'fees covered' : `short ${money(checkpoint.shortfall)}`}`
      : 'Guarantee clock not started',
    `Payment: ${client.paymentStatus}`,
    `Owner last engaged: ${client.daysSinceOwnerEngaged == null ? 'unknown' : `${client.daysSinceOwnerEngaged} days`}`,
    `Open support: ${client.openIssues || 0}`,
    '',
    health.at_risk
      ? 'Next 30 days: run the save play this week. Do not wait for the next QBR.'
      : 'Next 30 days: keep the Monday results note going. No extra call unless booked drops two weeks running.'
  ].join('\n')
  return {
    kind: 'qbr',
    title: `QBR · ${client.name} · ${isoDate(now)}`,
    body,
    payload: {
      generated_at: now instanceof Date ? now.toISOString() : String(now),
      health_score: health.score,
      health_band: health.band,
      recovered_to_date: recoveredToDate,
      guarantee: checkpoint
    }
  }
}

function artifactId(kind, clientId, periodKey) {
  return `csa-${kind}-${clientId}-${periodKey}`
}

function snapshotId(clientId, periodKey) {
  return `csh-${clientId}-${periodKey}`
}

export function evaluateClient(client, now = new Date()) {
  const health = scoreClientHealth(client)
  const checkpoint = guaranteeState(client, now)
  const windows = weekWindows(now)
  const periodKey = isoDate(windows.end)
  const artifacts = []

  const weekly = draftWeeklySummary(client, health, now)
  const sms = draftMondaySms(client, health)
  const email = draftMondayEmail(client, health)
  artifacts.push(weekly, sms, email)

  if (health.at_risk) artifacts.push(draftSavePlay(client, health))
  if (checkpoint.due) artifacts.push(draftGuarantee(client, checkpoint))
  if (qbrDue(client, now)) artifacts.push(draftQbr(client, health, checkpoint, now))

  const stamped = artifacts.map((row) => ({
    id: artifactId(row.kind, client.id, periodKey),
    client_id: client.id,
    client_name: client.name,
    kind: row.kind,
    period_start: isoDate(windows.thisStart),
    period_end: periodKey,
    status: 'draft',
    title: row.title,
    body: row.body,
    payload: row.payload,
    is_demo: Boolean(client.isDemo),
    created_at: now instanceof Date ? now.toISOString() : String(now)
  }))

  return {
    client: {
      id: client.id,
      name: client.name,
      city: client.city || null,
      trade: client.trade || null,
      owner_name: client.ownerName || null,
      owner_mobile: client.ownerMobile || null,
      is_demo: Boolean(client.isDemo)
    },
    snapshot: {
      id: snapshotId(client.id, periodKey),
      client_id: client.id,
      scored_at: now instanceof Date ? now.toISOString() : String(now),
      period_end: periodKey,
      score: health.score,
      band: health.band,
      at_risk: health.at_risk,
      prior_score: health.prior_score,
      drop_points: health.drop_points,
      factors: health.factors,
      is_demo: Boolean(client.isDemo)
    },
    artifacts: stamped,
    checkpoint,
    attention:
      health.at_risk || checkpoint.due || qbrDue(client, now)
        ? health.at_risk
          ? 'at_risk'
          : checkpoint.due && !checkpoint.made_fees_back
            ? 'guarantee_short'
            : checkpoint.due
              ? 'guarantee'
              : 'qbr'
        : 'healthy'
  }
}

const ATTENTION_RANK = {
  at_risk: 0,
  guarantee_short: 1,
  guarantee: 2,
  qbr: 3,
  healthy: 4
}

export function assembleBoard(results, now = new Date()) {
  const cards = results
    .map((row) => ({
      ...row,
      review_rank: ATTENTION_RANK[row.attention] ?? 9
    }))
    .sort((a, b) => a.review_rank - b.review_rank || a.snapshot.score - b.snapshot.score)

  const artifacts = cards.flatMap((row) => row.artifacts)
  const snapshots = cards.map((row) => row.snapshot)
  const atRisk = cards.filter((row) => row.snapshot.at_risk).length
  const drafts = artifacts.filter((row) => row.status === 'draft').length
  const healthy = cards.filter((row) => row.attention === 'healthy').length

  return {
    generated_at: now instanceof Date ? now.toISOString() : String(now),
    source: cards.every((row) => row.client.is_demo) ? 'demo' : 'live',
    counts: {
      clients: cards.length,
      at_risk: atRisk,
      drafts,
      healthy,
      guarantee: cards.filter((row) => row.attention === 'guarantee' || row.attention === 'guarantee_short').length,
      qbr: cards.filter((row) => row.attention === 'qbr').length
    },
    cards,
    snapshots,
    artifacts,
    monday_minutes_budget: 30,
    scan_seconds_per_healthy: healthy > 0 ? Math.round((30 * 60 * 0.25) / Math.max(healthy, 1)) : 0
  }
}

export function roiProjection(artifact) {
  if (!artifact || artifact.kind !== 'weekly_summary') return null
  const p = artifact.payload || {}
  return {
    client_id: artifact.client_id,
    client_name: artifact.client_name,
    period_start: p.period_start,
    period_end: p.period_end,
    calls: p.calls_this,
    booked: p.booked_this,
    showed: p.showed_this,
    recovered_aud: p.recovered_this,
    vs_last_week: {
      calls: p.calls_last,
      booked: p.booked_last,
      showed: p.showed_last,
      recovered_aud: p.recovered_last
    }
  }
}

export function demoClientInputs(now = new Date(DEMO_NOW)) {
  const startDaysAgo = (days) => isoDate(addDays(now, -days))
  return [
    {
      id: 'cs-demo-harbour',
      name: 'Harbour Plumbing',
      city: 'Sydney',
      trade: 'plumbing',
      ownerName: 'Mick',
      ownerMobile: '+61 411 000 101',
      isDemo: true,
      callsThis: 18,
      callsLast: 16,
      bookedThis: 7,
      bookedLast: 6,
      showedThis: 6,
      showedLast: 5,
      showedToDate: 28,
      daysSinceOwnerEngaged: 2,
      paymentStatus: 'current',
      openIssues: 0,
      blockedIssues: 0,
      complaints: 0,
      startDate: startDaysAgo(40),
      lastQbrAt: startDaysAgo(10),
      feesPaid: CS_INSTALL_AUD,
      jobContributionAud: 420,
      priorScore: 88
    },
    {
      id: 'cs-demo-northside',
      name: 'Northside HVAC',
      city: 'Brisbane',
      trade: 'hvac',
      ownerName: 'Priya',
      ownerMobile: '+61 411 000 202',
      isDemo: true,
      callsThis: 4,
      callsLast: 14,
      bookedThis: 1,
      bookedLast: 6,
      showedThis: 1,
      showedLast: 5,
      showedToDate: 19,
      daysSinceOwnerEngaged: 18,
      paymentStatus: 'current',
      openIssues: 1,
      blockedIssues: 0,
      complaints: 0,
      startDate: startDaysAgo(55),
      lastQbrAt: startDaysAgo(10),
      feesPaid: CS_INSTALL_AUD,
      jobContributionAud: 480,
      priorScore: 82
    },
    {
      id: 'cs-demo-volt',
      name: 'Volt and Co Electrical',
      city: 'Melbourne',
      trade: 'electrical',
      ownerName: 'Tom',
      ownerMobile: '+61 411 000 303',
      isDemo: true,
      callsThis: 11,
      callsLast: 9,
      bookedThis: 5,
      bookedLast: 4,
      showedThis: 5,
      showedLast: 3,
      showedToDate: 13,
      daysSinceOwnerEngaged: 5,
      paymentStatus: 'current',
      openIssues: 0,
      blockedIssues: 0,
      complaints: 0,
      startDate: startDaysAgo(25),
      lastQbrAt: null,
      feesPaid: CS_INSTALL_AUD,
      jobContributionAud: 380,
      priorScore: 78
    },
    {
      id: 'cs-demo-ridge',
      name: 'Ridge Line Roofing',
      city: 'Adelaide',
      trade: 'roofing',
      ownerName: 'Sam',
      ownerMobile: '+61 411 000 404',
      isDemo: true,
      callsThis: 3,
      callsLast: 4,
      bookedThis: 1,
      bookedLast: 1,
      showedThis: 0,
      showedLast: 1,
      showedToDate: 2,
      daysSinceOwnerEngaged: 9,
      paymentStatus: 'current',
      openIssues: 0,
      blockedIssues: 0,
      complaints: 0,
      startDate: startDaysAgo(25),
      lastQbrAt: null,
      feesPaid: CS_INSTALL_AUD,
      jobContributionAud: 650,
      priorScore: 64
    },
    {
      id: 'cs-demo-coastal',
      name: 'Coastal Gas',
      city: 'Perth',
      trade: 'gas',
      ownerName: 'Dana',
      ownerMobile: '+61 411 000 505',
      isDemo: true,
      callsThis: 8,
      callsLast: 8,
      bookedThis: 3,
      bookedLast: 3,
      showedThis: 2,
      showedLast: 3,
      showedToDate: 22,
      daysSinceOwnerEngaged: 24,
      paymentStatus: 'overdue',
      openIssues: 2,
      blockedIssues: 1,
      complaints: 1,
      startDate: startDaysAgo(70),
      lastQbrAt: startDaysAgo(40),
      feesPaid: CS_INSTALL_AUD,
      jobContributionAud: 420,
      priorScore: 61
    }
  ]
}

export function buildDemoBoard(now = new Date(DEMO_NOW)) {
  const results = demoClientInputs(now).map((client) => evaluateClient(client, now))
  const board = assembleBoard(results, now)
  return { ...board, source: 'demo' }
}

export function evidenceEventsForResult(result, now = new Date()) {
  const ts = now instanceof Date ? now.toISOString() : String(now)
  const events = [
    {
      source: 'cs',
      type: 'cs.health_scored',
      client_id: result.client.id,
      ts,
      native_id: result.snapshot.id,
      payload: {
        score: result.snapshot.score,
        band: result.snapshot.band,
        at_risk: result.snapshot.at_risk
      }
    }
  ]
  for (const artifact of result.artifacts) {
    events.push({
      source: 'cs',
      type: `cs.${artifact.kind}`,
      client_id: result.client.id,
      ts,
      native_id: artifact.id,
      payload: { title: artifact.title, status: artifact.status }
    })
  }
  return events
}

export { DEMO_NOW, deltaPhrase }
