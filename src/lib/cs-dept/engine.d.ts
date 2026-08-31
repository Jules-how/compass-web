export const CS_INSTALL_AUD: number
export const CS_AT_RISK_SCORE: number
export const CS_GUARANTEE_DAY: number
export const DEMO_NOW: string

export function sydneyYmd(value: unknown): string | null
export function daysBetween(later: unknown, earlier: unknown): number | null
export function addDays(date: unknown, days: number): Date | null
export function isoDate(date: unknown): string | null
export function weekWindows(now?: Date | string): {
  thisStart: Date
  priorStart: Date
  end: Date
  thisStartIso: string
  priorStartIso: string
  endIso: string
}
export function jobContributionAud(trade?: string | null, override?: number): number
export function healthBand(score: number): 'healthy' | 'watch' | 'at_risk'
export function projectHealthFromBand(band: string): string
export function scoreCallVolume(thisWeek: number, lastWeek: number): number
export function scoreBookedShowed(input: {
  bookedThis: number
  bookedLast: number
  showedThis: number
  showedLast: number
}): { points: number; showRate: number; bookedPts: number; showPts: number }
export function scoreOwnerEngagement(daysSince: number | null | undefined): number
export function scorePayment(status: string): number
export function scoreSupport(input: { openIssues?: number; blockedIssues?: number; complaints?: number }): number
export function scoreClientHealth(input: Record<string, unknown>): {
  score: number
  band: 'healthy' | 'watch' | 'at_risk'
  at_risk: boolean
  prior_score: number | null
  drop_points: number
  factors: Record<string, Record<string, unknown>>
}
export function guaranteeState(input: Record<string, unknown>, now?: Date): Record<string, unknown>
export function qbrDue(input: Record<string, unknown>, now?: Date): boolean
export function draftWeeklySummary(client: Record<string, unknown>, health: Record<string, unknown>, now?: Date): Record<string, unknown>
export function draftMondaySms(client: Record<string, unknown>, health: Record<string, unknown>): Record<string, unknown>
export function draftMondayEmail(client: Record<string, unknown>, health: Record<string, unknown>): Record<string, unknown>
export function draftSavePlay(client: Record<string, unknown>, health: Record<string, unknown>): Record<string, unknown>
export function draftGuarantee(client: Record<string, unknown>, checkpoint: Record<string, unknown>): Record<string, unknown>
export function draftQbr(
  client: Record<string, unknown>,
  health: Record<string, unknown>,
  checkpoint: Record<string, unknown>,
  now?: Date
): Record<string, unknown>
export function evaluateClient(client: Record<string, unknown>, now?: Date): Record<string, unknown>
export function assembleBoard(results: unknown[], now?: Date): Record<string, unknown>
export function roiProjection(artifact: Record<string, unknown> | null | undefined): Record<string, unknown> | null
export function demoClientInputs(now?: Date): Array<Record<string, unknown>>
export function buildDemoBoard(now?: Date): Record<string, unknown>
export function evidenceEventsForResult(result: Record<string, unknown>, now?: Date): Array<Record<string, unknown>>
