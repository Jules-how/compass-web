import { OperatorShell } from '@/components/OperatorShell'

/**
 * Projects list is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so sidebar switches keep the panel mounted.
 */
export default function ProjectsPage() {
  return <OperatorShell width="full" compact>{null}</OperatorShell>
}
