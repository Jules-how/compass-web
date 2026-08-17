import { OperatorShell } from '@/components/OperatorShell'

/**
 * CRM is owned by ConsoleHomeInboxKeepAlive inside the persistent console layout
 * so switching to Overview / Pipeline / Outbound does not remount the shell.
 */
export default function LeadsPage() {
  return <OperatorShell width="full" compact>{null}</OperatorShell>
}
