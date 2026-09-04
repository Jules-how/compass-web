import { OperatorShell } from '@/components/OperatorShell'

/**
 * Retention is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so sidebar switches keep the board mounted.
 */
export default function CsDeptPage() {
  return <OperatorShell width="6xl">{null}</OperatorShell>
}
