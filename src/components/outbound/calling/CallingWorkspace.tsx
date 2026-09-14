'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileText, MapPin, NotebookPen, Phone, Plus, RefreshCw, Search, Users } from 'lucide-react'
import { OUTCOMES, callWindow, isOpen, type RhythmCommand, type RhythmLead } from '@/lib/outbound-rhythm'
import { CALLING_DRAFT_PREFIX, CALLING_ZONES, callBlockReason, callingCapture, callingFacts, callingMetrics, callingPhone, callingQueueStatus, hasCallingDraft, newCallingDraft, parseStoredCallingDraft, safeCallingUrl, sortedCallingQueue, type CallingDetail, type CallingDraft, type CallingQueue } from '@/lib/calling-workspace'
import { onWorkChanged, workFetch } from '@/lib/workspace-change'
import './calling.css'

const endpoint = '/api/operator/outbound/rhythm'
async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Unable to load calling data.')
  return body
}
const company = (lead: RhythmLead) => lead.company || lead.name || 'Unnamed business'
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
function when(value?: string | null, zone?: string | null) {
  if (!value) return 'Date not recorded'
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: zone || 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) } catch { return 'Date unavailable' }
}
function ErrorMessage({ children }: { children: React.ReactNode }) { return <p className="calling-error" role="alert">{children}</p> }

export function CallingWorkspace() {
  const [data, setData] = useState<CallingQueue | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [city, setCity] = useState('')
  const [findMode, setFindMode] = useState(false)
  const [found, setFound] = useState<RhythmLead[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searched, setSearched] = useState(false)
  const [mobileQueue, setMobileQueue] = useState(false)
  const [locked, setLocked] = useState(false)
  const [clock, setClock] = useState<Date | null>(null)
  const searchRun = useRef(0)
  const load = useCallback(async () => {
    const next = await read<CallingQueue>(endpoint)
    setData(next); setError('')
    setSelected(old => old || new URLSearchParams(window.location.search).get('lead') || sortedCallingQueue(next)[0]?.id || '')
    return next
  }, [])
  useEffect(() => {
    let live = true
    const refresh = () => { if (live) void load().catch(e => { if (live) setError(e.message) }) }
    refresh()
    const off = onWorkChanged(refresh)
    const tick = () => setClock(new Date())
    tick(); const timer = window.setInterval(tick, 60000)
    return () => { live = false; off(); window.clearInterval(timer) }
  }, [load])
  const sorted = data ? sortedCallingQueue(data, clock || new Date()) : []
  const matches = (lead: RhythmLead) => (!city || lead.city === city) && `${company(lead)} ${lead.name || ''} ${lead.city || ''}`.toLowerCase().includes(query.toLowerCase())
  const visible = findMode ? found : sorted.filter(lead => matches(lead) && (filter === 'all' || callingQueueStatus(lead, data!.tasks, data!.touches, clock || new Date()).kind === filter))
  const index = visible.findIndex(l => l.id === selected)
  const metrics = data ? callingMetrics(data.touches, clock || new Date()) : null
  function choose(id: string, afterSave = false) {
    if (locked && !afterSave) { setNotice('Finish saving or retry the pending outcome before changing contacts.'); return }
    setSelected(id); setMobileQueue(false)
    const url = new URL(window.location.href); url.searchParams.set('lead', id)
    window.history.replaceState(window.history.state, '', url)
  }
  async function searchLedger() {
    if (query.trim().length < 2) { setSearchError('Enter at least two characters to search the lead ledger.'); return }
    const run = ++searchRun.current
    setSearching(true); setSearchError(''); setSearched(false)
    try {
      const result = await read<{ leads: RhythmLead[] }>(`${endpoint}?q=${encodeURIComponent(query.trim())}`)
      if (run === searchRun.current) { setFound(result.leads); setSearched(true) }
    } catch (e) { if (run === searchRun.current) setSearchError((e as Error).message) }
    finally { if (run === searchRun.current) setSearching(false) }
  }
  async function saved(id: string) {
    setNotice('Call saved to the contact history. Follow-up changes are saved in Compass.')
    try {
      await load()
      const at = visible.findIndex(l => l.id === id)
      const next = visible.slice(at + 1).find(l => !callBlockReason(l))
      if (next) choose(next.id, true)
    } catch (e) { setError(`Call saved, but the queue could not refresh: ${(e as Error).message}`) }
  }
  return <section className="calling-workspace" aria-label="Calling workspace">
    <header className="calling-toolbar">
      <div className="calling-nav"><Link href="/sales/outbound"><ArrowLeft aria-hidden="true" />Outbound</Link><span className="calling-divider" /><h1>Calling</h1></div>
      <div className="calling-toolbar-actions"><Link href="/sales/outbound/rhythm" className="calling-btn">Today & follow-ups</Link><button className="calling-btn" onClick={() => void load().catch(e => setError(e.message))}><RefreshCw aria-hidden="true" /><span>Refresh</span></button></div>
    </header>
    <div className="calling-session"><span><Phone aria-hidden="true" />Ads + booking <span className="calling-muted">/ {city || 'Selected contacts'}</span></span><div aria-label="Recorded calls today"><span><b>{metrics?.attempts ?? '—'}</b> calls</span><span><b>{metrics?.conversations ?? '—'}</b> decision-maker conversations</span><span><b>{metrics?.meetings ?? '—'}</b> meetings</span><small>Today · Sydney</small></div></div>
    {error && <ErrorMessage>{error} <button onClick={() => void load().catch(e => setError(e.message))}>Retry</button></ErrorMessage>}
    {notice && <div className="calling-notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {data?.partial && <ErrorMessage>The calling pool reached its result limit. Counts cover the returned contacts only.</ErrorMessage>}
    <button className="calling-mobile-queue" aria-expanded={mobileQueue} aria-controls="calling-queue" onClick={() => setMobileQueue(!mobileQueue)}>Lead queue · {visible.length}<ChevronDown aria-hidden="true" /></button>
    <div className="calling-columns">
      <aside id="calling-queue" className={`calling-queue ${mobileQueue ? 'is-open' : ''}`} aria-label="Lead queue">
        <div className="calling-queue-tools"><div className="calling-section-heading"><h2>{findMode ? 'Find existing leads' : 'Lead queue'}</h2><button className="calling-icon" aria-label={findMode ? 'Back to selected contacts' : 'Find leads to add'} title={findMode ? 'Back to queue' : 'Find leads'} onClick={() => { searchRun.current++; setFindMode(!findMode); setQuery(''); setFound([]); setSearchError(''); setSearched(false); setSearching(false) }}>{findMode ? <ArrowLeft /> : <Plus />}</button></div>
        <form onSubmit={e => { e.preventDefault(); if (findMode) void searchLedger() }}><label className="calling-search"><Search aria-hidden="true"/><span className="sr-only">Search leads</span><input value={query} onChange={e => { setQuery(e.target.value); if (findMode) { searchRun.current++; setFound([]); setSearched(false); setSearching(false) } }} placeholder={findMode ? 'Search the lead ledger…' : 'Search this queue…'} /></label>{findMode && <button className="calling-btn calling-search-submit" disabled={searching}>{searching ? 'Searching…' : 'Search ledger'}</button>}</form>
        {!findMode && <><label className="calling-city"><span className="sr-only">Filter by city</span><select value={city} onChange={e => setCity(e.target.value)}><option value="">All locations</option>{[...new Set(data?.leads.map(l => l.city).filter((v): v is string => Boolean(v)))].sort().map(v => <option key={v}>{v}</option>)}</select></label><div className="calling-filters" aria-label="Queue filter">{[['all', 'All'], ['followup', 'Follow-ups'], ['done', 'Called'], ['held', 'Held']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div></>}
        {searchError && <ErrorMessage>{searchError}</ErrorMessage>}</div>
        <ul className="calling-leads" aria-busy={searching || !data}>{visible.map(lead => {
          const status = data ? callingQueueStatus(lead, data.tasks, data.touches, clock || new Date()) : { kind: 'ready', label: '' }
          return <li key={lead.id}><button className="calling-lead" aria-current={selected === lead.id ? 'true' : undefined} disabled={locked && selected !== lead.id} onClick={() => choose(lead.id)}><span className="calling-avatar">{initials(company(lead))}</span><span><strong>{company(lead)}</strong><small>{[lead.name && lead.name !== lead.company ? lead.name : '', lead.city].filter(Boolean).join(' · ') || 'Contact details not recorded'}</small><small className={`calling-status is-${status.kind}`}>{findMode ? 'Open profile' : status.label}</small></span></button></li>
        })}</ul>
        {!visible.length && <p className="calling-empty">{!data && !error ? 'Loading selected contacts…' : findMode ? searched ? 'No matching leads. Try another company or contact name.' : 'Search for an existing company or contact, then add it to your calling queue.' : 'No leads in this view. Change the filters or use + to find existing contacts.'}</p>}
        <div className="calling-queue-footer">{findMode ? 'Up to 25 matching ledger contacts' : `${visible.length} of ${data?.leads.length ?? 0} selected contacts`}</div>
      </aside>
      {selected ? <CallingContact key={selected} leadId={selected} isSelected={Boolean(data?.leads.some(l => l.id === selected))} position={index >= 0 ? `${index + 1} of ${visible.length}` : 'Selected contact'} onPrevious={index > 0 ? () => choose(visible[index - 1].id) : undefined} onNext={index >= 0 && index < visible.length - 1 ? () => choose(visible[index + 1].id) : undefined} onSaved={saved} onQueueChanged={load} onLocked={setLocked} /> : <div className="calling-start"><Phone aria-hidden="true"/><h2>Your calling workspace</h2><p>Choose a contact to see their business profile, script and call notes.</p></div>}
    </div>
    <footer className="calling-footer"><span><Check aria-hidden="true"/>Existing Compass contacts and follow-ups</span><span>{data ? `Checked ${when(data.checkedAt)} · Recorded activity only` : 'Loading calling data'}</span></footer>
  </section>
}

function CallingContact({ leadId, isSelected, position, onPrevious, onNext, onSaved, onQueueChanged, onLocked }: {
  leadId: string; isSelected: boolean; position: string; onPrevious?: () => void; onNext?: () => void;
  onSaved: (id: string) => Promise<void>; onQueueChanged: () => Promise<CallingQueue>; onLocked: (value: boolean) => void;
}) {
  const [data, setData] = useState<CallingDetail | null>(null)
  const [draft, setDraft] = useState<CallingDraft>(newCallingDraft())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [stored, setStored] = useState(true)
  const [script, setScript] = useState('first')
  const [handedOff, setHandedOff] = useState(false)
  const [savedNotice, setSavedNotice] = useState('')
  const [now, setNow] = useState<Date | null>(null)
  const pending = useRef<RhythmCommand | null>(null)
  const guard = useRef(false)
  const phoneLink = useRef<HTMLAnchorElement>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const load = useCallback(async () => {
    const fresh = await read<CallingDetail>(`${endpoint}?lead=${encodeURIComponent(leadId)}`)
    setData(fresh)
    return fresh
  }, [leadId])
  useEffect(() => {
    const controller = new AbortController()
    read<CallingDetail>(`${endpoint}?lead=${encodeURIComponent(leadId)}`, controller.signal).then(fresh => {
      if (controller.signal.aborted) return
      setData(fresh)
      let saved = null
      try { saved = parseStoredCallingDraft(localStorage.getItem(CALLING_DRAFT_PREFIX + leadId), leadId) } catch { setStored(false) }
      setDraft(saved?.draft || newCallingDraft(fresh.lead)); pending.current = saved?.pending || null
      setUncertain(Boolean(pending.current)); setReady(true)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [leadId])
  useEffect(() => { onLocked(busy || uncertain); return () => onLocked(false) }, [busy, uncertain, onLocked])
  const persist = useCallback((value: CallingDraft, command: RhythmCommand | null) => {
    try {
      if (hasCallingDraft(value) || command) localStorage.setItem(CALLING_DRAFT_PREFIX + leadId, JSON.stringify({ draft: value, pending: command }))
      else localStorage.removeItem(CALLING_DRAFT_PREFIX + leadId)
      setStored(true)
    } catch { setStored(false) }
  }, [leadId])
  useEffect(() => { if (ready) persist(draft, pending.current) }, [draft, ready, persist])
  useEffect(() => {
    const beforeLeave = (e: BeforeUnloadEvent) => { if (pending.current || (!stored && hasCallingDraft(draft))) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', beforeLeave)
    return () => window.removeEventListener('beforeunload', beforeLeave)
  }, [stored, draft])
  useEffect(() => { setNow(new Date()); const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer) }, [])
  function change<K extends keyof CallingDraft>(key: K, value: CallingDraft[K]) { setDraft(old => ({ ...old, [key]: value })); setError(''); setSavedNotice('') }
  async function dial() {
    if (guard.current) return
    guard.current = true; setBusy(true); setError('')
    try {
      const fresh = await load(); const blocked = callBlockReason(fresh.lead)
      if (blocked) throw new Error(blocked)
      if (phoneLink.current) { phoneLink.current.href = `tel:${String(fresh.lead.phone).replace(/[^+0-9]/g, '')}`; phoneLink.current.click(); setHandedOff(true) }
    } catch (e) { setError((e as Error).message) }
    finally { guard.current = false; setBusy(false) }
  }
  async function addToQueue() {
    if (guard.current) return
    guard.current = true; setBusy(true); setError('')
    try {
      const fresh = await load()
      if (!draft.timezone) throw new Error('Choose this contact’s timezone before adding them.')
      const response = await workFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'select', lead_id: leadId, revision: fresh.lead.rhythm_revision, selected: true, timezone: draft.timezone }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to add contact.')
      await load(); await onQueueChanged(); setSavedNotice('Added to the calling queue.')
    } catch (e) { setError((e as Error).message) }
    finally { guard.current = false; setBusy(false) }
  }
  async function save() {
    if (!data || !ready || guard.current) return
    guard.current = true; setBusy(true); setError(''); setSavedNotice('')
    let committed = false
    try {
      if (!pending.current) pending.current = callingCapture(data, draft, crypto.randomUUID(), new Date().toISOString())
      persist(draft, pending.current)
      setUncertain(true)
      const response = await workFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current) })
      if (!response.ok) {
        let message = 'The save could not be confirmed. Retry this same outcome.'
        try { message = (await response.json()).error || message } catch { /* Keep the original request for uncertain responses. */ }
        if (response.status >= 400 && response.status < 500) {
          pending.current = null; setUncertain(false); persist(draft, null)
          if (/conflict|open_action|task_closed/.test(message)) message = 'This contact or its open actions changed. Reload the contact, review the actions below, then save your retained draft.'
        }
        throw new Error(message)
      }
      // A confirmed HTTP success owns the save; a later read failure must never offer to submit it again.
      committed = true; pending.current = null; setUncertain(false); setHandedOff(false)
      const blank = newCallingDraft(data.lead); setDraft(blank); persist(blank, null)
      setSavedNotice('Call outcome saved in Compass.'); setBusy(false); onLocked(false)
      window.dispatchEvent(new Event('outbound-rhythm-changed'))
      await load()
      await onSaved(leadId)
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Unable to save.'
      setError(committed ? `Call saved. Contact refresh failed: ${raw}` : raw.startsWith('[') ? 'Check the outcome, next action, timezone and closure reason before saving.' : raw)
    } finally { guard.current = false; setBusy(false) }
  }
  async function reloadContact() {
    setError('')
    try {
      const fresh = await load()
      if (!ready) {
        let recovered = null
        try { recovered = parseStoredCallingDraft(localStorage.getItem(CALLING_DRAFT_PREFIX + leadId), leadId) } catch { setStored(false) }
        setDraft(recovered?.draft || newCallingDraft(fresh.lead)); pending.current = recovered?.pending || null
        setUncertain(Boolean(pending.current)); setReady(true)
      }
      setSavedNotice('Contact refreshed. Your draft is retained; review current open actions before saving.')
    } catch (e) { setError((e as Error).message) }
  }
  function exportNotes() {
    const text = `# ${data ? company(data.lead) : 'Contact'}\n\nDraft call notes (not a recorded call)\n${draft.note || 'No draft notes.'}\n\n## Recorded activity\n${(data?.touches || []).map(t => `${when(t.contacted_at)} · ${t.channel} · ${t.outcome || 'Interaction'}\n${t.note || ''}`).join('\n\n')}`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `calling-notes-${leadId}.md`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!data) return <div className="calling-start" aria-busy={!error}>{error ? <><ErrorMessage>{error}</ErrorMessage><button className="calling-btn" onClick={() => void reloadContact()}>Retry contact</button></> : <p role="status">Loading contact…</p>}</div>
  const lead = data.lead
  const blocked = callBlockReason(lead)
  const facts = callingFacts(lead.lead_facts)
  const services = facts.filter(f => /specialty|service/i.test(f.kind))
  const marketing = facts.filter(f => /marketing|google|meta|advertis|facebook/i.test(f.kind + ' ' + f.claim))
  const other = facts.filter(f => !services.includes(f) && !marketing.includes(f))
  const factText = (pattern: RegExp) => facts.find(f => pattern.test(f.kind))?.claim || 'Not researched'
  const open = data.tasks.filter(isOpen)
  const website = safeCallingUrl(lead.website)
  const zone = draft.timezone || lead.rhythm_timezone
  const firstName = lead.name && lead.name !== lead.company ? lead.name.split(' ')[0] : ''
  const localTime = now && zone ? new Intl.DateTimeFormat('en-AU', { timeZone: CALLING_ZONES.includes(zone) ? zone : 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(now) : null
  const disable = busy || uncertain || !ready
  return <>
    <section className="calling-profile" aria-label="Business profile"><div className="calling-section-heading"><h2>Business profile</h2><div className="calling-pager"><span>{position}</span><button className="calling-icon" aria-label="Previous lead" disabled={!onPrevious || disable} onClick={onPrevious}><ChevronLeft /></button><button className="calling-icon" aria-label="Next lead" disabled={!onNext || disable} onClick={onNext}><ChevronRight /></button></div></div>
      <div className="calling-identity"><span className="calling-avatar large">{initials(company(lead))}</span><div><h2>{company(lead)}</h2><p><MapPin aria-hidden="true"/>{[lead.city, lead.state].filter(Boolean).join(', ') || 'Location not recorded'}</p></div></div>
      <div className="calling-tags"><span>Fit: {lead.icp_status || 'Not reviewed'}</span><span>{lead.vertical || 'Industry not recorded'}</span></div>
      {website && <a className="calling-website" href={website} target="_blank" rel="noreferrer">{new URL(website).hostname}<ArrowRight aria-hidden="true"/></a>}
      <div className="calling-contact-card"><div><Users aria-hidden="true"/><span><strong>{lead.name && lead.name !== lead.company ? lead.name : 'Contact name not verified'}</strong><small>{lead.role || 'Role not recorded'}</small></span></div><div className="calling-dial"><span><strong>{callingPhone(lead.phone)}</strong><small>{localTime ? `${localTime} · ${zone?.replace('Australia/', '')}` : 'Timezone not recorded'}</small></span><button className="calling-btn primary" onClick={() => void dial()} disabled={disable || Boolean(blocked)} aria-describedby={blocked ? 'calling-blocked' : undefined}><Phone aria-hidden="true"/>Call</button><a ref={phoneLink} hidden aria-hidden="true" tabIndex={-1}>Phone handoff</a></div>{blocked && <p id="calling-blocked" className="calling-muted">{blocked}</p>}{zone && callWindow(zone) && <p className="calling-muted">{callWindow(zone)}</p>}{handedOff && <p role="status">Phone app opened. Record the actual outcome after the call.</p>}</div>
      {!isSelected && <div className="calling-add"><label>Contact timezone<select value={draft.timezone} disabled={disable} onChange={e => change('timezone', e.target.value)}><option value="">Choose timezone</option>{CALLING_ZONES.map(z => <option key={z} value={z}>{z.replace('Australia/', '')}</option>)}</select></label><button className="calling-btn" disabled={disable} onClick={() => void addToQueue()}><Plus aria-hidden="true"/>Add to calling queue</button></div>}
      <section className="calling-profile-section"><h3>Business at a glance</h3><dl className="calling-facts"><div><dt>Estimated team size</dt><dd>{factText(/team size|employees|headcount/i)}</dd></div><div><dt>Estimated revenue</dt><dd>{factText(/revenue|turnover/i)}</dd></div><div><dt>Established</dt><dd>{factText(/tenure|established/i)}</dd></div><div><dt>Research checked</dt><dd>{lead.lead_context_updated_at ? when(lead.lead_context_updated_at) : 'Not recorded'}</dd></div></dl></section>
      <FactSection title="Services" facts={services} empty="Installation services have not been researched for this contact." />
      <FactSection title="Marketing notes" facts={marketing} empty="Google and Meta advertising have not been researched." />
      {other.length > 0 && <FactSection title="Saved research" facts={other} empty="" />}
      {open.length > 0 && <section className="calling-profile-section"><h3>Open actions <span>{open.length}</span></h3>{open.map(task => <div className="calling-history" key={task.id}><Clock3 aria-hidden="true"/><div><Link href={`/sales/outbound/rhythm?lead=${encodeURIComponent(leadId)}`}>{task.title}</Link><small>{task.outreach_state} · {task.due ? when(task.due, task.outreach_timezone) : 'Date unresolved'}</small></div></div>)}</section>}
      <section className="calling-profile-section"><h3>Recent activity</h3>{data.touches.length ? data.touches.map(t => <div className="calling-history" key={t.id}>{t.channel === 'call' ? <Phone aria-hidden="true"/> : <FileText aria-hidden="true"/>}<div><strong>{OUTCOMES[t.outcome as keyof typeof OUTCOMES] || t.outcome?.replaceAll('_', ' ') || t.channel}</strong><small>{when(t.contacted_at, zone)} · {t.channel}</small>{t.note && <p>{t.note}</p>}</div></div>) : <p className="calling-muted">No contact activity is recorded here.</p>}<p className="calling-footnote">Latest {data.historyLimit || 50} recorded interactions. Missing history is not proof that no contact occurred.</p></section>
    </section>
    <section className="calling-work" aria-label="Call script and notes"><div className="calling-script"><div className="calling-section-heading"><h2><FileText aria-hidden="true"/>Call script</h2><small>Ads + booking</small></div><div className="calling-script-tabs" aria-label="Call script">{[['first', 'First conversation'], ['followup', 'Follow-up'], ['objections', 'Objections']].map(([key, label]) => <button key={key} aria-pressed={script === key} onClick={() => setScript(key)}>{label}</button>)}</div><CallScript variant={script} name={firstName} /></div>
      <div className="calling-notes"><div className="calling-section-heading"><h2><NotebookPen aria-hidden="true"/>Call notes</h2><div className="calling-note-tools"><small>{!ready ? 'Loading draft…' : stored ? 'Draft saved locally' : 'Draft only in this tab'}</small><button className="calling-icon" title="Export contact notes" aria-label="Export contact notes" onClick={exportNotes}><Download /></button></div></div>
        {!stored && <ErrorMessage>Browser storage is unavailable. Export your notes before leaving this page.</ErrorMessage>}
        {uncertain && <p className="calling-pending" role="status">A save is awaiting confirmation. Retry the same outcome to reconcile it safely.</p>}
        <label className="sr-only" htmlFor="calling-note">Call notes for {company(lead)}</label><textarea ref={noteInput} id="calling-note" className="calling-note-input" value={draft.note} maxLength={4000} disabled={disable} onChange={e => change('note', e.target.value)} placeholder="Capture needs, objections and any promises…" />
        {savedNotice && <p className="calling-saved" role="status">{savedNotice}</p>}
        <form className="calling-outcome" onSubmit={e => { e.preventDefault(); void save() }} noValidate>
          {error && <div id="calling-save-error"><ErrorMessage>{error} {!uncertain && <button type="button" onClick={() => void reloadContact()}>Reload contact</button>}</ErrorMessage></div>}
          <fieldset disabled={disable}><label>Call outcome<select value={draft.outcome} onChange={e => change('outcome', e.target.value)} aria-describedby={error ? 'calling-save-error' : undefined}><option value="">Select the actual outcome…</option>{Object.entries(OUTCOMES).filter(([k]) => k !== 'next_step').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>What happens next?<select value={draft.disposition} onChange={e => change('disposition', e.target.value as CallingDraft['disposition'])}><option value="unresolved">Next step or date unresolved</option><option value="schedule">Schedule a follow-up</option><option value="closed">No further action (add a reason in notes)</option></select></label>
          {draft.disposition !== 'closed' && <><label>Next action <span className="calling-muted">{draft.disposition === 'schedule' ? '' : '(optional)'}</span><input value={draft.title} onChange={e => change('title', e.target.value)} maxLength={250} placeholder="e.g. Send the installation outline"/></label>{(draft.title || draft.disposition === 'schedule') && <div className="calling-followup"><label>Channel<select value={draft.nextChannel} onChange={e => change('nextChannel', e.target.value as CallingDraft['nextChannel'])}><option value="call">Call</option><option value="email">Email</option><option value="sms">SMS</option><option value="other">Other</option></select></label><label>Timezone<select value={draft.timezone} onChange={e => change('timezone', e.target.value)}><option value="">Choose timezone</option>{CALLING_ZONES.map(z => <option key={z} value={z}>{z.replace('Australia/', '')}</option>)}</select></label><label className="calling-full">Date & time {draft.disposition !== 'schedule' && '(optional)'}<input type="datetime-local" value={draft.due} onChange={e => change('due', e.target.value)}/></label>{draft.due && <label className="calling-check calling-full"><input type="checkbox" checked={draft.agreed} onChange={e => change('agreed', e.target.checked)}/>This time was agreed with the contact</label>}{draft.nextChannel === 'sms' && <label className="calling-full">Invitation or agreement to text<input value={draft.smsBasis} maxLength={1000} onChange={e => change('smsBasis', e.target.value)}/></label>}</div>}</>}
          {draft.outcome === 'do_not_contact' && <label>Channels restricted<select value={draft.restriction} onChange={e => change('restriction', e.target.value as CallingDraft['restriction'])}><option value="unknown">Unclear · hold all contact</option><option value="all">All channels</option><option value="call">Calls</option><option value="email">Email</option><option value="sms">SMS</option></select></label>}
          <details className="calling-more"><summary>Person reached & open actions</summary><label>Person reached<input value={draft.person} onChange={e => change('person', e.target.value)} maxLength={250} placeholder="Who did you actually speak with?"/></label>{open.length > 0 && <><label>Complete an existing action<select value={draft.completeTask} onChange={e => change('completeTask', e.target.value)}><option value="">Keep existing actions open</option>{open.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label className="calling-check"><input type="checkbox" checked={draft.additional} onChange={e => change('additional', e.target.checked)}/>Keep other open actions and add this next step</label></>}</details></fieldset>
          <div className="calling-save-actions"><button type="button" className="calling-btn subtle" disabled={disable || !onNext} onClick={onNext}>Skip for now</button><button className="calling-btn primary" disabled={busy || !ready}>{busy ? 'Saving…' : uncertain ? 'Retry saved request' : 'Save outcome & next'}<ArrowRight aria-hidden="true"/></button></div>
        </form>
      </div>
    </section>
  </>
}

function FactSection({ title, facts, empty }: { title: string; facts: ReturnType<typeof callingFacts>; empty: string }) {
  return <section className="calling-profile-section"><h3>{title}</h3>{facts.length ? facts.map((fact, i) => <div className="calling-research" key={i}><small>{fact.kind}</small><p>{fact.claim}</p>{fact.url ? <a href={fact.url} target="_blank" rel="noreferrer">{new URL(fact.url).hostname} ↗</a> : <small>Source link not recorded</small>}</div>) : <p className="calling-muted">{empty}</p>}</section>
}
function CallScript({ variant, name }: { variant: string; name: string }) {
  const open = name ? `Hi ${name}, Jules here from Switchflow. Have you got a moment?` : 'Hi, Jules here from Switchflow. Who is the best person to speak with about new installation enquiries?'
  const sections = variant === 'objections' ? [
    ['We already have an agency', 'Understood. What are they looking after for you, and are you happy with how it’s working?'],
    ['Just send some information', 'Of course. Which installation work and areas should I focus on so it’s relevant?'],
    ['We’re too busy right now', 'That makes sense. When does your installation schedule usually open up?'],
  ] : variant === 'followup' ? [
    ['Reconnect', open],
    ['Return to the conversation', 'Use the recorded history to recap what you discussed and the next step you agreed.'],
    ['Agree the next action', 'What would be the most useful next step from here?'],
  ] : [
    ['Open the conversation', open],
    ['Understand their needs', 'Are you looking to take on more installation work at the moment?'],
    ['Find the next step', 'We help installers bring in suitable enquiries through Google Search and turn them into booked quote appointments. Would it be useful to talk through how that could work for your team?'],
  ]
  return <div>{sections.map(([label, copy], i) => <div className="calling-script-block" key={label}><h3><span>{i + 1}</span>{label}</h3><p>{copy}</p>{i === 0 && variant !== 'objections' && <small>Pause. Give them room to respond.</small>}</div>)}</div>
}
