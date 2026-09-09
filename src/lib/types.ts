import type { LeadFact } from '@/lib/lead-facts'

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
  /** Present when API joins client names for stacked multi-client boards. */
  client_name?: string | null
}

// ---------------------------------------------------------------------------
// Clients CRM (supabase/migrations/0029_compass_clients.sql).
// ---------------------------------------------------------------------------

export type CommChannel = 'email' | 'sms' | 'call' | 'other'
export type CommDirection = 'inbound' | 'outbound'
export type CommThreadStatus = 'active' | 'archived'
export type CommSummarySource = 'ai' | 'heuristic' | 'manual'

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
  /** Rolling summary of linked email/SMS/call threads. */
  comms_summary: string | null
  comms_summary_at: string | null
  comms_summary_source: CommSummarySource | null
  created_at: string
  updated_at: string
  mirrored_at: string
}

export type ClientVoiceConfig = {
  twilio_number?: string | null
  retell_agent_id?: string | null
  trade_pack_id?: string | null
  calendar_id?: string | null
  forwarding_confirmed_at?: string | null
  after_hours_mode?: 'no_answer' | 'unconditional' | string | null
  transfer_enabled?: boolean | null
  owner_alert_mode?: 'live' | 'post_call' | string | null
  live_at?: string | null
  calendar_grant_broken?: boolean | null
  probe_at?: string | null
  probe_ok?: boolean | null
  owner_mobile?: string | null
  public_number?: string | null
  timezone?: string | null
}

export type VoiceCallRow = {
  id: string
  client_id: string
  retell_call_id: string
  from_number: string | null
  to_number: string | null
  started_at: string | null
  ended_at: string | null
  outcome: string | null
  job_type: string | null
  suburb: string | null
  urgency: string | null
  slot_start: string | null
  calendar_event_id: string | null
  recording_url: string | null
  transcript: string | null
  recording_refused: boolean
  payload: Record<string, unknown>
  created_at: string
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

export interface CompassClientCommThread {
  id: string
  client_id: string
  channel: CommChannel | string
  subject: string
  participants: string[]
  external_id: string | null
  status: CommThreadStatus | string
  notes: string | null
  summary: string | null
  summary_at: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface CompassClientCommMessage {
  id: string
  thread_id: string
  client_id: string
  direction: CommDirection | string
  sender: string | null
  body: string
  occurred_at: string
  external_id: string | null
  created_at: string
}

export type CompassClientCommThreadWithMessages = CompassClientCommThread & {
  messages: CompassClientCommMessage[]
  message_count: number
}

// ---------------------------------------------------------------------------
// Meta Ads Manager planning (supabase/migrations/0032_compass_meta_ads.sql).
// ---------------------------------------------------------------------------

export interface CompassMetaCampaign {
  id: string
  client_id: string
  name: string
  objective: string
  status: string
  buying_type: string
  special_ad_categories: string[]
  budget_type: string
  daily_budget: number | null
  lifetime_budget: number | null
  currency: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CompassMetaAdSet {
  id: string
  client_id: string
  campaign_id: string
  name: string
  status: string
  optimization_goal: string
  billing_event: string
  bid_strategy: string
  budget_type: string
  daily_budget: number | null
  lifetime_budget: number | null
  currency: string
  start_date: string | null
  end_date: string | null
  age_min: number
  age_max: number
  genders: string
  locations: string | null
  detailed_targeting: string | null
  placements: string
  placement_notes: string | null
  destination_type: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CompassMetaAd {
  id: string
  client_id: string
  ad_set_id: string
  name: string
  status: string
  format: string
  primary_text: string | null
  headline: string | null
  description: string | null
  call_to_action: string
  destination_url: string | null
  display_link: string | null
  media_notes: string | null
  notes: string | null
  created_at: string
  updated_at: string
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
  system_map?: SystemMapMeta | null
  created_at: string
  updated_at: string
  mirrored_at: string
}

export type SystemMapInfluence = {
  name: string
  route: string
  table: string
}

export type SystemMapMeta = {
  why?: string
  inputs?: string[]
  outputs?: string[]
  influences?: SystemMapInfluence[]
}

export interface FunctionWorkStats {
  projectCount: number
  activeProjectCount: number
  taskCount: number
  openTaskCount: number
  completedTaskCount: number
}

export type CompassBusinessFunctionWithStats = CompassBusinessFunction & {
  stats: FunctionWorkStats
  recentProjects?: Array<{ id: string; name: string }>
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
  pipeline_campaign_id?: string | null
  cohort_tag?: string | null
  enrich_status?: string | null
  opener?: string | null
  opener_template_id?: string | null
  opener_override?: boolean | null
  website?: string | null
  company_domain?: string | null
  email_verify_status?: string | null
  email_verified_at?: string | null
  icp_status?: string | null
  review_count?: number | null
  hours_label?: string | null
  after_hours?: boolean | null
  capture_crack?: string | null
  email_origin?: string | null
  lead_facts?: LeadFact[] | unknown | null
  is_archived?: number | boolean | null
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
  | 'mortgage-brokers'
  | 'hvac'
  | 'electrician'
  | 'plumber'
  | 'broker'
  | 'recruitment'
  | 'trades'
  | 'agency'
  | 'other'
  | (string & {})

export type LeadSourceService =
  | 'prospeo'
  | 'origami'
  | 'vibe'
  | 'manual'
  | 'other'
  | 'apify'

// Filters accepted by the /leads page (all optional, combined with AND).
export interface LeadListFilters {
  vertical?: string
  source?: string
  /** Pipeline stage (contacted, replied, …) or legacy Instantly status values. */
  outbound_status?: string
  /** Sync / review lane: in_instantly, not_uploaded, stale_sync, … */
  sync_state?: string
  completeness?: 'any' | 'has_phone' | 'no_phone' | 'has_email' | 'no_email'
  city?: string
  /** AU state / region (NSW, VIC, …). */
  state?: string
  /** Free-text search across name, email, company, phone. */
  q?: string
  /** When `1`, only rows with a null `email_verified_at`. */
  unverified_only?: '1' | '0'
  recontact_ok?: '1' | '0'
  suppressed?: '1' | '0'
  /**
   * When `1`, only leads past the 90-day cooldown that are safe to pull into
   * a new cold campaign (not suppressed / not hot pipeline stages).
   */
  recontact_ready?: '1' | '0'
  /** People list tab: cold/unreplied Leads vs interested Prospects vs Archived. */
  bucket?: 'leads' | 'prospects' | 'archived'
  /** Compass pipeline campaign cohort. */
  pipeline_campaign_id?: string
  /** Instantly campaign membership (uploaded leads). */
  instantly_campaign_id?: string
  cohort_tag?: string
  /** Enrichment readiness: none|queued|enriched|thin|opener_ready|uploaded */
  enrich_status?: string
  /** ICP lane: none|pass|thin|skip */
  icp_status?: string
  after_hours?: '1' | '0'
  email_origin?: string
  min_reviews?: string
  /** CRM list membership. */
  list_id?: string
  /** Campaign cohort via attached lists, else pipeline_campaign_id stamp. */
  cohort_campaign_id?: string
}

export interface LeadSummaryCounts {
  total: number
  filtered: number
  uncontacted: number
  in_instantly: number
  replied: number
  interested: number
  suppressed: number
  no_phone: number
  no_email: number
  needs_review: number
  /** Past 90-day cooldown + recontact allowed (cold re-outreach queue). */
  recontact_ready: number
  archived: number
}

export interface LeadUploadResult {
  batchId: string
  rowCount: number
  imported: number
  dupes: number
  /** Dupes matched on normalized email. */
  emailDupes: number
  /** Dupes matched on company domain or company name + city (one primary contact per company). */
  companyDupes: number
  skipped: Array<{ row: number; reason: string }>
  errors: string[]
}

export type OfferWaveColumnId = 'recommended' | 'next' | 'live'

export type OfferWaveCard = {
  campaignId: string
  name: string
  column: OfferWaveColumnId
  trade: string
  city: string
  rationale: string
  listSize: number
  offerKey: string
  copyStrategy: string
  approach: string
  goLiveAt: string | null
  testingVariable: string
  instantlyStatus: string
  sends: number
  replies: number
}
