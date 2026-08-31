import { InstallKanban } from '@/components/delivery-dept/InstallKanban'
import { OperatorShell } from '@/components/OperatorShell'

export default function InstallsPage() {
  return (
    <OperatorShell
      title="Installs"
      subtitle="Signed client to live number. Ten concurrent. Under two hours of your time each."
      width="full"
    >
      <InstallKanban />
    </OperatorShell>
  )
}
