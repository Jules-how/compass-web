export function findVoiceLabRunner(): string | null
export function runTestCallScenarios(input?: {
  packId?: string | null
  limit?: number
  stub?: boolean
}): Promise<{
  runner: string
  passed: boolean
  scenarios: Array<Record<string, unknown>>
  ran?: number
  failed?: number
  note: string
  blockedOn: string | null
}>
