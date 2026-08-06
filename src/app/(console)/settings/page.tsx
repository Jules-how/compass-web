import { OperatorShell } from '@/components/OperatorShell'
import { AdAccountsSettings } from '@/components/settings/AdAccountsSettings'

function bannerFromSearch(ads: string | undefined, count: string | undefined): string | null {
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
      return null
  }
}

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const ads = typeof params.ads === 'string' ? params.ads : undefined
  const count = typeof params.count === 'string' ? params.count : undefined

  return (
    <OperatorShell title="Settings" subtitle="Workspace preferences and integrations">
      <AdAccountsSettings initialBanner={bannerFromSearch(ads, count)} />
    </OperatorShell>
  )
}
