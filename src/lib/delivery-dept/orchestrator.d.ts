export type InstallStep = {
  id: string
  status: 'pending' | 'current' | 'done'
  owner: 'jules' | 'automated'
  startedAt: string | null
  completedAt: string | null
  slaDueAt: string | null
  blockedOn: string | null
}

export type InstallRecord = {
  id: string
  source: string
  clientId: string | null
  business: string
  ownerName: string
  ownerMobile: string
  city: string
  trade: string
  packId: string | null
  publishedNumber: string
  carrier: string | null
  lineType: string | null
  calendarId: string
  grantEmail: string
  createdAt: string
  updatedAt: string
  liveAt: string | null
  numberStrategy: Record<string, unknown> | null
  testCall: Record<string, unknown> | null
  checkpoints: Record<string, string | null>
  currentCheckpoint: string | null
  voice: Record<string, unknown>
  steps: Record<string, InstallStep>
  notes: string
}

export function loadPipeline(): {
  columns: string[]
  checkpoints: string[]
  capacity: number
  julesHoursCap: number
  steps: Array<{ id: string; title: string; column: string; owner: string; slaHours: number; julesMinutes: number; sms: string }>
  checkpointMeta: Record<string, { label: string; offsetDays: number; julesMinutes: number }>
}
export function createInstall(input?: Record<string, unknown>, at?: string): InstallRecord
export function currentStepId(install: InstallRecord): string
export function completeStep(install: InstallRecord, stepId: string, at?: string, extra?: Record<string, unknown>): InstallRecord
export function setBlocked(install: InstallRecord, stepId: string, blockedOn: string | null): InstallRecord
export function applyNumberStrategy(install: InstallRecord, input: Record<string, unknown>, at?: string): InstallRecord
export function recordTestCall(install: InstallRecord, labResult: Record<string, unknown>, at?: string): InstallRecord
export function hydrateFromVoice(install: InstallRecord, voice?: Record<string, unknown>, at?: string): InstallRecord
export function renderSms(install: InstallRecord, stepId?: string): string
export function boardColumns(installs: InstallRecord[], now?: string): Array<{ id: string; title: string; owner: string; cards: Array<InstallRecord & Record<string, unknown>> }>
export function capacity(installs: InstallRecord[]): {
  liveActive: number
  demoActive: number
  cap: number
  remaining: number
  full: boolean
  julesMinutes: number
  julesHoursCap: number
  timezone: string
}
