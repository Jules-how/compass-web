// TypeScript types mirroring the Supabase `compass_*` tables
// (supabase/migrations/0006_compass_web_tasks.sql).

export const TASK_STATUSES = [
  'not-started',
  'in-progress',
  'completed',
  'blocked',
  'cancelled'
] as const

export const TASK_TYPES = ['SELL', 'BUILD', 'DELIVER', 'THINK', 'ADMIN'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskType = (typeof TASK_TYPES)[number]

export interface CompassTask {
  id: string
  title: string
  status: TaskStatus
  priority: number
  due: string | null
  source: string | null
  project_id: string | null
  parent_task_id: string | null
  business_function_id: string | null
  task_type: TaskType | null
  complexity: number | null
  notes: string | null
  execution_level: number
  execution_mode: string | null
  execution_contract: string | null
  contract_revision: number
  created_at: string
  updated_at: string
  mirrored_at: string
}

export interface CompassProject {
  id: string
  name: string
  business_function_id: string | null
  client_id: string | null
  status: string
  priority: number
  health: string
  start_date: string | null
  target_date: string | null
  labels: string[]
  summary: string | null
  source: string | null
  external_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  mirrored_at: string
}

// ---------------------------------------------------------------------------
// Clients CRM (supabase/migrations/0029_compass_clients.sql).
// ---------------------------------------------------------------------------

export interface CompassClient {
  id: string
  name: string
  industry: string | null
  website: string | null
  main_contact_name: string | null
  main_contact_role: string | null
  engagement_type: string | null
  retainer_status: string | null
  status: string
  priority: number
  health: string
  summary: string | null
  tags: string[]
  notes: string | null
  archived_at: string | null
  vault_dossier_id: string | null
  portal_client_slug: string | null
  last_touch_at: string | null
  created_at: string
  updated_at: string
  mirrored_at: string
}

export type CompassClientCard = CompassClient & {
  next_action: string | null
  open_issue_count: number
}

export interface CompassClientUpdate {
  id: string
  client_id: string
  health: string
  body: string
  created_at: string
  mirrored_at: string
}

export interface CompassClientActivity {
  id: string
  client_id: string
  actor: string
  action: string
  body: string
  created_at: string
}

export interface CompassClientIssue {
  id: string
  client_id: string
  title: string
  status: string
  priority: number
  due: string | null
  notes: string | null
  project_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  mirrored_at: string
}

export interface CompassClientOffer {
  id: string
  client_id: string
  channel: string
  title: string
  description: string | null
  status: string
  amount: number | null
  currency: string
  created_at: string
  updated_at: string
}

export interface CompassClientAdSpend {
  id: string
  client_id: string
  channel: string
  spend_date: string
  amount: number
  currency: string
  campaign_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CompassClientChannelNote {
  id: string
  client_id: string
  channel: string
  body: string
  created_at: string
}

export interface ProjectStats {
  issueCount: number
  completedCount: number
  percentComplete: number
}

export type CompassProjectWithStats = CompassProject & {
  stats: ProjectStats
}

export interface CompassProjectMilestone {
  id: string
  project_id: string
  title: string
  description: string | null
  target_date: string | null
  sort_order: number
  completed: boolean
  created_at: string
  updated_at: string
  mirrored_at: string
}

export interface CompassProjectUpdate {
  id: string
  project_id: string
  health: string
  body: string
  created_at: string
  mirrored_at: string
}

export interface CompassProjectDependency {
  project_id: string
  depends_on_project_id: string
  created_at: string
}

export interface CompassBusinessFunction {
  id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
  updated_at: string
  mirrored_at: string
}

export interface CompassTaskNoteRevision {
  id: string
  task_id: string
  body: string
  actor: string
  source: string
  created_at: string
}

// Input shapes for create/update operations.
export type CompassTaskInsert = Omit<CompassTask, 'created_at' | 'updated_at' | 'mirrored_at'> &
  Partial<Pick<CompassTask, 'created_at' | 'updated_at' | 'mirrored_at'>>

export type CompassTaskUpdate = Partial<Omit<CompassTask, 'id' | 'created_at'>>

export interface TaskNoteRevisionInsert {
  id: string
  task_id: string
  body: string
  actor: string
  source?: string
}

// ---------------------------------------------------------------------------
// Lead mirror types (supabase/migrations/0005_lead_cloud_mirror.sql).
// Column mapping mirrors apps/compass/src/main/leads/lead-cloud-sync.ts
// `contactPayload()` / `batchPayload()` / `sourceRowPayload()`.
// ---------------------------------------------------------------------------

export interface LeadContact {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  vertical: string | null
  source: string | null
  tags: string | null
  city: string | null
  state: string | null
  linkedin: string | null
  list_ids: string | null
  import_batch_id: string | null
  outbound_status: string | null
  instantly_campaign: string | null
  instantly_campaign_id: string | null
  instantly_campaign_name: string | null
  instantly_campaign_ids: string | null
  instantly_lead_id: string | null
  instantly_uploaded_at: string | null
  instantly_synced_at: string | null
  lead_status_source: string | null
  interest_label: string | null
  recontact_ok: number | null
  suppression_reason: string | null
  last_outbound_at: string | null
  lead_context_status: string | null
  lead_context_updated_at: string | null
  created_at: string | null
  updated_at: string | null
  mirrored_at: string
}

export interface LeadImportBatch {
  id: string
  source: string | null
  filename: string | null
  sheet_url: string | null
  row_count: number
  imported: number
  dupes: number
  created_at: string | null
  mirrored_at: string
}

export interface LeadSourceRow {
  id: string
  batch_id: string
  source_type: string
  source_service: string
  source_file: string | null
  sheet_url: string | null
  source_row_number: number
  raw_json: string | null
  normalized_email: string | null
  normalized_phone: string | null
  linkedin: string | null
  company_domain: string | null
  decision: string
  contact_id: string | null
  reason: string | null
  created_at: string | null
  updated_at: string | null
  mirrored_at: string
}

export type LeadVertical =
  | 'hvac'
  | 'electrician'
  | 'broker'
  | 'recruitment'
  | 'trades'
  | 'agency'
  | 'other'

export type LeadSourceService =
  | 'prospeo'
  | 'origami'
  | 'vibe'
  | 'manual'
  | 'other'

// Filters accepted by the /leads page (all optional, combined with AND).
export interface LeadListFilters {
  vertical?: string
  source?: string
  outbound_status?: string
  city?: string
}

export interface LeadUploadResult {
  batchId: string
  rowCount: number
  imported: number
  dupes: number
  errors: string[]
}
