'use client'
import Link from 'next/link'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { CampaignPlanner } from '@/components/campaigns/CampaignPlanner'
import { FolioState } from '@/components/folio/FolioPrimitives'
import { useCachedJson } from '@/lib/use-cached-json'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import type { CompassCampaign } from '@/lib/campaigns'

export function FolioCalendar() {
  const query = useCachedJson<{ campaigns: CompassCampaign[] }>(
    CAMPAIGNS_QUERY_KEY,
    '/api/campaigns',
    { staleMs: 30_000 },
  )
  const dated = (query.data?.campaigns ?? [])
    .filter((c) => c.go_live_at || c.start_date)
    .toSorted((a, b) =>
      (a.go_live_at || a.start_date || '').localeCompare(
        b.go_live_at || b.start_date || '',
      ),
    )
  return (
    <main className="folio-calendar">
      <div className="folio-calendar-desktop">
        <CampaignPlanner initialView="calendar" />
      </div>
      <div className="folio-calendar-agenda folio-page">
        <header className="folio-page-heading">
          <div>
            <h1>Calendar</h1>
            <p>Campaign dates, in order. All-day plans, not appointments.</p>
          </div>
          <CalendarDays size={22} />
        </header>
        {query.error && !query.data ? (
          <FolioState
            title="Calendar couldn’t load."
            retry={() => void query.reload(true)}
          >
            Try again to retrieve the campaign schedule.
          </FolioState>
        ) : !query.data ? (
          <FolioState loading title="Loading the plan." />
        ) : (
          <>
            <div className="folio-folders">
              <span className="folio-folder-label">Campaign agenda</span>
            </div>
            <section className="folio-paper">
              {dated.length ? (
                <ul className="folio-work-list">
                  {dated.map((c) => (
                    <li className="folio-agenda-item" key={c.id}>
                      <time dateTime={c.go_live_at || c.start_date || ''}>
                        {new Date(
                          c.go_live_at || `${c.start_date}T12:00:00`,
                        ).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'Australia/Sydney',
                        })}
                      </time>
                      <Link
                        href={`/sales/outbound/editor/${encodeURIComponent(c.id)}`}
                      >
                        <strong>{c.name}</strong>
                        <span>
                          {c.copy_status ?? 'Draft'} ·{' '}
                          {c.priority ?? 'No priority'}
                        </span>
                      </Link>
                      <ArrowRight size={15} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="folio-quiet">
                  <p>No campaign dates are set.</p>
                  <Link className="compass-btn-primary" href="/sales/outbound">
                    Plan a campaign <ArrowRight size={15} />
                  </Link>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
