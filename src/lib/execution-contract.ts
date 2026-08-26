export type ProofClause = {
  kind: string
  min_count?: number
  filter?: Record<string, unknown>
  campaign_id?: string
}

export type ProofGroup = { all: ProofClause[] } | { any: ProofClause[] }

export type ExecutionContract = {
  objective?: string
  inScope?: string[]
  acceptanceCriteria?: string[]
  verificationChecks?: string[]
  /** Dedupe key for digest-proposed tasks (skip when an open task shares this). */
  fingerprint?: string
  proof?: ProofGroup[]
  satisfied?: Array<{
    groupIndex: number
    clauseIndex: number
    evidence_ids: string[]
  }>
  digest_undo?: {
    completed_at: string
    previous_status: string
  }
}

export function parseExecutionContract(text: string | null | undefined): ExecutionContract {
  if (!text?.trim()) return {}
  try {
    const parsed = JSON.parse(text) as ExecutionContract
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function stringifyExecutionContract(contract: ExecutionContract): string {
  return JSON.stringify(contract)
}

export function taskHasProofClauses(task: { execution_contract?: string | null }): boolean {
  const contract = parseExecutionContract(task.execution_contract)
  return Array.isArray(contract.proof) && contract.proof.length > 0
}

export function proofProgress(task: { execution_contract?: string | null }): {
  proven: number
  total: number
} {
  const contract = parseExecutionContract(task.execution_contract)
  const groups = contract.proof ?? []
  if (groups.length === 0) return { proven: 0, total: 0 }

  let total = 0
  let proven = 0
  const satisfied = contract.satisfied ?? []

  groups.forEach((group, groupIndex) => {
    const clauses = 'all' in group ? group.all : group.any
    total += clauses.length
    for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
      const hit = satisfied.some(
        (s) => s.groupIndex === groupIndex && s.clauseIndex === clauseIndex && s.evidence_ids.length > 0
      )
      if (hit) proven += 1
    }
  })

  return { proven, total }
}

export function executionReadiness(task: {
  execution_level?: number | null
  execution_mode?: string | null
  execution_contract?: string | null
}): string {
  const level = task.execution_level ?? 1
  if (level <= 1) return 'light'
  const contract = parseExecutionContract(task.execution_contract)
  const items = (key: keyof ExecutionContract) =>
    Array.isArray(contract[key]) &&
    (contract[key] as string[]).some((item) => typeof item === 'string' && item.trim())
  const objective = typeof contract.objective === 'string' && contract.objective.trim()
  if (level === 2) {
    return objective && items('inScope') && items('verificationChecks') ? 'light' : 'draft'
  }
  return task.execution_mode && objective && items('inScope') && items('acceptanceCriteria') && items('verificationChecks')
    ? 'ready'
    : 'draft'
}

export function executionObjective(contractText: string | null): string {
  const contract = parseExecutionContract(contractText)
  return typeof contract.objective === 'string' ? contract.objective : ''
}
