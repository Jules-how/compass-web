import { TASK_TYPES, type TaskType } from '@/lib/types'

/** Compass task source written by Daily Setup Agent via Waves POST. */
export const DAILY_SETUP_TASK_SOURCE = 'daily-setup'

export const HOME_SEEN_STORAGE_PREFIX = 'compass.home.seen.'

export type HomeJulesLedItem = {
  title: string
  detail?: string
  taskType?: TaskType | null
}

export type HomeSetupScan = {
  homeBlurb: string | null
  writeup: string | null
  julesLed: HomeJulesLedItem[]
}

export type HomeLeverageTask = {
  id: string
  title: string
  notes: string | null
  status: string
  priority: number
  due: string | null
  source: string | null
  task_type: TaskType | null
  project_id: string | null
  created_at: string
}

export type HomeGlance = {
  emailsSentToday: number | null
  replyRate: number | null
  repliesWaiting: number | null
}

export function mergeScanRecords(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return { ...(existing ?? {}), ...(incoming ?? {}) }
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function asTaskType(value: unknown): TaskType | null {
  if (typeof value !== 'string') return null
  return (TASK_TYPES as readonly string[]).includes(value) ? (value as TaskType) : null
}

export function parseJulesLed(value: unknown): HomeJulesLedItem[] {
  if (!Array.isArray(value)) return []
  const out: HomeJulesLedItem[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const title = asText(row.title)
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title,
      detail: asText(row.detail) ?? undefined,
      taskType: asTaskType(row.taskType ?? row.task_type)
    })
  }
  return out
}

export function parseHomeSetupScan(scan: Record<string, unknown> | null | undefined): HomeSetupScan {
  const row = scan ?? {}
  return {
    homeBlurb: asText(row.homeBlurb) ?? asText(row.home_blurb),
    writeup: asText(row.writeup),
    julesLed: parseJulesLed(row.julesLed ?? row.jules_led)
  }
}

export function slugHomeTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'item'
}

export function dailySetupNoteMarker(day: string, title: string): string {
  return `daily_setup:${day}:${slugHomeTitle(title)}`
}

export function notesHaveDailySetupMarker(notes: string | null | undefined, marker: string): boolean {
  return Boolean(notes && notes.includes(marker))
}

export function composeDailySetupNotes(day: string, title: string, detail?: string | null): string {
  const marker = dailySetupNoteMarker(day, title)
  const body = (detail || '').trim()
  return body ? `${marker}\n\n${body}` : marker
}

export function homeSeenStorageKey(day: string): string {
  return `${HOME_SEEN_STORAGE_PREFIX}${day}`
}

export function readHomeSeenIds(day: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(homeSeenStorageKey(day))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function writeHomeSeenIds(day: string, ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(homeSeenStorageKey(day), JSON.stringify([...new Set(ids)]))
  } catch {
    /* ignore quota */
  }
}

export function cardBriefLine(homeBlurb: string | null, recommendation: string | null): string {
  const text = (homeBlurb || recommendation || '').trim()
  if (!text) return 'Today’s next is waiting.'
  const first = text.split(/(?<=\.)\s+/)[0]?.trim()
  return first || text
}
