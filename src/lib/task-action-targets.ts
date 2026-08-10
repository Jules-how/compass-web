import type { CompassTask } from '@/lib/types'

export type TaskActionTool =
  | 'gmail'
  | 'instantly'
  | 'drive'
  | 'prospeo'
  | 'meta'
  | 'link'
  | 'tasks'

export type TaskActionTarget = {
  tool: TaskActionTool
  label: string
  url: string
  external: boolean
}

export type TaskActionPlan = {
  contactName: string | null
  context: string | null
  primary: TaskActionTarget | null
  secondary: TaskActionTarget[]
}

const INSTANTLY_UNIBOX = 'https://app.instantly.ai/app/unibox'
const PROSPEO_APP = 'https://app.prospeo.io/'
const META_ADS = 'https://adsmanager.facebook.com/adsmanager/'

const URL_RE = /https?:\/\/[^\s)\]>'"]+/gi
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const REPLY_TITLE_RE = /^follow\s*up:\s*(.+?)\s+replied\b/i

function haystack(task: Pick<CompassTask, 'title' | 'notes' | 'source' | 'id'>): string {
  return [task.title, task.notes, task.source, task.id].filter(Boolean).join('\n')
}

export function extractReplyContactName(title: string): string | null {
  const match = title.trim().match(REPLY_TITLE_RE)
  if (!match?.[1]) return null
  const name = match[1].replace(/\s+/g, ' ').trim()
  return name || null
}

export function extractEmails(text: string | null | undefined): string[] {
  if (!text) return []
  const found = text.match(new RegExp(EMAIL_RE.source, 'gi')) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of found) {
    const email = raw.toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    out.push(raw)
  }
  return out
}

export function extractNoteUrls(notes: string | null | undefined): Array<{ label: string; url: string }> {
  if (!notes?.trim()) return []
  const out: Array<{ label: string; url: string }> = []
  const seen = new Set<string>()

  for (const match of notes.matchAll(MD_LINK_RE)) {
    const label = (match[1] || 'Open link').trim() || 'Open link'
    const url = stripTrailingPunctuation(match[2] || '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ label, url })
  }

  for (const match of notes.matchAll(URL_RE)) {
    const url = stripTrailingPunctuation(match[0] || '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ label: hostLabel(url), url })
  }

  return out
}

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, '')
}

function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host || 'Open link'
  } catch {
    return 'Open link'
  }
}

export function gmailSearchUrl(query: string): string {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`
}

export function driveSearchUrl(query: string): string {
  return `https://drive.google.com/drive/search?q=${encodeURIComponent(query)}`
}

function isAutoReplyTask(task: Pick<CompassTask, 'id' | 'title'>): boolean {
  if (task.id.startsWith('auto-reply-')) return true
  return Boolean(extractReplyContactName(task.title))
}

function mentions(hay: string, ...needles: string[]): boolean {
  const lower = hay.toLowerCase()
  return needles.some((n) => lower.includes(n.toLowerCase()))
}

function dedupeTargets(targets: TaskActionTarget[]): TaskActionTarget[] {
  const seen = new Set<string>()
  const out: TaskActionTarget[] = []
  for (const target of targets) {
    const key = `${target.tool}:${target.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(target)
  }
  return out
}

/**
 * Resolve where a Home priority should open.
 * Reply/auto-reply → Gmail primary; Instantly + Drive secondary.
 * Prospeo / Instantly / Drive / Meta keywords and note URLs also map.
 */
export function resolveTaskActionPlan(
  task: Pick<CompassTask, 'id' | 'title' | 'notes' | 'source'>
): TaskActionPlan {
  const contactName = extractReplyContactName(task.title)
  const context = task.notes?.trim() || null
  const emails = extractEmails(task.notes)
  const noteUrls = extractNoteUrls(task.notes)
  const text = haystack(task)
  const reply = isAutoReplyTask(task)

  const searchQuery =
    emails[0] || (contactName ? `"${contactName}"` : null) || task.title.trim() || null

  const secondary: TaskActionTarget[] = []
  let primary: TaskActionTarget | null = null

  // Explicit note URLs win as primary when present (unless reply — Gmail stays first).
  if (noteUrls.length > 0 && !reply) {
    const first = noteUrls[0]
    primary = {
      tool: 'link',
      label: first.label.startsWith('Open') ? first.label : `Open ${first.label}`,
      url: first.url,
      external: true
    }
    for (const extra of noteUrls.slice(1)) {
      secondary.push({
        tool: 'link',
        label: extra.label.startsWith('Open') ? extra.label : `Open ${extra.label}`,
        url: extra.url,
        external: true
      })
    }
  } else if (noteUrls.length > 0 && reply) {
    for (const extra of noteUrls) {
      secondary.push({
        tool: 'link',
        label: extra.label.startsWith('Open') ? extra.label : `Open ${extra.label}`,
        url: extra.url,
        external: true
      })
    }
  }

  if (reply && searchQuery) {
    primary = {
      tool: 'gmail',
      label: contactName ? `Open Gmail · ${contactName}` : 'Open Gmail',
      url: gmailSearchUrl(searchQuery),
      external: true
    }
    secondary.push({
      tool: 'instantly',
      label: 'Open Instantly',
      url: INSTANTLY_UNIBOX,
      external: true
    })
    if (contactName || emails[0]) {
      secondary.push({
        tool: 'drive',
        label: 'Open Drive',
        url: driveSearchUrl(contactName || emails[0]!),
        external: true
      })
    }
  } else if (mentions(text, 'prospeo')) {
    primary = {
      tool: 'prospeo',
      label: 'Open Prospeo',
      url: PROSPEO_APP,
      external: true
    }
  } else if (mentions(text, 'instantly') && !primary) {
    primary = {
      tool: 'instantly',
      label: 'Open Instantly',
      url: INSTANTLY_UNIBOX,
      external: true
    }
  } else if (mentions(text, 'gmail', 'inbox reply', 'email reply') && searchQuery && !primary) {
    primary = {
      tool: 'gmail',
      label: 'Open Gmail',
      url: gmailSearchUrl(searchQuery),
      external: true
    }
  } else if (mentions(text, 'google drive', 'gdrive', 'drive folder') && searchQuery && !primary) {
    primary = {
      tool: 'drive',
      label: 'Open Drive',
      url: driveSearchUrl(searchQuery),
      external: true
    }
  } else if (mentions(text, 'meta ads', 'ads manager', 'facebook ads') && !primary) {
    primary = {
      tool: 'meta',
      label: 'Open Meta Ads',
      url: META_ADS,
      external: true
    }
  }

  if (mentions(text, 'instantly') && !reply) {
    secondary.push({
      tool: 'instantly',
      label: 'Open Instantly',
      url: INSTANTLY_UNIBOX,
      external: true
    })
  }
  if (mentions(text, 'prospeo') && primary?.tool !== 'prospeo') {
    secondary.push({
      tool: 'prospeo',
      label: 'Open Prospeo',
      url: PROSPEO_APP,
      external: true
    })
  }

  const cleanedSecondary = dedupeTargets(secondary).filter(
    (t) => !primary || t.url !== primary.url
  )

  return {
    contactName,
    context,
    primary,
    secondary: cleanedSecondary
  }
}

export function openTaskActionTarget(target: TaskActionTarget): void {
  if (typeof window === 'undefined') return
  if (target.external) {
    window.open(target.url, '_blank', 'noopener,noreferrer')
    return
  }
  window.location.assign(target.url)
}
