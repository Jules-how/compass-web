'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, BarChart3, Check, LayoutDashboard, RefreshCw, Search, Star, Users } from 'lucide-react'
import type { LeadSummaryCounts } from '@/lib/types'
import { TOP_TASK_LIMIT, SUBTASK_LIMIT } from '@/lib/list-columns'
import { useCachedJson } from '@/lib/use-cached-json'
import { REPORT_DASHBOARDS, REPORT_FAVORITES_KEY, isReportDashboardId, isWorkReportPayload, parseReportFavorites, reportCount, summarizeWorkReport, type ReportBar, type ReportDashboardId, type WorkReportPayload } from '@/lib/reports-model'

function timestamp(value: number) {
  return value ? new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Not loaded yet'
}

function Metric({ title, value, hint, href }: { title: string; value: number | null; hint: string; href?: string }) {
  return <div className="report-metric"><span>{title}</span><strong>{value == null ? '—' : value.toLocaleString()}</strong><small>{value == null ? 'Unavailable from source' : hint}</small>{href ? <Link href={href} aria-label={`View ${title.toLowerCase()} records`}><ArrowUpRight size={16} aria-hidden="true" /></Link> : null}</div>
}

function Bars({ title, subtitle, rows, footer }: { title: string; subtitle: string; rows: ReportBar[]; footer?: ReactNode }) {
  const max = Math.max(1, ...rows.map((row) => row.count ?? 0))
  return <section className="report-chart"><header><h2>{title}</h2><p>{subtitle}</p></header><ul className="report-bars">{rows.map((row) => <li key={row.label}><div className="report-bar-label">{row.href ? <Link href={row.href}>{row.label}<ArrowUpRight size={12} aria-hidden="true" /></Link> : <span>{row.label}</span>}<strong>{row.count == null ? 'Unavailable' : row.count.toLocaleString()}</strong></div><div className="report-bar-track" aria-hidden="true"><span className={`report-bar-fill is-${row.tone || 'violet'}`} style={{ width: `${((row.count ?? 0) / max) * 100}%` }} /></div></li>)}</ul>{footer ? <footer>{footer}</footer> : null}</section>
}

function SourceState({ error, loading, updatedAt, retry, children }: { error: string | null; loading: boolean; updatedAt: number; retry: () => void; children: ReactNode }) {
  return <div className="report-source" aria-busy={loading}>{error ? <p role="alert">Could not refresh this source. {updatedAt ? 'The displayed figures are from the last successful load.' : 'Figures are unavailable.'} <button type="button" onClick={retry}>Retry</button></p> : loading ? <p role="status">Loading source data…</p> : null}<div><span>{updatedAt ? `Source loaded ${timestamp(updatedAt)}` : 'Source not loaded yet'}</span>{children}</div></div>
}

export function ReportsWorkspace() {
  const params = useSearchParams()
  const dashboardId = params.get('dashboard')
  const active = isReportDashboardId(dashboardId) ? dashboardId : null
  const [favorites, setFavorites] = useState<ReportDashboardId[]>([])
  const [query, setQuery] = useState('')
  const [preferenceError, setPreferenceError] = useState(false)
  useEffect(() => { try { setFavorites(parseReportFavorites(window.localStorage.getItem(REPORT_FAVORITES_KEY))) } catch { setPreferenceError(true) } }, [])
  const leads = useCachedJson<{ summary: LeadSummaryCounts }>('leads:summary:global', '/api/leads/summary', { staleMs: 30_000, enabled: active === 'crm' || active === 'coverage' })
  const work = useCachedJson<WorkReportPayload>('/api/tasks', '/api/tasks', { staleMs: 30_000, enabled: active === 'work' })
  const workValid = isWorkReportPayload(work.data)
  const workSummary = useMemo(() => workValid && work.data ? summarizeWorkReport(work.data) : null, [work.data, workValid])
  const summary = leads.data?.summary
  const count = (key: keyof LeadSummaryCounts) => reportCount(summary, key)
  const selectedDashboard = REPORT_DASHBOARDS.find((dashboard) => dashboard.id === active)
  const visibleDashboards = REPORT_DASHBOARDS.filter((dashboard) => `${dashboard.title} ${dashboard.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  function toggleFavorite(id: ReportDashboardId) {
    const next = favorites.includes(id) ? favorites.filter((favorite) => favorite !== id) : [...favorites, id]
    setFavorites(next)
    try { window.localStorage.setItem(REPORT_FAVORITES_KEY, JSON.stringify(next)); setPreferenceError(false) } catch { setPreferenceError(true) }
  }
  const favoriteButton = (id: ReportDashboardId) => <button type="button" className="report-favorite" aria-label={`${favorites.includes(id) ? 'Unfavorite' : 'Favorite'} ${REPORT_DASHBOARDS.find((dashboard) => dashboard.id === id)?.title}`} aria-pressed={favorites.includes(id)} onClick={() => toggleFavorite(id)}><Star size={17} fill={favorites.includes(id) ? 'currentColor' : 'none'} aria-hidden="true" /></button>

  return <div className="reports-workspace">
    <header className="reports-toolbar">{active ? <Link className="report-back" href="/reports"><ArrowLeft size={16} aria-hidden="true" />All dashboards</Link> : <span className="reports-toolbar-label"><LayoutDashboard size={16} aria-hidden="true" />Dashboards</span>}{active ? <div className="reports-toolbar-actions">{favoriteButton(active)}<button type="button" disabled={active === 'work' ? work.refreshing : leads.refreshing} onClick={() => { void (active === 'work' ? work.reload(true) : leads.reload(true)) }}><RefreshCw size={15} aria-hidden="true" />{(active === 'work' ? work.refreshing : leads.refreshing) ? 'Refreshing…' : 'Refresh'}</button></div> : <label className="reports-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Find a dashboard" aria-label="Find a dashboard" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}</header>
    {active && selectedDashboard ? <>
      <div className="report-heading"><div><h1>{selectedDashboard.title}</h1><p>{selectedDashboard.description}</p></div><span className="report-builtin"><Check size={13} aria-hidden="true" />Built in</span></div>
      <nav className="report-dashboard-switcher" aria-label="Choose dashboard">{REPORT_DASHBOARDS.map((dashboard) => <Link key={dashboard.id} href={`/reports?dashboard=${dashboard.id}`} aria-current={active === dashboard.id ? 'page' : undefined}>{dashboard.title}</Link>)}</nav>
      {active === 'work' ? <>
        <SourceState error={work.error || (work.data && !workValid ? 'Unexpected work response' : null)} loading={work.loading} updatedAt={work.updatedAt} retry={() => void work.reload(true)}><span>Compass Projects and Tasks · up to {TOP_TASK_LIMIT} recent parent tasks; subtasks are restricted to those parents, from a capped {SUBTASK_LIMIT} row response. These are current records, not historical trends.</span></SourceState>
        <div className="report-metrics"><Metric title="Projects returned" value={workSummary?.projectCount ?? null} hint="Current project records" href="/projects" /><Metric title="Tasks in this view" value={workSummary?.taskCount ?? null} hint="Parents and their returned subtasks" href="/tasks" /><Metric title="Open tasks" value={workSummary?.openTaskCount ?? null} hint="Todo, in progress and blocked" /><Metric title="Overdue tasks" value={workSummary?.overdueCount ?? null} hint="Due before today in Sydney" /></div>
        {workSummary ? <div className="report-chart-grid"><Bars title="Project status" subtitle="Projects returned by the current workspace source." rows={workSummary.projectBars} footer={<Link href="/projects">Open projects <ArrowUpRight size={13} aria-hidden="true" /></Link>} /><Bars title="Recent task status" subtitle="Parents and returned subtasks. Cancelled work is shown separately." rows={workSummary.taskBars} footer={<Link href="/tasks">Open tasks <ArrowUpRight size={13} aria-hidden="true" /></Link>} /></div> : <div className="report-empty" role="status">{work.loading ? 'Loading work reports…' : 'Work reports will appear when the source is available.'}</div>}
        {workSummary ? <section className="report-record-list"><header><h2>Overdue in the loaded tasks</h2><p>{workSummary.missingDue} open {workSummary.missingDue === 1 ? 'task has' : 'tasks have'} no usable due date and cannot be checked for overdue status.</p></header>{workSummary.overdue.length ? <ul>{workSummary.overdue.map((task) => <li key={task.id}><span>{task.title}</span><time dateTime={task.due || undefined}>{task.due?.slice(0, 10)}</time></li>)}</ul> : <p>No overdue tasks found in this source response.</p>}<Link href="/tasks">Review tasks <ArrowUpRight size={13} aria-hidden="true" /></Link></section> : null}
      </> : <>
        <SourceState error={leads.error || (leads.data && !summary ? 'Unexpected ledger response' : null)} loading={leads.loading} updatedAt={leads.updatedAt} retry={() => void leads.reload(true)}><span>Compass lead ledger · exact counts across active leads and prospects. Archived records are counted separately. Status and contact categories can overlap.</span></SourceState>
        {active === 'crm' ? <>
          <div className="report-metrics"><Metric title="Active records" value={count('total')} hint="Leads and prospects" /><Metric title="Uncontacted" value={count('uncontacted')} hint="Explicitly recorded as uncontacted" href="/leads?outbound_status=uncontacted" /><Metric title="Replied" value={count('replied')} hint="Current replied status" href="/leads?outbound_status=replied" /><Metric title="Interested" value={count('interested')} hint="Current interested status" href="/leads?bucket=prospects&outbound_status=interested" /></div>
          <div className="report-chart-grid"><Bars title="Outreach snapshot" subtitle="Current statuses and Instantly membership. Membership is not proof of sending." rows={[{ label: 'Uncontacted', count: count('uncontacted'), href: '/leads?outbound_status=uncontacted' }, { label: 'Instantly membership', count: count('in_instantly') }, { label: 'Replied', count: count('replied'), href: '/leads?outbound_status=replied' }, { label: 'Interested', count: count('interested'), href: '/leads?bucket=prospects&outbound_status=interested', tone: 'green' }]} /><Bars title="Records to review" subtitle="Independent queues, not a funnel or conversion rate." rows={[{ label: 'Needs review', count: count('needs_review'), tone: 'amber' }, { label: 'Recontact ready', count: count('recontact_ready'), href: '/leads?recontact_ready=1' }, { label: 'Suppressed', count: count('suppressed'), tone: 'muted' }, { label: 'Archived', count: count('archived'), href: '/leads?bucket=archived', tone: 'muted' }]} /></div>
        </> : <>
          <div className="report-metrics"><Metric title="Active records" value={count('total')} hint="Leads and prospects" /><Metric title="Missing email" value={count('no_email')} hint="Blank or absent email" /><Metric title="Missing phone" value={count('no_phone')} hint="Blank or absent phone" /><Metric title="Suppressed" value={count('suppressed')} hint="Suppressed status or recorded reason" /></div>
          <div className="report-chart-grid"><Bars title="Contact gaps" subtitle="A record can be missing both an email and a phone." rows={[{ label: 'Missing email', count: count('no_email'), tone: 'amber' }, { label: 'Missing phone', count: count('no_phone'), tone: 'amber' }]} footer={<><Link href="/leads?completeness=no_email">Review leads missing email <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/leads?bucket=prospects&completeness=no_email">Review prospects missing email <ArrowUpRight size={13} aria-hidden="true" /></Link></>} /><Bars title="Review and restrictions" subtitle="A saved contact value alone does not establish verification or permission." rows={[{ label: 'Needs review', count: count('needs_review'), tone: 'amber' }, { label: 'Suppressed', count: count('suppressed'), tone: 'muted' }]} footer={<><Link href="/leads?suppressed=1">Review suppressed leads <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/leads?bucket=prospects&suppressed=1">Review suppressed prospects <ArrowUpRight size={13} aria-hidden="true" /></Link></>} /></div>
        </>}
        <div className="report-record-links"><span>Underlying records</span><Link href="/leads">Leads <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/leads?bucket=prospects">Prospects <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/leads?bucket=archived">Archive <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
      </>}
    </> : <>
      <div className="report-heading"><div><h1>Reports</h1><p>Choose a dashboard to understand your contacts and work.</p></div><span className="report-builtin">{REPORT_DASHBOARDS.length} built-in dashboards</span></div>
      <section className="report-favorites-section"><h2>Favorites</h2>{favorites.length ? <div className="report-favorites-grid">{REPORT_DASHBOARDS.filter((dashboard) => favorites.includes(dashboard.id)).map((dashboard) => <div key={dashboard.id}><LayoutDashboard size={20} aria-hidden="true" /><Link href={`/reports?dashboard=${dashboard.id}`}><strong>{dashboard.title}</strong><span>{dashboard.description}</span></Link>{favoriteButton(dashboard.id)}</div>)}</div> : <div className="report-favorites-empty"><Star size={22} aria-hidden="true" /><p>Your favorite dashboards will appear here.</p><span>Use the star beside any dashboard.</span></div>}</section>
      <section className="report-library" aria-label="Available dashboards"><div className="report-library-label"><span>Dashboard</span><span>Reports</span><span>Source</span></div>{visibleDashboards.map((dashboard) => <div className="report-library-row" key={dashboard.id}><span className="report-library-icon">{dashboard.icon === 'work' ? <BarChart3 size={18} aria-hidden="true" /> : <Users size={18} aria-hidden="true" />}</span><Link href={`/reports?dashboard=${dashboard.id}`}><strong>{dashboard.title}</strong><span>{dashboard.description}</span></Link><span className="report-library-count">{dashboard.reports} reports</span><span className="report-library-source">Compass records</span>{favoriteButton(dashboard.id)}</div>)}{visibleDashboards.length === 0 ? <p className="report-empty">No dashboard matches “{query}”.</p> : null}</section>
    </>}
    <p className="report-preference-note" role={preferenceError ? 'status' : undefined}>{preferenceError ? 'Favorites work for this session. This browser could not save them.' : 'Favorites are saved in this browser.'}</p>
  </div>
}
