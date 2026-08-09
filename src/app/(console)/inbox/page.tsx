import { OperatorShell } from '@/components/OperatorShell'

/**
 * Inbox surface is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so Home ↔ Inbox switches keep the panel mounted.
 */
export default function InboxPage() {
  return <OperatorShell flush>{null}</OperatorShell>
}
