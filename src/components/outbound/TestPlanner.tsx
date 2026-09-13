'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { ModalFrame } from '@/components/ui/ModalFrame'
import { useCachedJson } from '@/lib/use-cached-json'
import { CAMPAIGNS_QUERY_KEY, createCampaign, updateCampaign, getCampaignDetail, type CampaignPatch } from '@/lib/campaigns-client'
import { dateOnlyInZone, type CompassCampaign } from '@/lib/campaigns'
import { TEST_CHOICES, planDate, planMonday, shiftPlanDay, planDatePatch, planVariable, planVariableLabel, canMovePlan } from '@/lib/test-planner'
import styles from './TestPlanner.module.css'

type Draft = { campaign?: CompassCampaign; date: string }
const friendlyDate = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-AU', { ...options, timeZone: 'UTC' })

export function TestPlanner() {
  const query = useCachedJson<{ campaigns: CompassCampaign[] }>(CAMPAIGNS_QUERY_KEY, '/api/campaigns', { staleMs: 30000 })
  const [week, setWeek] = useState(() => planMonday(dateOnlyInZone(new Date().toISOString())))
  const [filter, setFilter] = useState('open')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const rows = query.data?.campaigns ?? []
  const visible = rows.filter(c => filter === 'all' || (filter === 'tests' ? planVariable(c) !== 'none' : !['archived', 'cancelled', 'completed'].includes(c.status)))
  // Keep weekend campaigns visible without widening a normal working week.
  const weekend = visible.some(c => [shiftPlanDay(week, 5), shiftPlanDay(week, 6)].includes(planDate(c)))
  const days = Array.from({ length: weekend ? 7 : 5 }, (_, i) => shiftPlanDay(week, i))
  const unscheduled = visible.filter(c => !planDate(c))

  async function move(campaign: CompassCampaign, date: string) {
    if (busy || !canMovePlan(campaign) || planDate(campaign) === date) return
    setBusy(true); setError('')
    try {
      const fresh = await getCampaignDetail(campaign.id)
      if (!fresh || fresh.campaign.updated_at !== campaign.updated_at) throw new Error('This campaign changed. Refresh the planner before moving it.')
      await updateCampaign(campaign.id, { ...planDatePatch(campaign, date), expected_updated_at: campaign.updated_at })
      setMessage(`${campaign.name} moved to ${friendlyDate(date, { day: 'numeric', month: 'short' })}.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not move this plan.') }
    finally { setBusy(false) }
  }

  function card(campaign: CompassCampaign) {
    return <button key={campaign.id} type="button" className={styles.card} draggable={!busy && canMovePlan(campaign)} disabled={busy}
      onDragStart={e => { e.dataTransfer.setData('application/x-compass-test-plan', campaign.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={() => { setError(''); setDraft({ campaign, date: planDate(campaign) }) }}>
      <span className={styles.state}>{campaign.status.replaceAll('_', ' ')}</span>
      <strong>{campaign.location_tags?.[0] || campaign.name}</strong>
      <span className={styles.audience}>{campaign.vertical_tags?.join(', ') || 'Audience to choose'}</span>
      <span className={styles.factor}>{planVariableLabel(campaign)}</span>
      <span className={styles.cardFooter}><span>{campaign.sample_size_target ? `${campaign.sample_size_target} target recipients` : 'Sample to choose'}</span><span aria-hidden="true">↗</span></span>
    </button>
  }

  return <section className={styles.planner} aria-label="Campaign test planner" aria-busy={busy}>
    <div className={styles.heading}><div><h1>Test planner</h1><p>Plan your next campaigns and the change each one will test.</p></div><button className="compass-btn-primary" disabled={busy || !query.data} onClick={() => setDraft({ date: week })}>＋ Plan test</button></div>
    <div className={styles.toolbar}><div className={styles.controls}>
      <button aria-label="Previous week" onClick={() => setWeek(shiftPlanDay(week, -7))}>←</button><button aria-label="Next week" onClick={() => setWeek(shiftPlanDay(week, 7))}>→</button>
      <strong>{friendlyDate(week, { day: 'numeric', month: 'short' })} – {friendlyDate(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
      <button onClick={() => setWeek(planMonday(dateOnlyInZone(new Date().toISOString())))}>This week</button>
    </div><div className={styles.controls}><label>Show <select value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open campaigns</option><option value="tests">Tests only</option><option value="all">All campaigns</option></select></label><button disabled={query.refreshing} onClick={() => void query.reload()}>Refresh</button></div></div>
    {(error || query.error) && <p role="alert" className={styles.error}>{error || String(query.error)}</p>}
    {query.loading ? <p role="status">Loading campaigns…</p> : query.data ? <>
      <div className={styles.scroll}><div className={styles.board} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(150px, 1fr))` }}>
        {days.map(date => <section key={date} className={styles.day} aria-label={friendlyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}
          onDragOver={e => { if (!busy && e.dataTransfer.types.includes('application/x-compass-test-plan')) e.preventDefault() }}
          onDrop={e => { e.preventDefault(); const c = rows.find(r => r.id === e.dataTransfer.getData('application/x-compass-test-plan')); if (c) void move(c, date) }}>
          <div className={styles.dayHeading}><span>{friendlyDate(date, { weekday: 'short' })}</span><strong>{date.slice(8)}</strong></div>
          <div className={styles.cards}>{visible.filter(c => planDate(c) === date).map(card)}<button className={styles.add} disabled={busy} onClick={() => setDraft({ date })}>＋ Plan test</button></div>
        </section>)}
      </div></div><p className={styles.helper} role="status">{message || 'Drag to reschedule · Open a card to edit · Dates use Sydney time'}</p>
      {unscheduled.length > 0 && <section className={styles.unscheduled}><h2>Unscheduled <span>{unscheduled.length}</span></h2><div>{unscheduled.map(card)}</div></section>}
      <p className={styles.helper}>Planning dates do not launch campaigns. <Link href="/sales/experiments">Compare test results ↗</Link></p>
    </> : null}
    {draft && <TestPlanEditor draft={draft} campaigns={rows} onClose={() => setDraft(null)} onSaved={campaign => { setDraft(null); setWeek(planMonday(planDate(campaign) || week)); setMessage('Test plan saved. No sending settings changed.') }} />}
  </section>
}

function TestPlanEditor({ draft, campaigns, onClose, onSaved }: { draft: Draft; campaigns: CompassCampaign[]; onClose: () => void; onSaved: (campaign: CompassCampaign) => void }) {
  const original = draft.campaign
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const close = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose() }
  const variable = original ? planVariable(original) : 'subject'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    const date = value('date')
    const choice = TEST_CHOICES.find(c => c[0] === value('variable'))
    const city = value('city'), industry = value('industry')
    const comparison = value('comparison') || null
    const patch: CampaignPatch = {
      name: value('name') || `${industry} · ${city} · ${choice?.[1] || 'Test'}`,
      vertical_tags: [industry, ...(original?.vertical_tags?.slice(1) ?? [])],
      location_tags: [city, ...(original?.location_tags?.slice(1) ?? [])],
      sample_size_target: Number(value('sample')), hypothesis: value('hypothesis') || null,
      testing_variable: value('variable'), experiment_factor: choice?.[2] || original?.experiment_factor || 'none',
      parent_campaign_id: comparison,
      ...(original && comparison !== (original.parent_campaign_id || null) ? { experiment_role: comparison ? 'challenger' : 'solo' } : {}),
      experiment_decision: value('decision') || null,
      ...(date !== draft.date || !original ? planDatePatch(original, date) : {}),
      ...(!original ? { status: 'planned', offer_key: 'installation-booking', experiment_status: value('hypothesis') ? 'queued' : 'none', experiment_role: comparison ? 'challenger' : 'solo' } : {})
    }
    try {
      let saved: CompassCampaign
      if (original) {
        const fresh = await getCampaignDetail(original.id)
        if (!fresh || fresh.campaign.updated_at !== original.updated_at) throw new Error('This campaign changed while you were editing. Keep your notes, close this form and refresh before saving.')
        const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key as keyof CompassCampaign]))) as CampaignPatch
        saved = Object.keys(changed).length ? await updateCampaign(original.id, { ...changed, expected_updated_at: original.updated_at }) : original
      } else { saved = await createCampaign(patch) }
      onSaved(saved)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this test. Your draft is still here.') }
    finally { setBusy(false) }
  }
  return <ModalFrame open onClose={close} label={original ? 'Edit test plan' : 'Plan a test'} overlayClassName={styles.overlay} contentClassName={styles.dialog}>
    <form onSubmit={submit} onChange={() => setDirty(true)}>
      <header className={styles.dialogHeading}><div><p>OUTBOUND / TEST PLAN</p><h2>{original ? 'Edit test plan' : 'Plan a test'}</h2></div><button type="button" aria-label="Close test editor" disabled={busy} onClick={close}>×</button></header>
      <fieldset disabled={busy} className={styles.fields}>
        {original && <label className={styles.full}>Campaign name<input name="name" defaultValue={original.name} required /></label>}
        <label>Industry<input data-autofocus name="industry" required defaultValue={original?.vertical_tags?.[0] || ''} placeholder="AC installers" /></label>
        <label>City<input name="city" required defaultValue={original?.location_tags?.[0] || ''} placeholder="Sydney" /></label>
        <label>Planned start<input name="date" type="date" required defaultValue={draft.date} readOnly={original && !canMovePlan(original)} /></label>
        <label>Target recipients<input name="sample" type="number" min="1" max="20000" required defaultValue={original?.sample_size_target ?? ''} /></label>
        <label className={styles.full}>What changes?<select name="variable" defaultValue={variable}>{!TEST_CHOICES.some(c => c[0] === variable) && <option value={variable}>{variable === 'none' ? 'Choose a variable' : variable}</option>}{TEST_CHOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className={styles.full}>What do you want to learn?<textarea name="hypothesis" rows={3} defaultValue={original?.hypothesis ?? ''} /></label>
        <label className={styles.full}>Comparison campaign<select name="comparison" defaultValue={original?.parent_campaign_id ?? ''}><option value="">Choose later</option>{original?.parent_campaign_id && !campaigns.some(c => c.id === original.parent_campaign_id) && <option value={original.parent_campaign_id}>Existing comparison ({original.parent_campaign_id})</option>}{campaigns.filter(c => c.id !== original?.id && c.parent_campaign_id !== original?.id && (c.offer_key === (original?.offer_key || 'installation-booking') || c.id === original?.parent_campaign_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className={styles.helper}>Choose a baseline with a comparable audience.</span></label>
        {original && <label className={styles.full}>Review and decision notes<textarea name="decision" rows={2} defaultValue={original.experiment_decision ?? ''} /></label>}
      </fieldset>
      {error && <p role="alert" className={styles.formError}>{error}</p>}
      {confirmClose && <div className={styles.discard} role="alert"><span>Discard your unsaved changes?</span><button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard</button></div>}
      <footer className={styles.actions}>{original ? <Link href={`/sales/outbound/editor/${encodeURIComponent(original.id)}`} onClick={e => { if (dirty || busy) { e.preventDefault(); setError('Save or discard your changes before opening the campaign editor.') } }}>Open copy & preparation ↗</Link> : <span>Creates a Compass plan only</span>}<button type="submit" disabled={busy} className="compass-btn-primary">{busy ? 'Saving…' : 'Save plan'}</button></footer>
    </form>
  </ModalFrame>
}
