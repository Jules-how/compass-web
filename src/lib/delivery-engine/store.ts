import { configSchema, initialState, intakeSchema } from './config'
import type { DeliveryContext, Enquiry, RpcDatabase, Transition } from './types'

export class DeliveryStore {
  constructor(readonly database: RpcDatabase) {}
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.database.rpc(name, args)
    if (error) throw new Error(error.message)
    return data as T
  }
  async intake(value: unknown, now = new Date().toISOString()) {
    const input = intakeSchema.parse(value)
    const state = initialState(); state.facts = input.facts
    return this.rpc<{ id: string; duplicate: boolean }>('delivery_intake', { p_data: { ...input, state }, p_now: now })
  }
  receive(input: { accountId: string; providerId: string; phone: string; body: string; stop: boolean; enquiryId?: string }, now: string) {
    return this.rpc<{ id?: string; enquiryId?: string; unassigned?: boolean; duplicate: boolean }>('delivery_receive', {
      p_account_id: input.accountId, p_provider_id: input.providerId, p_phone: input.phone,
      p_body: input.body, p_stop: input.stop, p_enquiry_id: input.enquiryId ?? null, p_now: now
    })
  }
  command(accountId: string, enquiryId: string, key: string, kind: 'operator' | 'outcome', payload: Record<string, unknown>, now: string) {
    return this.rpc<string>('delivery_command', { p_account_id: accountId, p_enquiry_id: enquiryId, p_key: key, p_kind: kind, p_payload: payload, p_now: now })
  }
  async claim(now: string, accountId?: string): Promise<DeliveryContext | null> {
    const claimed = await this.rpc<Omit<DeliveryContext, 'now'> | null>('delivery_claim', { p_now: now, p_account_id: accountId ?? null })
    if (!claimed) return null
    return { ...claimed, now }
  }
  gate(ctx: DeliveryContext, dispatch = false, now = ctx.now) {
    return this.rpc<boolean>('delivery_gate', { p_job_id: ctx.job.id, p_token: ctx.job.lease_token, p_now: now, p_dispatch: dispatch })
  }
  finish(ctx: DeliveryContext, result: Partial<Transition> & { status?: string; error?: string; dueAt?: string; message?: { id: string; status: string; body: string }; crm?: Record<string, unknown> }, now = ctx.now) {
    return this.rpc<boolean>('delivery_finish', { p_job_id: ctx.job.id, p_token: ctx.job.lease_token, p_now: now, p_result: { epoch: ctx.enquiry.epoch, status: 'succeeded', ...result } })
  }
  reserve(ctx: DeliveryContext, start: string, end: string, now = ctx.now) {
    return this.rpc<boolean>('delivery_reserve', {
      p_job_id: ctx.job.id, p_token: ctx.job.lease_token, p_resource: ctx.account.mode === 'demo' ? `demo:${ctx.account.id}` : `google:${ctx.account.calendar_id}`,
      p_start: start, p_end: end, p_now: now
    })
  }
  snapshot(accountId?: string, enquiryId?: string) {
    return this.rpc<DeliverySnapshot>('delivery_snapshot', { p_account_id: accountId ?? null, p_enquiry_id: enquiryId ?? null })
  }
  busy(ctx: DeliveryContext) {
    return this.rpc<Array<{ start: string; end: string }>>('delivery_busy', { p_account_id: ctx.account.id, p_enquiry_id: ctx.enquiry.id })
  }
}

export type DeliverySnapshot = {
  accounts: import('./types').DeliveryAccount[]; enquiries: Enquiry[]
  messages: import('./types').Message[]; jobs: import('./types').Job[]
  events: Array<{ id: string; enquiry_id: string; type: string; payload: Record<string, unknown>; occurred_at: string }>
  crm: Array<{ enquiry_id: string; record: Record<string, unknown>; updated_at: string }>
  unassigned: import('./types').Message[]
  metrics: { total: number; contacted: number; qualified: number; booked: number; attended: number; quoted: number; won: number; needsHuman: number; optedOut: number }
}

export function validateAccount(ctx: DeliveryContext): void {
  ctx.account.config = configSchema.parse(ctx.account.config)
  if (ctx.enquiry.account_id !== ctx.account.id || ctx.job.account_id !== ctx.account.id || ctx.job.enquiry_id !== ctx.enquiry.id) throw new Error('account_mismatch')
}
