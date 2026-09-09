'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import type { CompassCampaign } from '@/lib/campaigns'
import type {
  Bundle,
  Candidate,
  Evidence,
  Recipe,
  Settings
} from '@/lib/outbound-preparation'

type State = {
  config: null | { recipe: Recipe; settings: Settings; revision: number }
  runs: Array<{
    id: string
    status: string
    candidates: Candidate[]
    error: string | null
    created_at: string
  }>
  preparations: Array<{ id: string; run_id: string; bundle: Bundle }>
  approvals: Array<{
    preparation_id: string
    hash: string
    approved_at: string
  }>
  loads: Array<{
    preparation_id: string
    status: string
    instantly_campaign_id: string
    receipts: Array<{ email: string; status: string }>
    snapshot?: { extras?: string[] }
  }>
}
const button =
  'rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600'
const input =
  'w-full rounded-xl border border-stone-300 bg-white px-2 py-1.5 text-sm text-neutral-900'
const labels: Record<string, string> = {
  service: 'Ducted installation service',
  service_area: 'Sydney service area',
  residential: 'Residential work',
  quote_journey: 'Quote or enquiry path',
  independent: 'Independent ownership',
  email: 'Published work email',
  person_name: 'Recipient name (optional)'
}
const reasonLabel = (reason: string) =>
  reason.replaceAll('_', ' ').replaceAll(':', ': ')
function emailText(body: string) {
  return body
    .replace(/<a\b[^>]*>\s*Unsubscribe\s*<\/a>/gi, 'Unsubscribe')
    .replace(/<br\s*\/?\s*>/gi, '\n')
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CampaignPreparationPanel({
  campaign
}: {
  campaign: CompassCampaign
}) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [selected, setSelected] = useState('')
  const [selectedRun, setSelectedRun] = useState('')
  const [recipe, setRecipe] = useState<Recipe>({ subject: '', opener: '' })
  const [settings, setSettings] = useState<Settings>({
    timezone: 'Australia/Sydney',
    email_list: [],
    from: '09:00',
    to: '17:00',
    daily_limit: 20
  })
  const [senders, setSenders] = useState('')
  const [leadIds, setLeadIds] = useState('')
  const [revision, setRevision] = useState(0)
  const uid = useId()
  const endpoint =
    '/api/operator/outbound/preparation/' + encodeURIComponent(campaign.id)
  const refresh = useCallback(async () => {
    const res = await fetch(endpoint, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not read preparation')
    setState(data)
  }, [endpoint])
  useEffect(() => {
    setState(null)
    setReviewed(false)
    setSelected('')
    setSelectedRun('')
    void refresh().catch((e) => setError(e.message))
  }, [refresh, campaign.updated_at])
  useEffect(() => {
    if (state?.config) {
      setRecipe(state.config.recipe)
      setSettings(state.config.settings)
      setSenders(state.config.settings.email_list.join('\n'))
      setRevision(state.config.revision)
    }
  }, [state?.config])
  const run = state?.runs.find((r) => r.id === selectedRun) ?? state?.runs[0]
  const prep = state?.preparations.find((p) => p.run_id === run?.id)
  const approved = state?.approvals.find(
    (a) => a.preparation_id === prep?.id && a.hash === prep.bundle.hash
  )
  const load = state?.loads.find((l) => l.preparation_id === prep?.id)
  const current = run?.status === 'ready'
  useEffect(() => {
    setReviewed(false)
  }, [prep?.id, run?.status])
  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      if (body.action === 'export')
        download(
          data.csv,
          'outbound-' + data.hash.slice(0, 12) + '.csv',
          'text/csv;charset=utf-8'
        )
      if (body.action === 'approve')
        setNote('This exact batch is approved for a paused import.')
      if (body.action === 'reserve')
        setNote(
          'Paused campaign checked. Recipients reserved; the reviewed CSV is ready.'
        )
      if (body.action === 'reconcile')
        setNote(
          data.complete
            ? 'Every recipient and merge value matches. The campaign is paused.'
            : 'Import is incomplete. Review the receipt below before proceeding.'
        )
      if (
        ['create', 'revise', 'import_inventory'].includes(String(body.action))
      ) {
        setSelectedRun(data.id)
        setSelected('')
        setNote(
          'Source records retained. Waiting for the local preparation worker.'
        )
      }
      await refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  const candidates = run?.candidates ?? []
  const chosen = candidates.find((c) => c.id === selected)
  return (
    <section aria-labelledby={uid + '-title'} className="space-y-4">
      <div>
        <h3
          id={uid + '-title'}
          className="text-sm font-semibold text-neutral-900"
        >
          Prepare campaign
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          Keep every candidate, review the completed emails, then load the
          approved batch into a paused Instantly campaign.
        </p>
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-red-700">
          {reasonLabel(error)}
        </p>
      )}
      {note && (
        <p role="status" className="text-xs text-neutral-700">
          {note}
        </p>
      )}
      <details
        className="rounded-xl border border-stone-200 p-3"
        open={!state?.config}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Opener and send settings
        </summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void act({
              action: 'configure',
              recipe,
              settings: {
                ...settings,
                email_list: senders
                  .split(/[\n,]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              },
              revision
            })
          }}
        >
          <p className="text-xs text-neutral-600">
            Use {'{company}'}, {'{service}'} and {'{service_area}'} from the
            quoted evidence. Start the opener with “Saw”. Edit the email bodies
            in this campaign’s Copy section. Saving changes requires a fresh
            preparation and review.
          </p>
          <label className="block text-xs">
            Subject recipe
            <input
              required
              className={input}
              value={recipe.subject}
              onChange={(e) =>
                setRecipe({ ...recipe, subject: e.target.value })
              }
            />
          </label>
          <label className="block text-xs">
            Opener recipe
            <textarea
              required
              rows={3}
              className={input}
              value={recipe.opener}
              onChange={(e) => setRecipe({ ...recipe, opener: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            Existing sender email addresses
            <textarea
              required
              rows={2}
              className={input}
              value={senders}
              onChange={(e) => setSenders(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              From
              <input
                type="time"
                required
                className={input}
                value={settings.from}
                onChange={(e) =>
                  setSettings({ ...settings, from: e.target.value })
                }
              />
            </label>
            <label className="text-xs">
              Until
              <input
                type="time"
                required
                className={input}
                value={settings.to}
                onChange={(e) =>
                  setSettings({ ...settings, to: e.target.value })
                }
              />
            </label>
            <label className="text-xs">
              Daily limit
              <input
                type="number"
                required
                min={1}
                max={10000}
                className={input}
                value={settings.daily_limit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    daily_limit: Number(e.target.value)
                  })
                }
              />
            </label>
          </div>
          <p className="text-xs text-neutral-500">
            Sydney time · weekdays · tracking off · stop on reply · unsubscribe
            header and link.
          </p>
          <button disabled={busy || !state} className={button}>
            Save settings
          </button>
        </form>
      </details>
      <details className="rounded-xl border border-stone-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Bring in existing candidates
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-neutral-600">
            Retain up to 200 ledger records, including those without email.
            Leave the selection empty to use this campaign’s attached inventory.
          </p>
          <label className="block text-xs">
            Selected Compass lead IDs (optional)
            <textarea
              rows={2}
              className={input}
              value={leadIds}
              onChange={(e) => setLeadIds(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !state?.config}
            className={button}
            onClick={() =>
              void act({
                action: 'import_inventory',
                ...(leadIds.trim()
                  ? { lead_ids: leadIds.split(/[\s,]+/).filter(Boolean) }
                  : {})
              })
            }
          >
            Retain and prepare candidates
          </button>
        </div>
      </details>
      {state && state.runs.length > 1 && (
        <label className="block text-xs">
          Recent preparation runs
          <select
            className={input}
            value={run?.id ?? ''}
            onChange={(e) => {
              setSelectedRun(e.target.value)
              setSelected('')
              setNote('')
            }}
          >
            {state.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} · {r.candidates.length} candidates · {reasonLabel(r.status)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          {run
            ? `${candidates.length} retained · ${reasonLabel(run.status)}`
            : state ? 'No preparation yet.' : 'Loading preparation…'}
        </p>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          Refresh
        </button>
      </div>
      {run?.error && (
        <p role="alert" className="text-xs text-red-700">
          {run.error}
        </p>
      )}
      {run?.status === 'stale' && (
        <p className="text-xs text-amber-800">
          Campaign inputs changed. Retain the candidate set again to prepare the
          current version.
        </p>
      )}
      {!!candidates.length && (
        <label className="block text-xs">
          Candidate evidence
          <select
            className={input}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a candidate</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company || 'Unresolved company'} · {c.email || 'No email'}
              </option>
            ))}
          </select>
        </label>
      )}
      {chosen && run && (
        <EvidenceEditor
          key={chosen.id}
          candidate={chosen}
          busy={busy}
          onSave={(changes) =>
            act({
              action: 'revise',
              run_id: run.id,
              candidate_id: chosen.id,
              changes
            })
          }
        />
      )}
      {prep && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {prep.bundle.counts.pass} ready · {prep.bundle.counts.hold} on hold
            · {prep.bundle.counts.exclude} excluded
          </p>
          <p className="text-xs text-neutral-600">
            {
              prep.bundle.records.filter(
                (r) =>
                  r.status === 'pass' &&
                  !['valid', 'ok'].includes(
                    r.candidate.verification?.status ?? ''
                  )
              ).length
            }{' '}
            ready recipients have a recorded catch-all, uncertain, risky or
            error result. Review those results before approval.
          </p>
          {prep.bundle.records.map((record) => (
            <details
              key={record.candidate.id}
              className="rounded-xl border border-stone-200 p-3"
            >
              <summary className="cursor-pointer text-xs font-medium">
                {record.candidate.company || 'Unresolved company'} ·{' '}
                {record.status === 'pass'
                  ? 'Ready'
                  : record.status === 'hold'
                    ? 'Hold'
                    : 'Excluded'}
              </summary>
              <div className="mt-2 space-y-3 text-xs">
                <p className="break-all text-neutral-600">
                  {record.candidate.email || 'No email'} ·{' '}
                  {record.candidate.verification?.status ||
                    'Verification pending'}
                </p>
                {!!record.reasons.length && (
                  <ul className="list-disc pl-4 text-amber-900">
                    {record.reasons.map((r) => (
                      <li key={r}>{reasonLabel(r)}</li>
                    ))}
                  </ul>
                )}
                {record.rendered?.steps.map((step, i) => (
                  <div key={i}>
                    <p className="font-medium">
                      Email {i + 1} · {step.subject || 'Same subject thread'}
                    </p>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-sans leading-relaxed text-neutral-700">
                      {emailText(step.body)}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          ))}
          <p className="text-xs text-neutral-500">
            Version {prep.bundle.hash.slice(0, 12)} ·{' '}
            {prep.bundle.context.settings.email_list.join(', ')} ·{' '}
            {prep.bundle.context.settings.from}–
            {prep.bundle.context.settings.to} Sydney time ·{' '}
            {prep.bundle.context.settings.daily_limit}/day
          </p>
          {!approved && (
            <>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={!current || busy}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>
                  I reviewed the recipients, evidence, both emails and send
                  settings for this batch.
                </span>
              </label>
              <button
                type="button"
                disabled={
                  busy || !current || !reviewed || !prep.bundle.counts.pass
                }
                className={button}
                onClick={() =>
                  void act({
                    action: 'approve',
                    preparation_id: prep.id,
                    hash: prep.bundle.hash
                  })
                }
              >
                Approve paused import
              </button>
            </>
          )}
          {approved && (
            <div className="space-y-2">
              <p className="text-xs font-medium">
                Approved {new Date(approved.approved_at).toLocaleString()}
              </p>
              <button
                type="button"
                className={button}
                onClick={() =>
                  download(
                    JSON.stringify(prep.bundle, null, 2),
                    'reviewed-batch-' + prep.bundle.hash.slice(0, 12) + '.json',
                    'application/json'
                  )
                }
              >
                Download reviewed batch
              </button>
              <p className="text-xs text-neutral-600">
                Set up the bound Instantly campaign with this reviewed copy and
                schedule. Then check it here before downloading the upload CSV.
              </p>
              <button
                type="button"
                disabled={busy || !current}
                className={button}
                onClick={() =>
                  void act({ action: 'reserve', preparation_id: prep.id })
                }
              >
                Check paused campaign
              </button>
              {load && (
                <div className="space-y-2">
                  <a
                    className="block text-xs underline"
                    href={
                      'https://app.instantly.ai/app/campaign/' +
                      encodeURIComponent(load.instantly_campaign_id) +
                      '/leads'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Instantly import
                  </a>
                  <p className="text-xs text-neutral-600">
                    Upload the CSV in Chrome. Map email, name, company and
                    personalization to their matching fields; other columns to
                    custom variables. Campaign duplicate check on, lists and
                    workspace checks off, import verification off.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !current}
                    className={button}
                    onClick={() =>
                      void act({ action: 'export', preparation_id: prep.id })
                    }
                  >
                    Download approved CSV
                  </button>{' '}
                  <button
                    type="button"
                    disabled={busy || !current}
                    className={button}
                    onClick={() =>
                      void act({ action: 'reconcile', preparation_id: prep.id })
                    }
                  >
                    Check imported recipients
                  </button>
                  <p role="status" className="text-xs">
                    Import: {reasonLabel(load.status)}
                  </p>
                  {load.receipts?.map((r) => (
                    <p key={r.email} className="break-all text-xs">
                      {r.email}: {reasonLabel(r.status)}
                    </p>
                  ))}
                  {load.snapshot?.extras?.map((email) => (
                    <p key={email} className="break-all text-xs text-red-700">
                      Unexpected recipient: {email}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function EvidenceEditor({
  candidate,
  busy,
  onSave
}: {
  candidate: Candidate
  busy: boolean
  onSave: (changes: Record<string, unknown>) => Promise<boolean>
}) {
  const [evidence, setEvidence] = useState<Evidence[]>(candidate.evidence)
  const [identity, setIdentity] = useState(candidate.identity_reviewed)
  const [hold, setHold] = useState(candidate.hold_reason ?? '')
  const [exclude, setExclude] = useState(candidate.exclude_reason ?? '')
  const [basis, setBasis] = useState(
    candidate.contact_basis ?? {
      kind: '',
      rationale: '',
      url: '',
      checked_at: ''
    }
  )
  const [verification, setVerification] = useState(
    candidate.verification ?? {
      status: 'pending',
      provider: '',
      checked_at: ''
    }
  )
  function edit(kind: string, field: string, value: string) {
    setEvidence((old) => {
      const fact = old.find((e) => e.kind === kind) ?? {
        kind,
        value: '',
        quote: '',
        url: '',
        observed_at: ''
      }
      return [
        ...old.filter((e) => e.kind !== kind),
        { ...fact, [field]: value, observed_at: new Date().toISOString() }
      ]
    })
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-stone-200 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({
          evidence: evidence.filter((e) => e.value || e.quote || e.url),
          identity_reviewed: identity,
          hold_reason: hold,
          exclude_reason: exclude,
          contact_basis: basis,
          verification
        })
      }}
    >
      <p className="text-xs text-neutral-600">
        Record exact published quotes and their source. Saving keeps the
        original record and queues a new preparation. Conflicting evidence must
        be resolved explicitly.
      </p>
      {Object.entries(labels).map(([kind, label]) => {
        const facts = evidence.filter((e) => e.kind === kind)
        const fact = facts[0]
        return (
          <details key={kind}>
            <summary className="cursor-pointer text-xs font-medium">
              {label}
              {fact?.value ? ' · recorded' : ''}
            </summary>
            <div className="mt-2 space-y-2">
              {facts.length > 1 && (
                <div role="alert" className="text-xs text-amber-800">
                  Multiple facts are recorded. Editing replaces this kind with
                  your reviewed value.
                  {facts.map((f, i) => (
                    <p key={i}>
                      {f.value}: {f.quote} ({f.url})
                    </p>
                  ))}
                </div>
              )}
              <label className="block text-xs">
                Exact value in quote
                <input
                  className={input}
                  value={fact?.value ?? ''}
                  onChange={(e) => edit(kind, 'value', e.target.value)}
                />
              </label>
              <label className="block text-xs">
                Published quote
                <textarea
                  className={input}
                  rows={2}
                  value={fact?.quote ?? ''}
                  onChange={(e) => edit(kind, 'quote', e.target.value)}
                />
              </label>
              <label className="block text-xs">
                Source URL
                <input
                  type="url"
                  className={input}
                  value={fact?.url ?? ''}
                  onChange={(e) => edit(kind, 'url', e.target.value)}
                />
              </label>
              {fact?.url && /^https?:\/\//i.test(fact.url) && (
                <a
                  className="text-xs underline"
                  href={fact.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open evidence source
                </a>
              )}
            </div>
          </details>
        )
      })}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={identity}
          onChange={(e) => setIdentity(e.target.checked)}
        />
        <span>
          I reviewed this company’s identity, parent/franchise relationships and
          outreach history.
        </span>
      </label>
      <label className="block text-xs">
        Contact basis
        <select
          className={input}
          value={basis.kind}
          onChange={(e) =>
            setBasis({
              ...basis,
              kind: e.target.value,
              checked_at: new Date().toISOString()
            })
          }
        >
          <option value="">Needs review</option>
          <option value="express">Express consent</option>
          <option value="published_role_relevant">
            Published work address, relevant to role
          </option>
          <option value="existing_relationship">Existing relationship</option>
        </select>
      </label>
      <label className="block text-xs">
        Why this contact basis applies
        <textarea
          className={input}
          rows={2}
          value={basis.rationale}
          onChange={(e) =>
            setBasis({
              ...basis,
              rationale: e.target.value,
              checked_at: new Date().toISOString()
            })
          }
        />
      </label>
      <label className="block text-xs">
        Contact basis source URL
        <input
          type="url"
          className={input}
          value={basis.url}
          onChange={(e) =>
            setBasis({
              ...basis,
              url: e.target.value,
              checked_at: new Date().toISOString()
            })
          }
        />
      </label>
      <label className="block text-xs">
        Recorded verification result
        <select
          className={input}
          value={verification.status}
          onChange={(e) =>
            setVerification({ ...verification, status: e.target.value })
          }
        >
          {[
            'pending',
            'valid',
            'ok',
            'catch_all',
            'unknown',
            'risky',
            'error',
            'invalid'
          ].map((s) => (
            <option key={s} value={s}>
              {reasonLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        Verification provider
        <input
          className={input}
          value={verification.provider}
          onChange={(e) =>
            setVerification({ ...verification, provider: e.target.value })
          }
        />
      </label>
      <label className="block text-xs">
        Actual verification time (ISO date and time)
        <input
          className={input}
          placeholder="YYYY-MM-DDTHH:mm:ssZ"
          value={verification.checked_at}
          onChange={(e) =>
            setVerification({ ...verification, checked_at: e.target.value })
          }
        />
      </label>
      <label className="block text-xs">
        Hold reason
        <textarea
          className={input}
          rows={2}
          value={hold}
          onChange={(e) => setHold(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        Exclude reason
        <textarea
          className={input}
          rows={2}
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
        />
      </label>
      <button disabled={busy} className={button}>
        Save research and prepare again
      </button>
    </form>
  )
}
