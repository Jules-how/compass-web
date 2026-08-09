import { OperatorShell } from '@/components/OperatorShell'

/**
 * Home surface is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so Home ↔ Inbox switches keep the dashboard mounted.
 */
export default function HomePage() {
  return <OperatorShell width="full">{null}</OperatorShell>
}
