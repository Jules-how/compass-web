import Link from 'next/link'
import {
  inboundSourceLabel,
  type InboundLeadSource,
  type PortalInboundLead
} from '@/lib/inbound-leads-ui'

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const SOURCE_OPTIONS: { value: '' | InboundLeadSource; label: string }[] = [
  { value: '', label: 'All sources' },
  { value: 'website_ask', label: 'Website' },
  { value: 'fhb_guide', label: 'FHB guide' },
  { value: 'meta_fhb', label: 'Meta FHB' },
  { value: 'meta_bridging', label: 'Meta bridging' },
  { value: 'bridging_guide', label: 'Bridging guide' },
  { value: 'meta_backfill', label: 'Meta (backfill)' }
]

export function InboundLeadTable({
  leads,
  sourceFilter,
  basePath = '/leads'
}: {
  leads: PortalInboundLead[]
  sourceFilter?: string
  basePath?: string
}) {
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm text-neutral-600">
          Source
          <select
            name="source"
            defaultValue={sourceFilter || ''}
            className="mt-1 block rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="compass-btn-primary"
        >
          Filter
        </button>
        {sourceFilter ? (
          <Link href={basePath} className="text-sm text-neutral-500 hover:text-neutral-800">
            Clear
          </Link>
        ) : null}
      </form>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No inbound leads yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-neutral-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {formatWhen(lead.submittedAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">{lead.name}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div>{lead.email || '—'}</div>
                    <div className="text-xs text-neutral-400">{lead.phone || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
                      {inboundSourceLabel(lead.source)}
                    </span>
                  </td>
                  <td className="max-w-sm px-4 py-3 text-neutral-600">{lead.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
