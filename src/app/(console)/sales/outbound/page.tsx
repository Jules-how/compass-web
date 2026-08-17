import { OperatorShell } from '@/components/OperatorShell'

/**
 * Outbound hub is owned by ConsoleHomeInboxKeepAlive so tab switches stay mounted.
 */
export default function OutboundPage() {
  return <OperatorShell width="full">{null}</OperatorShell>
}
