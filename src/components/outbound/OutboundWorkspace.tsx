'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Mail, Phone, MessageSquare, CheckSquare, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useActivePane } from '@/components/ActivePane'
import { ModalFrame } from '@/components/ui/ModalFrame'
import TaskCreate from '@/components/TaskCreate'
import TaskDetailPanel from '@/components/TaskDetailPanel'
import { useCachedJson } from '@/lib/use-cached-json'
import { onWorkChanged } from '@/lib/workspace-change'
import type { OutboundOverview } from '@/lib/outbound-overview-core'
import type { CallingQueue } from '@/lib/calling-workspace'
import type { CompassTask, CompassProject, CompassBusinessFunction } from '@/lib/types'
import { OUTBOUND_TASK_SOURCE, workspaceCalls, workspaceCompany, workspaceDue, workspaceMotion, workspaceTasks, type WorkspaceTask } from '@/lib/outbound-workspace'
import styles from './OutboundWorkspace.module.css'

type Tasks = { topTasks: CompassTask[]; subtasks: CompassTask[]; projects: CompassProject[]; businessFunctions: CompassBusinessFunction[] }
const count = (n: number | null | undefined) => n == null ? 'Unknown' : n.toLocaleString()
function Lane({ title, icon, total, caption, children }: { title: string; icon: ReactNode; total: number; caption: string; children: ReactNode }) {
  return <section className={styles.lane}><header className={styles.laneHeader}><h2>{icon}{title}<span>{total}</span></h2><p>{caption}</p></header><div className={styles.cards}>{children}</div></section>
}
function Empty({ loading, error, children }: { loading: boolean; error: unknown; children: ReactNode }) { return <p className={styles.empty}>{loading ? 'Loading records…' : error ? 'Records unavailable. Try refreshing.' : children}</p> }
export function OutboundWorkspace({ onEvidence }: { onEvidence: () => void }) {
  const active = useActivePane()
  const overview = useCachedJson<OutboundOverview>('/api/outbound/overview', '/api/outbound/overview', { staleMs: 60000 })
  const rhythm = useCachedJson<CallingQueue>('/api/operator/outbound/rhythm', '/api/operator/outbound/rhythm', { staleMs: 60000 })
  const tasks = useCachedJson<Tasks>('/api/tasks', '/api/tasks', { staleMs: 30000 })
  const reloadOverview = overview.reload
  const reloadRhythm = rhythm.reload
  const [query, setQuery] = useState('')
  const [attention, setAttention] = useState(false)
  const [limit, setLimit] = useState(20)
  const [creating, setCreating] = useState(false)
  const [selectedTask, setSelectedTask] = useState<CompassTask | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!active) return
    const update = () => { if (document.visibilityState === 'visible') { void reloadOverview(); void reloadRhythm() } }
    const unsubscribe = onWorkChanged(update)
    const timer = window.setInterval(update, 60000)
    window.addEventListener('focus', update)
    window.addEventListener('outbound-rhythm-changed', update)
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('outbound-rhythm-changed', update) }
  }, [active, reloadOverview, reloadRhythm])
  useEffect(() => { if (active) setSelectedCampaign(new URLSearchParams(window.location.search).get('campaign')) }, [active])
  const matches = (...values: (string | null | undefined)[]) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase())
  const calls = rhythm.data ? workspaceCalls(rhythm.data) : []
  const motion = rhythm.data ? workspaceMotion(rhythm.data) : []
  const preparation = workspaceTasks([...(tasks.data?.topTasks || []), ...(tasks.data?.subtasks || [])], overview.data)
  const campaigns = (overview.data?.campaigns || []).filter(c => matches(c.name, c.provider_status) && (!attention || overview.data?.recommendations.some(a => a.campaign_id === c.id && a.state !== 'scheduled')))
  const shownCalls = calls.filter(c => matches(workspaceCompany(c.lead), c.lead.name, c.group) && (!attention || c.attention))
  const shownMotion = motion.filter(c => matches(workspaceCompany(c.lead), c.description, c.group) && (!attention || c.group === 'Needs next step' || ['Overdue', 'Today'].includes(workspaceDue(c.next?.due))))
  const shownTasks = preparation.filter(t => matches(t.title, t.status) && (!attention || t.status !== 'completed' && ['Overdue', 'Today'].includes(workspaceDue(t.due))))
  const projectsById = Object.fromEntries((tasks.data?.projects || []).map(p => [p.id, p]))
  const businessFunctionsById = Object.fromEntries((tasks.data?.businessFunctions || []).map(p => [p.id, p]))
  const campaign = overview.data?.campaigns.find(c => c.id === selectedCampaign)
  async function refresh() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/outbound/overview', { method: 'POST' })
      if (!res.ok) throw new Error('Provider refresh failed. Previously observed records remain visible.')
      await Promise.all([overview.reload(), rhythm.reload(), tasks.reload()])
    } catch (e) { setError(e instanceof Error ? e.message : 'Refresh failed.') } finally { setBusy(false) }
  }
  async function openTask(row: WorkspaceTask) {
    setError('')
    if (row.task) { setSelectedTask(row.task); return }
    try { const res = await fetch(`/api/tasks/${encodeURIComponent(row.id)}`); if (!res.ok) throw new Error('This task could not be opened. Refresh to check its current state.'); setSelectedTask(await res.json()) } catch (e) { setError(e instanceof Error ? e.message : 'Task unavailable.') }
  }
  return <div className={styles.workspace}>
    <header className={styles.intro}><div><div className={styles.eyebrow}>YOUR OUTBOUND WORKSPACE</div><h1>Make the next move.</h1><p>Prepare the emails. Make the calls. Keep conversations moving.</p></div><button className="compass-btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Add task</button></header>
    <div className={styles.summary}><span><strong>{rhythm.data ? calls.filter(c => ['Overdue', 'Today'].includes(c.group)).length : '—'}</strong> calls due</span><span><strong>{overview.data && !overview.data.coverage.calls_error ? overview.data.recommendations.filter(a => a.kind === 'reply').reduce((n, a) => n + a.lead_ids.length, 0) : '—'}</strong> replies without a next step</span><span><strong>{tasks.data ? preparation.filter(t => t.status !== 'completed' && ['Overdue', 'Today'].includes(workspaceDue(t.due))).length : '—'}</strong> preparation tasks due</span></div>
    <div className={styles.toolbar}><div className={styles.toggle}><button aria-pressed={!attention} onClick={() => setAttention(false)}>All work</button><button aria-pressed={attention} onClick={() => setAttention(true)}>Needs attention</button></div><label className={styles.search}><Search size={15} /><input aria-label="Search outbound work" placeholder="Search your outbound work…" value={query} onChange={e => { setQuery(e.target.value); setLimit(20) }} /></label><button className="compass-btn-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} />{busy ? 'Refreshing…' : 'Refresh'}</button></div>
    {(error || overview.error || rhythm.error || tasks.error || rhythm.data?.partial) && <p className={styles.warning} role="status">{error || 'Some records may be incomplete or out of date. Refresh to try again; available records are shown below.'}</p>}
    <div className={styles.board}>
      <Lane title="Emails" icon={<Mail size={17} />} total={campaigns.length} caption="Campaigns, preparation and observed replies">
        {campaigns.slice(0, limit).map(c => <button key={c.id} id={`outbound-campaign-${c.id}`} className={styles.card} onClick={() => setSelectedCampaign(c.id)}><div className={styles.cardTop}><span className={styles.badge}>{c.provider_status || c.status || 'Not connected'}</span><ArrowUpRight size={14} /></div><h3>{c.name}</h3><div className={styles.metrics}><span><strong>{count(c.prepared_count)}</strong>prepared</span><span><strong>{count(c.provider?.loaded)}</strong>provider loaded</span><span><strong>{count(c.provider?.replies)}</strong>total replies</span></div><footer>Provider observation · {c.freshness.replaceAll('_', ' ')}</footer></button>)}
        {!campaigns.length && <Empty loading={overview.loading} error={overview.error}>No campaigns match this view.</Empty>}
      </Lane>
      <Lane title="Call" icon={<Phone size={17} />} total={shownCalls.length} caption="Selected contacts · due calls first">
        {shownCalls.slice(0, limit).map(c => <Link key={c.lead.id} className={styles.card} href={`/sales/outbound/calling?lead=${encodeURIComponent(c.lead.id)}`}><div className={styles.cardTop}><span className={c.group === 'Overdue' ? styles.urgent : styles.badge}>{c.group}</span><ArrowUpRight size={14} /></div><h3>{workspaceCompany(c.lead)}</h3><p>{c.lead.name !== c.lead.company ? c.lead.name : c.status.label}</p><footer>{c.task?.title || c.status.label}<span>Open call →</span></footer></Link>)}
        {!shownCalls.length && <Empty loading={rhythm.loading} error={rhythm.error}>No selected calls match this view.</Empty>}
      </Lane>
      <Lane title="Motion" icon={<MessageSquare size={17} />} total={shownMotion.length} caption="Recorded conversations and their next steps">
        {shownMotion.slice(0, limit).map(c => <Link key={c.lead.id} className={styles.card} href={`/sales/outbound/rhythm?lead=${encodeURIComponent(c.lead.id)}`}><div className={styles.cardTop}><span className={c.group === 'Needs next step' ? styles.urgent : styles.badge}>{c.group}</span><ArrowUpRight size={14} /></div><h3>{workspaceCompany(c.lead)}</h3><p>{c.description}</p><footer>{c.next ? `${workspaceDue(c.next.due)} · ${c.next.outreach_state || 'Recorded'}` : 'Review next step'}<span>Open conversation →</span></footer></Link>)}
        {!shownMotion.length && <Empty loading={rhythm.loading} error={rhythm.error}>No recorded conversations match this view.</Empty>}
      </Lane>
      <Lane title="Tasks" icon={<CheckSquare size={17} />} total={shownTasks.length} caption="Preparation linked to outbound work">
        {shownTasks.slice(0, limit).map(t => <button key={t.id} className={`${styles.card} ${t.status === 'completed' ? styles.completed : ''}`} onClick={() => void openTask(t)}><div className={styles.cardTop}><span className={workspaceDue(t.due) === 'Overdue' && t.status !== 'completed' ? styles.urgent : styles.badge}>{t.status === 'completed' ? 'Completed' : workspaceDue(t.due)}</span><ArrowUpRight size={14} /></div><h3>{t.title}</h3>{t.action && <p>{t.action.reason}</p>}<footer>{t.status?.replaceAll('-', ' ') || 'Recorded task'}<span>Edit task →</span></footer></button>)}
        {!shownTasks.length && <Empty loading={tasks.loading || overview.loading} error={tasks.error}>No preparation tasks match this view.</Empty>}
        <button className={styles.addTask} onClick={() => setCreating(true)}><Plus size={15} /> Add preparation task</button>
      </Lane>
    </div>
    {Math.max(campaigns.length, shownCalls.length, shownMotion.length, shownTasks.length) > limit && <button className="compass-btn-secondary" onClick={() => setLimit(n => n + 20)}>Show more records</button>}
    <p className={styles.footnote}>Live Compass records. Provider totals are observed counts; prepared, loaded and sent are separate stages.</p>
    <ModalFrame open={active && creating} onClose={() => setCreating(false)} label="Add outbound preparation task" overlayClassName={styles.overlay} contentClassName={styles.dialog}><div className={styles.dialogHeader}><h2>Add preparation task</h2><button aria-label="Close" className="compass-btn-secondary" onClick={() => setCreating(false)}><X size={16} /></button></div><TaskCreate projectsById={projectsById} businessFunctionsById={businessFunctionsById} defaultSource={OUTBOUND_TASK_SOURCE} defaultTaskType="SELL" onCreated={async () => { setCreating(false); await tasks.reload() }} onCancel={() => setCreating(false)} /></ModalFrame>
    <ModalFrame open={active && !!campaign} onClose={() => setSelectedCampaign(null)} label={campaign?.name || 'Campaign'} overlayClassName={styles.overlay} contentClassName={styles.dialog}>{campaign && <><div className={styles.dialogHeader}><h2>{campaign.name}</h2><button aria-label="Close campaign" className="compass-btn-secondary" onClick={() => setSelectedCampaign(null)}><X size={16} /></button></div><p>Provider status: {campaign.provider_status || 'Unknown'} · {campaign.freshness.replaceAll('_', ' ')}</p><dl className={styles.details}>{[['Prepared', campaign.prepared_count], ['Loaded receipts', campaign.loaded_receipt_count], ['Provider loaded', campaign.provider?.loaded], ['Contacted', campaign.provider?.contacted], ['Sent', campaign.provider?.sent], ['Total replies', campaign.provider?.replies]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{count(value as number | null | undefined)}</dd></div>)}</dl><p>Reply totals do not indicate unread messages. Review individual conversations in the inbox.</p><div className={styles.dialogActions}><Link className="compass-btn-primary" href="/inbox">Review inbox <ArrowUpRight size={14} /></Link><button className="compass-btn-secondary" onClick={() => { setSelectedCampaign(null); onEvidence() }}>View evidence</button></div></>}</ModalFrame>
    {active && selectedTask && <TaskDetailPanel task={selectedTask} projectsById={projectsById} businessFunctionsById={businessFunctionsById} onClose={() => setSelectedTask(null)} onChanged={async () => { await tasks.reload() }} />}
  </div>
}
