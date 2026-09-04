import { OperatorShell } from '@/components/OperatorShell'

/**
 * Clients list is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so sidebar switches keep the panel mounted.
 */
export default function ClientsPage() {
  return <OperatorShell width="6xl">{null}</OperatorShell>
}
