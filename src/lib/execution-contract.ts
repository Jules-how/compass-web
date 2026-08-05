export function executionReadiness(task: { execution_level?: number | null; execution_mode?: string | null; execution_contract?: string | null }): string {
  const level = task.execution_level ?? 1
  if (level <= 1) return 'light'
  let contract: Record<string, unknown> = {}
  try { contract = task.execution_contract ? JSON.parse(task.execution_contract) : {} } catch {}
  const items = (key: string) => Array.isArray(contract[key]) && contract[key].some((item) => typeof item === 'string' && item.trim())
  const objective = typeof contract.objective === 'string' && contract.objective.trim()
  if (level === 2) return objective && items('inScope') && items('verificationChecks') ? 'light' : 'draft'
  return task.execution_mode && objective && items('inScope') && items('acceptanceCriteria') && items('verificationChecks') ? 'ready' : 'draft'
}

export function executionObjective(contractText: string | null): string {
  try {
    const contract = contractText ? JSON.parse(contractText) as Record<string, unknown> : {}
    return typeof contract.objective === 'string' ? contract.objective : ''
  } catch { return '' }
}
