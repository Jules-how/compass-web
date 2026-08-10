import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirrors src/lib/task-action-targets.ts */
const INSTANTLY_UNIBOX = 'https://app.instantly.ai/app/unibox'
const PROSPEO_APP = 'https://app.prospeo.io/'
const URL_RE = /https?:\/\/[^\s)\]>'"]+/gi
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const REPLY_TITLE_RE = /^follow\s*up:\s*(.+?)\s+replied\b/i

function extractReplyContactName(title) {
  const match = title.trim().match(REPLY_TITLE_RE)
  if (!match?.[1]) return null
  const name = match[1].replace(/\s+/g, ' ').trim()
  return name || null
}

function extractEmails(text) {
  if (!text) return []
  const found = text.match(new RegExp(EMAIL_RE.source, 'gi')) ?? []
  const seen = new Set()
  const out = []
  for (const raw of found) {
    const email = raw.toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    out.push(raw)
  }
  return out
}

function stripTrailingPunctuation(url) {
  return url.replace(/[.,;:!?)]+$/g, '')
}

function hostLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host || 'Open link'
  } catch {
    return 'Open link'
  }
}

function extractNoteUrls(notes) {
  if (!notes?.trim()) return []
  const out = []
  const seen = new Set()
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

function gmailSearchUrl(query) {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`
}

function driveSearchUrl(query) {
  return `https://drive.google.com/drive/search?q=${encodeURIComponent(query)}`
}

function isAutoReplyTask(task) {
  if (task.id.startsWith('auto-reply-')) return true
  return Boolean(extractReplyContactName(task.title))
}

function mentions(hay, ...needles) {
  const lower = hay.toLowerCase()
  return needles.some((n) => lower.includes(n.toLowerCase()))
}

function dedupeTargets(targets) {
  const seen = new Set()
  const out = []
  for (const target of targets) {
    const key = `${target.tool}:${target.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(target)
  }
  return out
}

function haystack(task) {
  return [task.title, task.notes, task.source, task.id].filter(Boolean).join('\n')
}

function resolveTaskActionPlan(task) {
  const contactName = extractReplyContactName(task.title)
  const context = task.notes?.trim() || null
  const emails = extractEmails(task.notes)
  const noteUrls = extractNoteUrls(task.notes)
  const text = haystack(task)
  const reply = isAutoReplyTask(task)
  const searchQuery =
    emails[0] || (contactName ? `"${contactName}"` : null) || task.title.trim() || null

  const secondary = []
  let primary = null

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
        url: driveSearchUrl(contactName || emails[0]),
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
      url: 'https://adsmanager.facebook.com/adsmanager/',
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

  return { contactName, context, primary, secondary: cleanedSecondary }
}

test('Andrew-style reply → Gmail primary + Instantly/Drive secondary', () => {
  const plan = resolveTaskActionPlan({
    id: 'auto-reply-019eaaf6',
    title: 'Follow up: Andrew Churchward replied',
    notes: 'kjkjkj',
    source: null
  })
  assert.equal(plan.contactName, 'Andrew Churchward')
  assert.equal(plan.context, 'kjkjkj')
  assert.equal(plan.primary?.tool, 'gmail')
  assert.match(plan.primary.url, /mail\.google\.com/)
  assert.match(plan.primary.url, /Andrew%20Churchward|Andrew\+Churchward|%22Andrew/)
  const tools = plan.secondary.map((t) => t.tool)
  assert.ok(tools.includes('instantly'))
  assert.ok(tools.includes('drive'))
  assert.equal(
    plan.secondary.find((t) => t.tool === 'instantly')?.url,
    INSTANTLY_UNIBOX
  )
})

test('Pull Prospeo leads → Prospeo primary', () => {
  const plan = resolveTaskActionPlan({
    id: 'task-prospeo-1',
    title: 'Pull Prospeo leads',
    notes: null,
    source: null
  })
  assert.equal(plan.primary?.tool, 'prospeo')
  assert.equal(plan.primary?.url, PROSPEO_APP)
  assert.equal(plan.contactName, null)
})

test('Notes with URL → that URL promoted', () => {
  const plan = resolveTaskActionPlan({
    id: 'task-url-1',
    title: 'Review proposal pack',
    notes: 'See [brief](https://docs.google.com/document/d/abc123) for details',
    source: null
  })
  assert.equal(plan.primary?.tool, 'link')
  assert.equal(plan.primary?.url, 'https://docs.google.com/document/d/abc123')
  assert.match(plan.primary.label, /brief|Open/i)
})

test('Generic task → no bogus external primary', () => {
  const plan = resolveTaskActionPlan({
    id: 'task-generic-1',
    title: 'Write guarantee policy (when we offer / when we refuse)',
    notes: null,
    source: null
  })
  assert.equal(plan.primary, null)
  assert.deepEqual(plan.secondary, [])
  assert.equal(plan.contactName, null)
})

test('source file wires Gmail-first replies and Home sheet', () => {
  const resolver = read('src/lib/task-action-targets.ts')
  assert.match(resolver, /mail\.google\.com\/mail\/u\/0\/#search/)
  assert.match(resolver, /app\.instantly\.ai\/app\/unibox/)
  assert.match(resolver, /app\.prospeo\.io/)
  assert.match(resolver, /auto-reply-/)

  const home = read('src/components/home/HomeDashboard.tsx')
  assert.match(home, /HomePrioritySheet/)
  assert.match(home, /HomePriorityCheck/)
  assert.match(home, /completeTask/)

  const actions = read('src/components/home/HomePriorityActions.tsx')
  assert.match(actions, /Mark done/)
  assert.match(actions, /Open in tasks/)
  assert.match(actions, /status: 'completed'/)
})
