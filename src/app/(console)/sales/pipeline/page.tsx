import { OperatorShell } from '@/components/OperatorShell'

/**
 * Pipeline calendar is owned by ConsoleHomeInboxKeepAlive so tab switches stay mounted.
 */
export default function PipelinePage() {
  return <OperatorShell flush>{null}</OperatorShell>
}
