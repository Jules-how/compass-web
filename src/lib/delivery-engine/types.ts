export type Stage = 'new' | 'engaged' | 'qualified' | 'booking_pending' | 'booked' | 'attended' | 'quoted' | 'won' | 'lost' | 'invalid'
export type Control = 'active' | 'human' | 'stopped'
export type Slot = { start: string; end: string; label: string }
export type Facts = { suburb?: string; service?: string; homeowner?: boolean; timeframe?: string; address?: string }
export type AccountConfig = {
  businessName: string
  timezone: string
  service: 'ducted_replacement'
  suburbs: string[]
  owner: string
  hours: Record<string, [string, string] | []>
  slotMinutes: number
  bufferMinutes: number
  minimumNoticeMinutes: number
  followupHours: number[]
  quietHours: [number, number]
}
export type DeliveryAccount = {
  id: string; client_id: string | null; mode: 'demo' | 'live'; enabled: boolean
  config: AccountConfig; twilio_number: string | null; twilio_account_sid: string | null
  calendar_id: string | null; crm_kind: 'demo' | 'manual'; demo_now?: string | null
}
export type Appointment = { id: string; slot: Slot; status: 'confirmed' | 'cancelled' }
export type DeliveryState = {
  stage: Stage; facts: Facts; offeredSlots: Slot[]; offersExpireAt?: string
  appointment?: Appointment; handoff?: { reason: string; owner: string; dueAt: string; resolvedAt?: string }
  awaiting?: keyof Facts; followups: number; lastInboundAt?: string
  milestones: Partial<Record<Stage, string>>
  outcomeValue?: number; outcomeCurrency?: 'AUD'
  crm?: { status: 'manual_pending' | 'synced' | 'manual_done'; reference: string; updatedAt: string; owner: string }
  automationVersion: 'installation-v1'
}
export type Enquiry = {
  id: string; account_id: string; contact_id: string; external_id: string; name: string; phone: string
  consent: { sms: boolean; wording: string; source: string; recordedAt: string }
  attribution: Record<string, string>; state: DeliveryState; control: Control; epoch: number; version: number
  created_at: string; updated_at: string
}
export type JobKind = 'intake' | 'message' | 'operator' | 'slots' | 'book' | 'cancel' | 'sms' | 'followup' | 'reminder' | 'crm' | 'outcome'
export type Job = {
  id: string; account_id: string; enquiry_id: string; kind: JobKind; payload: Record<string, unknown>
  expected_epoch: number | null; due_at: string; status: string; attempts: number
  lease_token: string | null; lease_until: string | null; error: string | null; dedupe_key: string
}
export type PendingJob = { kind: JobKind; payload: Record<string, unknown>; dueAt: string; key: string; guarded: boolean }
export type Event = { type: string; payload: Record<string, unknown> }
export type Transition = { state: DeliveryState; control?: Control; jobs: PendingJob[]; events: Event[] }
export type Message = {
  id: string; account_id: string; enquiry_id: string | null; provider_id: string
  direction: 'inbound' | 'outbound'; body: string; status: string; occurred_at: string
}
export type DeliveryContext = { now: string; enquiry: Enquiry; account: DeliveryAccount; job: Job }
export interface RpcDatabase { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }
export interface DeliveryProviders {
  slots(context: DeliveryContext): Promise<Slot[]>
  book(context: DeliveryContext, slot: Slot, appointmentId: string): Promise<Appointment>
  cancel(context: DeliveryContext, appointment: Appointment): Promise<void>
  sms(context: DeliveryContext, body: string): Promise<{ id: string; status: string }>
  crm(context: DeliveryContext): Promise<{ id: string; status: 'synced' | 'manual' }>
}
