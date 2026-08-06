import { OperatorShell } from '@/components/OperatorShell'
import { HomeDashboard } from '@/components/home/HomeDashboard'

export default function HomePage() {
  return (
    <OperatorShell
      title="Home"
      subtitle="Focus for the day · priorities, growth engines, and a place to dump thoughts"
      width="full"
    >
      <HomeDashboard />
    </OperatorShell>
  )
}
