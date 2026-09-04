import { OperatorShell } from '@/components/OperatorShell'

/**
 * Tasks surface is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so sidebar switches keep the panel mounted.
 */
export default function TasksPage() {
  return <OperatorShell width="full">{null}</OperatorShell>
}
