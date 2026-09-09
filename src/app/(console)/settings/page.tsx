import { OperatorShell } from '@/components/OperatorShell'
import { AdAccountsSettings } from '@/components/settings/AdAccountsSettings'
import { QboSettings } from '@/components/settings/QboSettings'

function bannerFromSearch(
  ads: string | undefined,
  count: string | undefined,
  calendar: string | undefined,
  qbo: string | undefined,
): string | null {
  switch (ads) {
    case 'meta_connected':
      return `Meta connected${count ? ` — ${count} account(s) saved` : ''}. Sync each account to refresh Home.`
    case 'meta_denied':
      return 'Meta OAuth was cancelled.'
    case 'meta_state_mismatch':
      return 'Meta OAuth state mismatch — try Connect with Facebook again.'
    case 'meta_oauth_not_configured':
      return 'Set META_APP_ID and META_APP_SECRET to use Facebook OAuth, or paste a token below.'
    case 'meta_connect_failed':
      return 'Meta OAuth failed. Check app credentials and try again, or paste a token.'
    default:
      break
  }
  switch (calendar) {
    case 'connected':
      return 'Google Calendar connected. Campaign go-lives now appear as all-day items (not time blocks).'
    case 'denied':
      return 'Google Calendar access was cancelled.'
    case 'state_mismatch':
      return 'Google Calendar OAuth state mismatch — try Connect again.'
    case 'connect_failed':
      return 'Google Calendar connect failed. Check GOOGLE_CALENDAR_CLIENT_ID / SECRET and try again.'
    default:
      break
  }
  switch (qbo) {
    case 'connected':
      return 'QuickBooks connected. Invoices and spend now read from the AU company file.'
    case 'denied':
      return 'QuickBooks access was cancelled.'
    case 'state_mismatch':
      return 'QuickBooks OAuth state mismatch. Try Connect again.'
    case 'connect_failed':
      return 'QuickBooks connect failed. Check QBO_CLIENT_ID, SECRET, REDIRECT_URI, and QBO_ENV.'
    default:
      return null
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const ads = typeof params.ads === 'string' ? params.ads : undefined
  const count = typeof params.count === 'string' ? params.count : undefined
  const calendar =
    typeof params.calendar === 'string' ? params.calendar : undefined
  const qbo = typeof params.qbo === 'string' ? params.qbo : undefined

  return (
    <OperatorShell
      title="Settings"
      subtitle="The services connected to your workspace."
    >
      <div className="folio-settings">
        <nav className="folio-settings-index" aria-label="Settings sections">
          <p className="folio-caption">Connections</p>
          <a href="#settings-billing">QuickBooks</a>
          <a href="#settings-outbound">Instantly</a>
          <a href="#settings-calendar">Google Calendar</a>
          <a href="#settings-ads">Ad accounts</a>
          <a href="#settings-connected">Connected accounts</a>
        </nav>
        <div className="folio-settings-content space-y-6">
          <QboSettings
            initialBanner={bannerFromSearch(
              undefined,
              undefined,
              undefined,
              qbo,
            )}
          />
          <AdAccountsSettings
            initialBanner={bannerFromSearch(ads, count, calendar, undefined)}
          />
        </div>
      </div>
    </OperatorShell>
  )
}
