import { InstallKanban } from '@/components/delivery-dept/InstallKanban'
import { OperatorShell } from '@/components/OperatorShell'

export default function InstallsPage() {
  return (
    <OperatorShell
      title="Installs"
      subtitle="Configure each client system from intake to monitored lead delivery."
      width="full"
    >
      <InstallKanban />
    </OperatorShell>
  )
}
