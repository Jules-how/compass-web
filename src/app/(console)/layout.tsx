import { OperatorConsoleLayout } from '@/components/OperatorShell'
import { requireOperatorPageAccess } from '@/lib/operator-page'

export const dynamic = 'force-dynamic'

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireOperatorPageAccess()

  return <OperatorConsoleLayout role="owner">{children}</OperatorConsoleLayout>
}
