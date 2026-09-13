import { dateOnlyInZone, sydneyNineAmIso, type CompassCampaign } from './campaigns'

export const TEST_CHOICES = [
  ['subject', 'Subject line', 'subject'], ['cta', 'Call to action', 'cta'],
  ['body', 'Email body', 'expression'], ['risk_reversal', 'Risk reversal', 'expression'],
  ['personalisation', 'Personalisation', 'opener_mode'], ['offer', 'Offer', 'offer'],
  ['audience', 'Audience', 'audience'], ['length', 'Length', 'expression'],
  ['tone', 'Tone', 'expression'], ['icp', 'Qualification', 'audience'],
  ['opener_mode', 'Opener mode', 'opener_mode']
] as const
export function planDate(campaign: CompassCampaign) {
  return campaign.go_live_at ? dateOnlyInZone(campaign.go_live_at) : campaign.start_date?.slice(0, 10) || ''
}
export function shiftPlanDay(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function planMonday(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  return shiftPlanDay(date, -(weekday === 0 ? 6 : weekday - 1))
}
export function planDatePatch(campaign: CompassCampaign | undefined, date: string) {
  // Preserve a deliberately chosen send time when moving a plan, including DST.
  let goLive = sydneyNineAmIso(date)
  if (campaign?.go_live_at) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(campaign.go_live_at))
    const hours = Number(parts.find(p => p.type === 'hour')?.value ?? 9)
    const minutes = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
    goLive = new Date(new Date(goLive).getTime() + ((hours - 9) * 60 + minutes) * 60000).toISOString()
  }
  const oldDay = campaign && planDate(campaign)
  const delta = oldDay ? Math.round((Date.parse(date) - Date.parse(oldDay)) / 86400000) : 0
  return { go_live_at: goLive, start_date: date, ...(campaign?.end_date ? { end_date: shiftPlanDay(campaign.end_date.slice(0, 10), delta) } : {}) }
}
export function planVariable(campaign: CompassCampaign) {
  return campaign.testing_variable && campaign.testing_variable !== 'none' ? campaign.testing_variable : campaign.experiment_factor || 'none'
}
export function planVariableLabel(campaign: CompassCampaign) {
  const variable = planVariable(campaign)
  return TEST_CHOICES.find(c => c[0] === variable)?.[1] || (variable === 'none' ? 'Test to choose' : variable.replaceAll('_', ' '))
}
export function canMovePlan(campaign: CompassCampaign) {
  return ['draft', 'planned', 'paused'].includes(campaign.status)
}
