import { OperatorShell } from '@/components/OperatorShell'

/**
 * Outbound calendar is owned by ConsoleHomeInboxKeepAlive so tab switches stay mounted.
 */
export default function OutboundPage() {
  return <OperatorShell flush>{null}</OperatorShell>
}
