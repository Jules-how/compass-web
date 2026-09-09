import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PasswordLoginForm from '@/components/PasswordLoginForm'
import { HomeDashboard } from '@/components/home/HomeDashboard'
import type { MorningWavePayload } from '@/lib/wave-morning'
import { OperatorConsoleLayout } from '@/components/OperatorShell'
import { writeQueryCache } from '@/lib/query-cache'
import { INBOX_CACHE_KEY, type InboxPayload, type InboxItem } from '@/lib/inbox-ui'
import { SequenceEditor } from '@/components/outbound/SequenceEditor'
import { CampaignCalendar } from '@/components/campaigns/CampaignCalendar'
import { ModalFrame } from '@/components/ui/ModalFrame'
import { KanbanBoard, type KanbanColumn } from '@/components/ui/kanban-board'
import { scaffoldSequence } from '@/lib/outbound-copy'
import { emptyCampaignCopyFields, type CompassCampaign } from '@/lib/campaigns'

const stamp = '2026-09-08T09:00:00'
const sequence = scaffoldSequence('nick-3step')
sequence.steps[0].subject = 'A fixture subject for {{companyName}}'
let campaign: CompassCampaign = {
  ...emptyCampaignCopyFields(), id: 'fixture-campaign', name: 'Fixture · Sydney HVAC sequence', status: 'draft',
  priority: 0, health: 'no_updates', start_date: null, end_date: null, go_live_at: stamp,
  color: '#e85d2a', summary: null, labels: [], owner_label: null,
  copy_status: 'draft', structure_id: sequence.structure_id, sequence_draft: sequence,
  created_at: stamp, updated_at: stamp, vertical_tags: ['hvac'], location_tags: ['sydney']
}
const library = { offers: [], expressions: [], structures: [], ctas: [], subjects: [], openers: [], templates: [] }
const inboxRows: InboxItem[] = (['agents', 'instantly', 'leads'] as const).flatMap((tab) => [0, 1].map(index => ({
  id: `${tab}-${index}`, sourceId: `${tab}-${index}`, tab, title: `Fixture ${tab} notification ${index + 1}`,
  preview: 'Synthetic notification with a readable summary and next action.', occurredAt: stamp,
  unread: true, actionable: true, triage: 'unread', snoozedUntil: null, score: 1, identityKey: null,
  related: [], lifecycle: null, sourceLabel: tab, contactName: 'Fixture Contact', email: null, phone: null,
  body: 'This is synthetic notification content for validating Inbox layout and keyboard navigation. No person was contacted.',
  href: null, meta: []
})))
let inboxPayload: InboxPayload = { tab: 'instantly', items: inboxRows.filter(row => row.tab === 'instantly'), total: 6,
  counts: { agents: 2, instantly: 2, leads: 2 }, badgeTotal: 2, needsYou: inboxRows,
  channels: { agents: inboxRows.filter(row => row.tab === 'agents'), instantly: inboxRows.filter(row => row.tab === 'instantly'), leads: inboxRows.filter(row => row.tab === 'leads') }, leads: [] }
writeQueryCache(INBOX_CACHE_KEY, inboxPayload)
let loginFailure = '401'
const morningWave: MorningWavePayload = {
  sydneyDate: '2026-09-08', briefStatus: 'accepted', landUnlocked: true,
  recommendation: 'Fixture recommendation: review the campaign preview and respond to the synthetic reply.',
  homeBlurb: 'Synthetic morning brief for layout verification.', writeup: 'Fixture-only detail. No live campaigns or lead records are used.', instantlyRepliesWaiting: 2,
  sending: [{ key: 'fixture-sending', campaignId: 'fixture-campaign', instantlyId: null, name: 'Fixture · active Sydney campaign', remaining: 130, lowRemaining: false, copyConfirmed: true, openerReviewed: true, copyBlocked: false, instantlyHref: null, deskHref: '/sales/outbound' }],
  activeNext: [{ campaignId: 'fixture-next', name: 'Fixture · next campaign', trade: 'HVAC', city: 'Sydney', buildStatus: 'queued', runDetail: null }],
  proposedNext: [], leverage: []
}
const homePayload = {
  digest: null, coldEmail: { emailsSentToday: 120, replyRate: 2.5, repliesWaiting: 2 }, coldEmailSource: 'demo',
  spine: { leads: [], clients: [] }, pullNext: null, inFlight: [], overdueTasks: [], liveCampaignCount: 1, wave: morningWave
}
// All transport is fixture-local, including writes. CSP also prevents connections.
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? 'GET'
  let body: any = {}
  if (url.includes('/api/auth/login')) {
    if (loginFailure === 'network') throw new TypeError('Fixture network failure')
    return new Response(JSON.stringify({ error: 'Fixture authentication failure' }), { status: Number(loginFailure), headers: { 'content-type': 'application/json' } })
  }
  if (url.includes('/api/home/wave')) body = morningWave
  else if (url.includes('/api/home')) body = homePayload
  else if (url.includes('/api/brain-dump/reorganize')) body = { summary: 'Fixture: one suggested task.', suggestions: [{ id: 'fixture-suggestion', kind: 'task', title: 'Review fixture campaign preview', rationale: 'Synthetic suggestion for checking selection and keyboard focus.', suggestedPriority: 1 }] }
  else if (url.includes('/api/tasks')) body = { topTasks: [], tasks: [] }
  else if (url.includes('/api/inbox')) body = inboxPayload
  else if (url.includes('/api/campaigns/fixture-campaign') && method === 'PATCH') {
    campaign = { ...campaign, ...JSON.parse(String(init?.body ?? '{}')) }
    body = { campaign }
  } else if (url.includes('/api/campaigns/fixture-campaign')) body = { campaign, milestones: [], activity: [] }
  else if (url.includes('/api/campaigns')) body = { campaigns: [campaign] }
  else if (url.includes('/api/outbound/library')) body = library
  else if (url.includes('/api/outbound/seed')) body = { seeded: true, inserted: 0 }
  else if (url.includes('/api/outbound/')) body = { items: [], ...library }
  else if (url.includes('lead')) body = { leads: [], rows: [], total: 0 }
  else body = { items: [], rows: [], live: [], history: [], campaigns: [] }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const initialView = new URLSearchParams(location.search).get('view') ?? 'editor'
if (initialView === 'inbox') history.replaceState(null, '', '/inbox?tab=instantly')

function Fixture() {
  const [view, setView] = useState(initialView)
  const [loginMode, setLoginMode] = useState('401')
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [status, setStatus] = useState('All records below are synthetic. No live data or network writes.')
  const [selected, setSelected] = useState<string | null>(null)
  const [grain, setGrain] = useState<'day'|'week'>('day')
  const [columns, setColumns] = useState<KanbanColumn[]>([
    { id: 'todo', title: 'To do', tasks: [ { id: 'task-a', title: 'Review the full campaign preview and confirm variable quality', description: 'Synthetic description that stays unchanged.', metrics: [{ label: 'Replies', value: 0 }, { label: 'Remaining', value: 130 }], tags: ['HVAC · Sydney'] } ] },
    { id: 'done', title: 'Done', tasks: [] }
  ])
  const [calendar, setCalendar] = useState([0, 0, 0, 30, 60, 180].map((minutes, index) => ({
    ...campaign, id: `calendar-${index}`, name: `Fixture ${index + 1} · ${index < 3 ? 'Same-time start' : 'Later start'}`,
    go_live_at: new Date(2026, 8, 8, 9, minutes).toISOString()
  })))
  const modalClasses = { overlayClassName: 'fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4', contentClassName: 'compass-panel w-full max-w-md space-y-4 p-6' }
  return <main className="flex h-dvh flex-col bg-[var(--compass-wash)] text-neutral-900">
    <div className={view === 'inbox' ? 'hidden' : 'shrink-0 border-b border-amber-300 bg-amber-50 p-2 text-xs'}>
      <strong>LOCAL VERIFICATION FIXTURE · actual components, synthetic data</strong>
      <div className="mt-2 flex flex-wrap gap-2">{['editor','calendar','board','modals','inbox','home','login'].map((name) => <button key={name} type="button" className="compass-btn-secondary !px-3 !py-1" aria-pressed={view === name} onClick={() => { if (name === 'inbox') history.pushState(null, '', '/inbox?tab=instantly'); if (name === 'home') history.pushState(null, '', '/home'); setView(name) }}>{name}</button>)}</div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {view === 'inbox' && <><div className="fixed bottom-3 right-3 z-[100] flex max-w-[calc(100vw-24px)] flex-wrap gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs"><strong className="w-full">LOCAL FIXTURE · synthetic Inbox</strong><button className="compass-btn-secondary" onClick={() => setView('editor')}>Exit Inbox fixture</button><button className="compass-btn-secondary" onClick={() => { inboxPayload = { ...inboxPayload, badgeTotal: inboxPayload.badgeTotal + 1 }; writeQueryCache(INBOX_CACHE_KEY, inboxPayload); setStatus(`Fixture cache badge: ${inboxPayload.badgeTotal}`) }}>Update cached Inbox badge</button><button className="compass-btn-secondary" onClick={() => history.back()}>History back</button><button className="compass-btn-secondary" onClick={() => history.forward()}>History forward</button></div><OperatorConsoleLayout role="owner"><section className="p-4">Fixture non-keep-alive destination</section></OperatorConsoleLayout></>}

      {view === 'home' && <div className="flex h-full min-h-0 flex-col"><HomeDashboard /></div>}
      {view === 'login' && <section className="compass-panel mx-auto my-6 w-[calc(100%-2rem)] max-w-md space-y-5 p-6"><h1 className="text-xl font-semibold">Synthetic sign-in failure test</h1><p className="text-sm text-neutral-600">Enter fixture@example.invalid and any eight-character sample password. This form uses only the local mock transport.</p><label className="block text-sm">Mock failure<select className="compass-input mt-1" value={loginMode} onChange={(event) => { loginFailure = event.target.value; setLoginMode(event.target.value) }}><option value="401">401 · incorrect credentials</option><option value="503">503 · service unavailable</option><option value="network">Network connection failure</option></select></label><PasswordLoginForm /></section>}
      {view === 'editor'  && <SequenceEditor campaignId="fixture-campaign" leadsPane="hidden" />}
      {view === 'calendar' && <div className="flex h-full min-h-0 flex-col"><div className="flex gap-2 p-2"><button className="compass-btn-secondary" onClick={() => setGrain('day')}>Day</button><button className="compass-btn-secondary" onClick={() => setGrain('week')}>Week</button></div><CampaignCalendar campaigns={calendar} grain={grain} cursor={new Date(2026,8,8)} selectedId={selected} onSelect={setSelected} onOpenPage={(id) => setStatus(`Open ${id}`)} onCreateSlot={(at) => setStatus(`Create intercepted: ${at}`)} onMoveCampaign={(id, at) => setCalendar(rows => rows.map(row => row.id === id ? {...row, go_live_at: at} : row))} onCursorChange={() => {}} /></div>}
      {view === 'board' && <div className="p-4"><KanbanBoard columns={columns} onTaskClick={(id) => setStatus(`Opened ${id}`)} onMove={(id, from, to) => { const task = columns.find(col => col.id === from)?.tasks.find(task => task.id === id); if (!task) return; setColumns(cols => cols.map(col => ({...col, tasks: col.id === from ? col.tasks.filter(task => task.id !== id) : col.id === to ? [...col.tasks, task] : col.tasks}))); setStatus(`Moved ${id} to ${to}`) }} /></div>}
      {view === 'modals' && <div className="space-y-4 p-6"><p>Use Tab, Shift+Tab and Escape; test nested dialogs and focus return.</p><button className="compass-btn-primary" onClick={() => setOpen(true)}>Open parent dialog</button><button className="compass-btn-secondary">Background focus target</button><div className="h-[120vh]">Scroll test background</div></div>}
    </div>
    <p role="status" className={view === 'inbox' ? 'sr-only' : 'shrink-0 border-t bg-white px-3 py-1 text-xs'}>{status}</p>
    <ModalFrame open={open} onClose={() => setOpen(false)} label="Fixture parent dialog" {...modalClasses}><h2 className="text-lg font-semibold">Parent dialog</h2><label className="block">Sample input<input className="compass-input" /></label><button className="compass-btn-primary" onClick={() => setNested(true)}>Open nested dialog</button><button className="compass-btn-secondary" onClick={() => setOpen(false)}>Close parent</button><ModalFrame open={nested} onClose={() => setNested(false)} label="Fixture nested dialog" {...modalClasses}><h2 className="text-lg font-semibold">Nested dialog</h2><button className="compass-btn-primary" onClick={() => setNested(false)}>Close nested</button><button className="compass-btn-secondary">Last nested focus target</button></ModalFrame></ModalFrame>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
