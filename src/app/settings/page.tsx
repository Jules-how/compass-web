import { OperatorShell } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireOperatorPageAccess()

  return (
    <OperatorShell
      active="settings"
      role="owner"
      title="Settings"
      subtitle="Workspace preferences · coming next"
    >
      <div className="compass-panel p-6 text-sm text-neutral-600">
        Settings will cover operator preferences and workspace configuration.
      </div>
    </OperatorShell>
  )
}
