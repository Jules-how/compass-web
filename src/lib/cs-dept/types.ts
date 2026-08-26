export type CsHealthBand = 'healthy' | 'watch' | 'at_risk'
export type CsAttention = 'at_risk' | 'guarantee_short' | 'guarantee' | 'qbr' | 'healthy'
export type CsArtifactKind =
  | 'weekly_summary'
  | 'monday_sms'
  | 'monday_email'
  | 'save_play'
  | 'guarantee'
  | 'qbr'
export type CsArtifactStatus = 'draft' | 'approved' | 'skipped' | 'sent'
export type CsPaymentStatus = 'current' | 'paid' | 'due_soon' | 'overdue' | 'paused' | 'ended' | 'draft'

export type CsFactor = {
  points: number
  max: number
  [key: string]: unknown
}

export type CsSnapshot = {
  id: string
  client_id: string
  scored_at: string
  period_end: string
  score: number
  band: CsHealthBand
  at_risk: boolean
  prior_score: number | null
  drop_points: number
  factors: Record<string, CsFactor>
  is_demo: boolean
}

export type CsArtifact = {
  id: string
  client_id: string
  client_name: string
  kind: CsArtifactKind
  period_start: string | null
  period_end: string | null
  status: CsArtifactStatus
  title: string
  body: string
  payload: Record<string, unknown>
  is_demo: boolean
  created_at: string
}

export type CsGuarantee = {
  due: boolean
  day_index: number | null
  start_date?: string | null
  fees_paid: number
  job_contribution_aud?: number
  showed_to_date?: number
  recovered: number
  made_fees_back: boolean | null
  shortfall?: number
}

export type CsCard = {
  client: {
    id: string
    name: string
    city: string | null
    trade: string | null
    owner_name: string | null
    owner_mobile: string | null
    is_demo: boolean
  }
  snapshot: CsSnapshot
  artifacts: CsArtifact[]
  checkpoint: CsGuarantee
  attention: CsAttention
  review_rank?: number
}

export type CsBoard = {
  generated_at: string
  source: 'demo' | 'live' | 'mixed'
  counts: {
    clients: number
    at_risk: number
    drafts: number
    healthy: number
    guarantee: number
    qbr: number
  }
  cards: CsCard[]
  snapshots: CsSnapshot[]
  artifacts: CsArtifact[]
  monday_minutes_budget: number
  scan_seconds_per_healthy: number
}

export type CsRoiProjection = {
  client_id: string
  client_name: string
  period_start: string | null
  period_end: string | null
  calls: number
  booked: number
  showed: number
  recovered_aud: number
  vs_last_week: {
    calls: number
    booked: number
    showed: number
    recovered_aud: number
  }
}
