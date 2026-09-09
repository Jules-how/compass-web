'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Clock3, MessageSquare, RefreshCw, UserRound } from 'lucide-react'
import type { DeliverySnapshot } from '@/lib/delivery-engine/store'
import type { DeliveryAccount, Enquiry } from '@/lib/delivery-engine/types'

const stages: Record<string, string> = { new: 'New enquiry', engaged: 'In conversation', qualified: 'Qualified', booking_pending: 'Confirming time', booked: 'Assessment booked', attended: 'Attended', quoted: 'Quoted', won: 'Won', lost: 'Lost', invalid: 'Outside scope' }
const jobNames: Record<string, string> = { intake: 'Review enquiry', message: 'Read reply', operator: 'Office action', slots: 'Check availability', book: 'Confirm appointment', cancel: 'Cancel appointment', sms: 'Send message', followup: 'Follow up', reminder: 'Appointment reminder', crm: 'Update CRM', outcome: 'Record outcome' }
const label = (value: string) => stages[value] ?? value.replaceAll('_', ' ')
const displayTime = (value: string | undefined | null, timezone = 'Australia/Sydney') => value ? new Intl.DateTimeFormat('en-AU', { timeZone: timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—'

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`compass-panel p-5 ${className}`}>{children}</section>
}
function Badge({ children, attention = false }: { children: ReactNode; attention?: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${attention ? 'bg-orange-50 text-orange-800' : 'bg-slate-100 text-slate-700'}`}>{children}</span>
}

/** Operator-only delivery desk. The route owns authentication; all mutations go through its API. */
export function DeliveryDesk() {
  const [data, setData] = useState<DeliverySnapshot | null>(null)
  const [accountId, setAccountId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scenario, setScenario] = useState('conversation')
  const [reply, setReply] = useState('')
  const [officeMessage, setOfficeMessage] = useState('')
  const [outcome, setOutcome] = useState('attended')
  const [evidence, setEvidence] = useState('')
  const [value, setValue] = useState('')
  const [crmReference, setCrmReference] = useState('')
  const [crmEvidence, setCrmEvidence] = useState('')
  const version = useRef(0)

  const refresh = useCallback(async (id: string) => {
    const current = ++version.current
    setLoading(true)
    try {
      const response = await fetch(`/api/delivery-engine${id ? `?account=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load delivery')
      if (current !== version.current) return
      setData(result); setError('')
      if (!id && result.accounts.length) setAccountId(result.accounts[0].id)
    } catch (failure) { if (current === version.current) setError(failure instanceof Error ? failure.message : 'Could not load delivery') }
    finally { if (current === version.current) setLoading(false) }
  }, [])

  useEffect(() => { void refresh(accountId); return () => { version.current++ } }, [accountId, refresh])
  const account: DeliveryAccount | undefined = data?.accounts.find(a => a.id === accountId)
  const enquiries = data?.enquiries.filter(e => e.account_id === accountId) ?? []
  const selected: Enquiry | undefined = enquiries.find(e => e.id === selectedId) ?? enquiries[0]
  const demo = account?.mode === 'demo'
  const timezone = account?.config.timezone ?? 'Australia/Sydney'
  const messages = data?.messages.filter(m => m.enquiry_id === selected?.id) ?? []
  const jobs = data?.jobs.filter(j => j.enquiry_id === selected?.id && ['pending','leased','dispatching','failed','uncertain'].includes(j.status)) ?? []
  const events = data?.events.filter(e => e.enquiry_id === selected?.id) ?? []
  const crmPending = selected?.state.crm?.status === 'manual_pending'

  async function command(payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setNotice(''); version.current++
    try {
      const response = await fetch('/api/delivery-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Action failed')
      setData(result.snapshot); setAccountId(result.accountId)
      if (result.selectedEnquiry) setSelectedId(result.selectedEnquiry)
      setNotice(result.result?.failed ? 'The action needs office attention. Check the handoff and pending actions below.' : success)
      return true
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Action failed'); return false }
    finally { setBusy(false); setLoading(false) }
  }
  const sendReply = async (body: string) => {
    if (selected && await command({ type: 'demo.reply', accountId, enquiryId: selected.id, key: crypto.randomUUID(), body }, 'Demo reply processed.')) setReply('')
  }
  const operator = (action: string, extra: Record<string, unknown> = {}) => selected && command({ type: 'operator', action, accountId, enquiryId: selected.id, key: crypto.randomUUID(), ...extra }, demo ? 'Office action processed.' : 'Office action saved for processing.')
  const submitOutcome = async (event: FormEvent) => {
    event.preventDefault()
    if (selected && await command({ type: 'outcome', accountId, enquiryId: selected.id, key: crypto.randomUUID(), stage: outcome, evidence,
      occurredAt: demo ? account!.demo_now ?? new Date().toISOString() : new Date().toISOString(), ...(value ? { value: Number(value) } : {}) }, 'Outcome recorded with your evidence.')) { setEvidence(''); setValue('') }
  }

  return <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Client delivery</h1><p className="mt-1 text-sm text-slate-600">Installation enquiries, conversations and assessment outcomes.</p></div>
      <button type="button" className="compass-btn-secondary gap-2" disabled={busy || loading} onClick={() => void refresh(accountId)}><RefreshCw size={16} aria-hidden="true"/>Refresh</button>
    </header>

    {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
    <p role="status" aria-live="polite" className={notice ? 'text-sm text-slate-700' : 'sr-only'}>{notice || (loading ? 'Loading delivery workspace' : '')}</p>

    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-900">Try the delivery loop</h2><Badge>Demo</Badge></div><p className="mt-1 max-w-2xl text-sm text-slate-600">Fictional enquiries, simulated SMS, calendar and CRM. No messages or appointments leave Compass.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="demo-scenario" className="mb-1 block text-xs font-medium text-slate-600">Starting enquiry</label><select id="demo-scenario" className="compass-input" value={scenario} onChange={e => setScenario(e.target.value)} disabled={busy}>
            <option value="conversation">Needs qualification</option><option value="qualified">Ready to choose a time</option><option value="outside_area">Outside the service area</option><option value="no_permission">No SMS permission</option>
          </select></div>
          <button type="button" className="compass-btn-primary gap-2" disabled={busy} onClick={() => void command({ type: 'demo.start', key: crypto.randomUUID(), scenario }, 'Demo enquiry created.')}><ArrowRight size={16} aria-hidden="true"/>Create demo enquiry</button>
        </div>
      </div>
    </Panel>

    {account && <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3"><label htmlFor="delivery-account" className="text-sm font-medium text-slate-700">Client</label><select id="delivery-account" value={accountId} className="compass-input !w-auto max-w-full sm:max-w-xs" disabled={busy} onChange={e => { setSelectedId(''); setAccountId(e.target.value) }}>
          {data?.accounts.map(a => <option key={a.id} value={a.id}>{a.config.businessName} · {a.mode === 'demo' ? 'Demo' : 'Live account'}</option>)}
        </select><Badge attention={!account.enabled}>{demo ? 'Simulation' : account.enabled ? 'Live account' : 'Paused'}</Badge></div>
        {demo && <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600"><span>Demo time: {displayTime(account.demo_now, timezone)}</span>
          <button type="button" className="compass-btn-secondary gap-2" disabled={busy} onClick={() => void command({ type: 'demo.advance', accountId, hours: 24, key: crypto.randomUUID() }, 'Demo clock advanced by one day. Due actions processed.')}><Clock3 size={15} aria-hidden="true"/>Advance 1 day</button>
          <button type="button" className="compass-btn-secondary" disabled={busy} onClick={() => void command({ type: 'run', accountId }, 'Due demo actions processed.')}>Run due actions</button>
        </div>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Recorded funnel outcomes">
        {(['contacted','qualified','booked','attended','quoted','won'] as const).map(key => <Panel key={key} className="!p-4"><p className="text-xs font-medium text-slate-600">{{ contacted: 'Replied', qualified: 'Qualified', booked: 'Booked', attended: 'Attended', quoted: 'Quoted', won: 'Won' }[key]}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{data?.metrics[key] ?? 0}</p></Panel>)}
      </div>
      <p className="text-xs text-slate-500">Counts reflect recorded milestones for this account. A past booking is not evidence of attendance or revenue.</p>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Panel className="!p-3">
          <div className="px-2 pb-3 pt-1"><h2 className="font-semibold text-slate-900">Enquiries <span className="font-normal text-slate-500">{data?.metrics.total ?? 0}</span></h2><p className="mt-1 text-xs text-slate-600">{data?.metrics.needsHuman ?? 0} need the office · {data?.metrics.optedOut ?? 0} opted out</p></div>
          <ul className="max-h-[660px] space-y-1 overflow-y-auto">{enquiries.map(enquiry => <li key={enquiry.id}><button type="button" aria-pressed={selected?.id === enquiry.id} disabled={busy} onClick={() => { setSelectedId(enquiry.id); setReply(''); setEvidence(''); setOfficeMessage('') }} className={`w-full rounded-xl p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${selected?.id === enquiry.id ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : 'hover:bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-slate-900">{enquiry.name}</span>{enquiry.control === 'human' && <UserRound size={14} aria-label="Office handling"/>}</div>
            <p className="mt-1 text-xs text-slate-600">{label(enquiry.state.stage)}</p><p className="mt-1 truncate text-xs text-slate-500">{enquiry.state.facts.suburb ?? 'Suburb to confirm'} · {displayTime(enquiry.created_at, timezone)}</p>
          </button></li>)}</ul>
          {!enquiries.length && <p className="p-3 text-sm text-slate-500">No enquiries in this account yet.</p>}
        </Panel>

        {selected ? <>
          <div className="min-w-0 space-y-6">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">{selected.phone}</p></div><Badge attention={selected.control !== 'active'}>{selected.control === 'stopped' ? 'SMS opted out' : selected.control === 'human' ? 'Office handling' : 'Guided follow-up'}</Badge></div>
              <ol className="mt-5 max-h-[520px] space-y-4 overflow-y-auto pr-1" aria-label="Conversation">
                {messages.map(message => <li key={message.id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[90%] rounded-2xl p-3 ${message.direction === 'outbound' ? 'bg-slate-100' : 'border border-slate-200 bg-white'}`}><p className="mb-1 text-xs font-medium text-slate-600">{message.direction === 'outbound' ? account.config.businessName : selected.name}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{message.body || 'Attachment-only reply — office review required'}</p><p className="mt-2 text-[11px] text-slate-500">{displayTime(message.occurred_at, timezone)} · {message.status}{demo ? ' · simulated' : ''}</p></div></li>)}
              </ol>
              {!messages.length && <p className="py-8 text-center text-sm text-slate-500">No messages recorded.</p>}
              {demo && <form className="mt-5 border-t border-slate-100 pt-4" onSubmit={e => { e.preventDefault(); void sendReply(reply) }}>
                <label htmlFor="demo-reply" className="mb-2 block text-sm font-medium text-slate-700">Homeowner reply <span className="font-normal text-slate-500">· demo</span></label>
                <textarea id="demo-reply" className="compass-input min-h-20 w-full" value={reply} maxLength={1600} onChange={e => setReply(e.target.value)} placeholder="Answer the latest question, ask for a callback, or reply STOP." disabled={busy}/>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{selected.state.offeredSlots.map((slot, index) => <button type="button" key={slot.start} className="compass-btn-secondary text-xs" disabled={busy} onClick={() => void sendReply(String(index + 1))}>Choose {index + 1}</button>)}</div><button type="submit" className="compass-btn-primary gap-2" disabled={busy || !reply.trim()}><MessageSquare size={15} aria-hidden="true"/>Send demo reply</button></div>
              </form>}
            </Panel>

            <Panel>
              <h2 className="font-semibold text-slate-900">Office handoff</h2>
              {selected.state.handoff ? <div className="mt-3 space-y-1 text-sm text-slate-700"><p>{selected.state.handoff.reason}</p><p className="text-xs text-slate-500">Owner: {selected.state.handoff.owner} · Due {displayTime(selected.state.handoff.dueAt, timezone)}{selected.state.handoff.resolvedAt ? ' · Resolved' : ''}</p></div> : <p className="mt-2 text-sm text-slate-500">The office can take over at any point. Unrecognised replies are handed over automatically.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="compass-btn-secondary" disabled={busy || selected.control === 'stopped'} onClick={() => void operator('takeover')}>Take over</button>
                <button type="button" className="compass-btn-secondary" disabled={busy || !selected.state.handoff || !!selected.state.handoff.resolvedAt} onClick={() => void operator('resolve')}>Mark handled</button>
                <button type="button" className="compass-btn-secondary" disabled={busy || selected.control !== 'human' || !selected.consent.sms} onClick={() => void operator('resume')}>Resume follow-up</button>
              </div>
              <form className="mt-4" onSubmit={async e => { e.preventDefault(); if (await operator('send', { body: `${account.config.businessName}: ${officeMessage} Reply STOP to opt out.` })) setOfficeMessage('') }}>
                <label htmlFor="office-message" className="mb-2 block text-sm font-medium text-slate-700">Office message{demo ? ' · simulated' : ''}</label><textarea id="office-message" className="compass-input min-h-20 w-full" maxLength={800} value={officeMessage} onChange={e => setOfficeMessage(e.target.value)} disabled={busy || selected.control === 'stopped' || !selected.consent.sms}/>
                <button type="submit" className="compass-btn-secondary mt-3" disabled={busy || !officeMessage.trim() || selected.control === 'stopped' || !selected.consent.sms}>{demo ? 'Send simulated office message' : 'Queue office SMS'}</button>
              </form>
            </Panel>

            <Panel>
              <h2 className="font-semibold text-slate-900">Record an observed outcome</h2><p className="mt-1 text-xs text-slate-500">Use office confirmation or the client’s CRM. Recorded at {demo ? 'the demo clock time' : 'the current time'}.</p>
              <form className="mt-4 space-y-3" onSubmit={submitOutcome}>
                <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="delivery-outcome" className="mb-1 block text-xs font-medium text-slate-600">Outcome</label><select id="delivery-outcome" className="compass-input w-full" value={outcome} onChange={e => setOutcome(e.target.value)} disabled={busy}><option value="attended">Assessment attended</option><option value="quoted">Quote issued</option><option value="won">Job won</option><option value="lost">Opportunity lost</option></select></div>
                  <div><label htmlFor="delivery-value" className="mb-1 block text-xs font-medium text-slate-600">Job value, AUD (optional)</label><input id="delivery-value" type="number" min="0" max="100000000" step="0.01" className="compass-input w-full" value={value} onChange={e => setValue(e.target.value)} disabled={busy}/></div></div>
                <div><label htmlFor="outcome-evidence" className="mb-1 block text-xs font-medium text-slate-600">Evidence or CRM reference</label><input id="outcome-evidence" className="compass-input w-full" required minLength={3} maxLength={1000} value={evidence} onChange={e => setEvidence(e.target.value)} disabled={busy}/></div>
                <button type="submit" className="compass-btn-secondary" disabled={busy || evidence.trim().length < 3}>Record outcome</button>
              </form>
            </Panel>
          </div>

          <div className="space-y-6 lg:col-start-2 xl:col-start-auto">
            <Panel><h2 className="font-semibold text-slate-900">Assessment</h2><p className="mt-3 text-sm text-slate-800">{selected.state.appointment?.status === 'confirmed' ? selected.state.appointment.slot.label : selected.state.appointment?.status === 'cancelled' ? 'Appointment cancelled' : 'No confirmed appointment'}</p>{demo && <p className="mt-2 text-xs text-slate-500">Simulated calendar</p>}
              <dl className="mt-5 space-y-3 text-sm">{[['Service', selected.state.facts.service === 'ducted_replacement' ? 'Ducted replacement' : selected.state.facts.service], ['Suburb', selected.state.facts.suburb], ['Authority', selected.state.facts.homeowner === undefined ? undefined : selected.state.facts.homeowner ? 'Confirmed' : 'Needs review'], ['Timeframe', selected.state.facts.timeframe], ['Address', selected.state.facts.address]].map(([name, answer]) => <div key={name}><dt className="text-xs text-slate-500">{name}</dt><dd className="mt-0.5 break-words text-slate-800">{answer ?? 'To confirm'}</dd></div>)}</dl>
            </Panel>
            <Panel><h2 className="font-semibold text-slate-900">Pending actions</h2><ul className="mt-3 space-y-3">{jobs.slice(0, 12).map(job => <li key={job.id} className="text-sm"><p className="text-slate-800">{jobNames[job.kind] ?? job.kind}</p><p className="mt-0.5 text-xs text-slate-500">{displayTime(job.due_at, timezone)} · {job.status}</p>{job.error && <p className="mt-1 break-words text-xs text-red-700">{job.error.replaceAll('_', ' ')}</p>}</li>)}</ul>{!jobs.length && <p className="mt-3 text-sm text-slate-500">No pending actions.</p>}</Panel>
            <Panel><h2 className="font-semibold text-slate-900">CRM record</h2>{demo ? <p className="mt-3 text-sm text-slate-600">{data?.crm.some(c => c.enquiry_id === selected.id) ? 'Demo opportunity saved with the booking and recorded outcomes.' : 'A demo opportunity will be saved after booking.'}</p> : <><Badge attention={!!crmPending}>{crmPending ? 'Office update required' : 'Manual reconciliation'}</Badge><p className="mt-3 text-xs text-slate-500">Update the client’s CRM, then record its reference here.</p><form className="mt-3 space-y-3" onSubmit={async e => { e.preventDefault(); if (await operator('crm_reconciled', { recordId: crmReference, evidence: crmEvidence })) { setCrmReference(''); setCrmEvidence('') } }}><label className="block text-xs text-slate-600" htmlFor="crm-reference">CRM record reference</label><input id="crm-reference" className="compass-input w-full" value={crmReference} onChange={e => setCrmReference(e.target.value)} required maxLength={200}/><label className="block text-xs text-slate-600" htmlFor="crm-evidence">What was reconciled?</label><input id="crm-evidence" className="compass-input w-full" value={crmEvidence} onChange={e => setCrmEvidence(e.target.value)} required maxLength={1000}/><button type="submit" disabled={busy || !crmReference.trim() || !crmEvidence.trim()} className="compass-btn-secondary">Record CRM update</button></form></>}
            </Panel>
            <Panel><h2 className="font-semibold text-slate-900">Acquisition source</h2><p className="mt-3 text-sm text-slate-700">{label(selected.attribution.source || 'unknown')}</p><p className="mt-1 break-words text-xs text-slate-500">{selected.attribution.campaign || 'Campaign not supplied'}</p><p className="mt-1 text-xs text-slate-500">Click identifier: {selected.attribution.gclid || selected.attribution.gbraid || selected.attribution.wbraid ? 'Captured' : 'Not supplied'}</p></Panel>
          </div>
        </> : <Panel><p className="text-sm text-slate-500">Create or select an enquiry to see its conversation.</p></Panel>}
      </div>
      {!!data?.unassigned.length && <Panel><h2 className="font-semibold text-slate-900">Replies needing an enquiry</h2><p className="mt-1 text-sm text-slate-500">Replies with no unique matching enquiry stay here for office review.</p><ul className="mt-4 space-y-3">{data.unassigned.map(message => <li key={message.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-800">{message.body || 'Attachment-only reply'}</p><p className="mt-1 text-xs text-slate-500">{displayTime(message.occurred_at, timezone)}</p><button type="button" className="compass-btn-secondary mt-2" disabled={busy || !selected} onClick={() => selected && void command({ type: 'assign', accountId, enquiryId: selected.id, messageId: message.id }, 'Reply assigned. The phone number must match.')}>Assign to selected enquiry</button></li>)}</ul></Panel>}
      {!!events.length && <Panel><details><summary className="cursor-pointer font-semibold text-slate-900">Activity history <span className="text-sm font-normal text-slate-500">{events.length} recorded events</span></summary><ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{events.slice().reverse().map(event => <li key={event.id} className="text-xs"><p className="font-medium text-slate-700">{event.type.replaceAll('.', ' · ').replaceAll('_', ' ')}</p><p className="mt-1 text-slate-500">{displayTime(event.occurred_at, timezone)}</p>{typeof event.payload.evidence === 'string' && <p className="mt-1 break-words text-slate-600">{event.payload.evidence}</p>}</li>)}</ol></details></Panel>}
    </>}
  </div>
}
