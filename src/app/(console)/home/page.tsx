import { OperatorShell } from '@/components/OperatorShell'
import { HomeDashboard } from '@/components/home/HomeDashboard'

export default function HomePage() {
  return (
    <OperatorShell width="full">
      <HomeDashboard />
    </OperatorShell>
  )
}
