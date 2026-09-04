import { OperatorShell } from '@/components/OperatorShell'

/**
 * Functions list is owned by ConsoleHomeInboxKeepAlive inside the persistent
 * console layout so sidebar switches keep the panel mounted.
 */
export default function FunctionsPage() {
  return <OperatorShell width="full">{null}</OperatorShell>
}
