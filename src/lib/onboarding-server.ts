import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getPortalAdminClient } from '@/lib/portal-admin'
import {
  buildOnboardingTaskNotes,
  hydratePackForClient,
  loadOnboardingPack,
  mapOnboardingSubmit,
  DEFAULT_ONBOARDING_OFFER_KEY,
  ONBOARDING_DELIVERY_TASKS,
  ONBOARDING_INVOICE_TASK,
  validateOnboardingAnswers
} from '@/lib/onboarding-pack.mjs'
import { amountsFromTier } from '@/lib/qbo-invoice.mjs'
import { defaultDealTerms, parseDealTerms } from '@/lib/qbo-deal'
import {
  createQboClient,
  loadQboRefreshToken,
  type QboClientRecord
} from '@/lib/qbo'
import { sydneyTodayYmd } from '@/lib/qbo-invoice.mjs'
import { spawnInstallOnSubmit } from '@/lib/delivery-dept/store'
import { bookingGrantEmail, generateOnboardingToken } from '@/lib/onboarding-rate-limit'

export type OnboardingFormRow = {
  id: string
  client_id: string
  token: string
  offer_key: string
  status: 'sent' | 'opened' | 'submitted' | 'expired'
  sent_at: string
  opened_at: string | null
  submitted_at: string | null
  answers: Record<string, unknown>
  created_at: string
}

const FORM_COLUMNS =
  'id,client_id,token,offer_key,status,sent_at,opened_at,submitted_at,answers,created_at'

export async function loadFormByToken(
  admin: SupabaseClient,
  token: string
): Promise<OnboardingFormRow | null> {
  const { data, error } = await admin
    .from('compass_onboarding_forms')
    .select(FORM_COLUMNS)
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    ...data,
    answers: (data.answers as Record<string, unknown>) ?? {}
  } as OnboardingFormRow
}

export async function markFormOpened(admin: SupabaseClient, form: OnboardingFormRow): Promise<void> {
  if (form.status !== 'sent' || form.opened_at) return
  const now = new Date().toISOString()
  const { error } = await admin
    .from('compass_onboarding_forms')
    .update({ status: 'opened', opened_at: now })
    .eq('id', form.id)
    .eq('status', 'sent')
  if (error) throw new Error(error.message)
}

export async function saveFormAnswers(
  admin: SupabaseClient,
  formId: string,
  answers: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from('compass_onboarding_forms')
    .update({ answers })
    .eq('id', formId)
  if (error) throw new Error(error.message)
}

export function publicPackForForm(offerKey: string) {
  const pack = loadOnboardingPack(offerKey)
  return hydratePackForClient(pack, bookingGrantEmail())
}

const PROJECT_EXTERNAL_PREFIX = 'onboarding:booked-jobs-system:'

async function ensureDeliveryProject(
  admin: SupabaseClient,
  clientId: string,
  clientName: string
): Promise<string> {
  const externalId = `${PROJECT_EXTERNAL_PREFIX}${clientId}`
  const { data: existing } = await admin
    .from('compass_projects')
    .select('id')
    .eq('client_id', clientId)
    .eq('external_id', externalId)
    .maybeSingle()
  if (existing?.id) return existing.id

  const now = new Date().toISOString()
  const id = `project-${crypto.randomUUID()}`
  const { data, error } = await admin
    .from('compass_projects')
    .insert({
      id,
      name: `${clientName.trim() || 'Client'} · fill-and-capture delivery`,
      status: 'in_progress',
      priority: 1,
      health: 'on_track',
      client_id: clientId,
      source: 'onboarding',
      external_id: externalId,
      summary: 'Auto-created from client onboarding form.',
      labels: ['onboarding', 'fill-capture'],
      created_at: now,
      updated_at: now,
      mirrored_at: now
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

async function upsertOnboardingTask(
  admin: SupabaseClient,
  projectId: string,
  task: { key: string; title: string; task_type: string; notes: string }
): Promise<void> {
  const marker = `onboarding_key:${task.key}`
  const { data: existingRows } = await admin
    .from('compass_tasks')
    .select('id,notes')
    .eq('project_id', projectId)
    .eq('source', 'onboarding')
  const existing = (existingRows ?? []).find((row) =>
    String(row.notes || '').includes(marker)
  )
  const now = new Date().toISOString()
  if (existing?.id) {
    const { error } = await admin
      .from('compass_tasks')
      .update({ title: task.title, notes: task.notes, updated_at: now })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await admin.from('compass_tasks').insert({
    id: `task-${crypto.randomUUID()}`,
    title: task.title,
    status: 'not-started',
    priority: 1,
    due: null,
    source: 'onboarding',
    project_id: projectId,
    parent_task_id: null,
    business_function_id: null,
    task_type: task.task_type,
    complexity: null,
    notes: task.notes,
    execution_level: 0,
    execution_mode: null,
    execution_contract: null,
    contract_revision: 0,
    created_at: now,
    updated_at: now,
    mirrored_at: now
  })
  if (error) throw new Error(error.message)
}

async function hasInstallInvoice(admin: SupabaseClient, clientId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('compass_qbo_docs')
    .select('id')
    .eq('client_id', clientId)
    .eq('doc_type', 'invoice')
    .eq('invoice_kind', 'install_first_month')
    .limit(1)
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(error.message)
  }
  return (data ?? []).length > 0
}

export type SubmitOnboardingResult = {
  validationErrors?: Array<{ fieldId: string; message: string }>
  clientId: string
  projectId: string
  invoiceCreated: boolean
  invoiceTaskCreated: boolean
}

export async function processOnboardingSubmit(
  form: OnboardingFormRow
): Promise<SubmitOnboardingResult> {
  const admin = getPortalAdminClient()
  const pack = loadOnboardingPack(form.offer_key)
  const answers = { ...form.answers }
  const validationErrors = validateOnboardingAnswers(pack, answers)
  if (validationErrors.length > 0) {
    return { validationErrors, clientId: form.client_id, projectId: '', invoiceCreated: false, invoiceTaskCreated: false }
  }

  const submittedAt = new Date().toISOString()
  answers.authorisation_at = submittedAt

  const { data: clientRow, error: clientError } = await admin
    .from('compass_clients')
    .select('id,name,industry,website,main_contact_name,deal_terms,qbo_customer_id')
    .eq('id', form.client_id)
    .maybeSingle()
  if (clientError) throw new Error(clientError.message)
  if (!clientRow) throw new Error('client_not_found')

  const existingDeal = parseDealTerms(clientRow.deal_terms)
  const { clientPatch, dealTerms, delivery } = mapOnboardingSubmit(
    answers,
    clientRow,
    existingDeal,
    submittedAt
  )
  const amounts = amountsFromTier(dealTerms.tier as 'vans_3' | 'vans_4_8')
  const mergedDealTerms = {
    ...defaultDealTerms({
      offer: String(dealTerms.offer || DEFAULT_ONBOARDING_OFFER_KEY),
      tier: dealTerms.tier as 'vans_3' | 'vans_4_8',
      billing_email: String(dealTerms.billing_email || ''),
      status: dealTerms.status as 'draft' | 'contracted' | 'retainer_active' | 'paused' | 'ended',
      install_aud: amounts.installAud,
      monthly_aud: amounts.monthlyAud,
      gst_mode: 'exclusive' as const
    }),
    delivery
  }

  const clientUpdate = {
    ...clientPatch,
    deal_terms: mergedDealTerms,
    updated_at: submittedAt
  }

  const { error: updateClientError } = await admin
    .from('compass_clients')
    .update(clientUpdate)
    .eq('id', form.client_id)
  if (updateClientError) throw new Error(updateClientError.message)

  const projectId = await ensureDeliveryProject(admin, form.client_id, String(clientRow.name || ''))
  await spawnInstallOnSubmit(admin, {
    id: form.client_id,
    name: String(clientPatch.name || clientRow.name || ''),
    deal_terms: mergedDealTerms
  })
  const taskNotes = buildOnboardingTaskNotes(delivery)
  for (const task of taskNotes) {
    await upsertOnboardingTask(admin, projectId, task)
  }

  let invoiceCreated = false
  let invoiceTaskCreated = false
  const alreadyInvoiced = await hasInstallInvoice(admin, form.client_id)

  if (!alreadyInvoiced) {
    const qboConnected = Boolean(await loadQboRefreshToken(admin))
    if (qboConnected) {
      try {
        const qbo = createQboClient({ supabase: admin })
        const today = sydneyTodayYmd()
        const clientRecord: QboClientRecord = {
          id: form.client_id,
          name: String(clientPatch.name || clientRow.name),
          deal_terms: mergedDealTerms,
          qbo_customer_id: clientRow.qbo_customer_id,
          main_contact_name: String(clientPatch.main_contact_name || clientRow.main_contact_name)
        }
        await qbo.createInvoice(clientRecord, 'install_first_month', {
          txnDate: today,
          dueDate: today
        })
        invoiceCreated = true
      } catch {
        await upsertOnboardingTask(admin, projectId, {
          ...ONBOARDING_INVOICE_TASK,
          notes: `onboarding_key:${ONBOARDING_INVOICE_TASK.key}\nQBO invoice create failed; raise install + first month manually.`
        })
        invoiceTaskCreated = true
      }
    } else {
      await upsertOnboardingTask(admin, projectId, {
        ...ONBOARDING_INVOICE_TASK,
        notes: `onboarding_key:${ONBOARDING_INVOICE_TASK.key}\nQuickBooks not connected.`
      })
      invoiceTaskCreated = true
    }
  }

  const { error: formError } = await admin
    .from('compass_onboarding_forms')
    .update({
      status: 'submitted',
      submitted_at: submittedAt,
      answers
    })
    .eq('id', form.id)
  if (formError) throw new Error(formError.message)

  return {
    clientId: form.client_id,
    projectId,
    invoiceCreated,
    invoiceTaskCreated
  }
}

export async function createOnboardingForm(
  admin: SupabaseClient,
  clientId: string,
  offerKey = DEFAULT_ONBOARDING_OFFER_KEY
): Promise<OnboardingFormRow> {
  validateOfferPackExists(offerKey)
  const now = new Date().toISOString()
  const id = `onboard-form-${crypto.randomUUID()}`
  const token = generateOnboardingToken()
  const row = {
    id,
    client_id: clientId,
    token,
    offer_key: offerKey,
    status: 'sent',
    sent_at: now,
    opened_at: null,
    submitted_at: null,
    answers: {},
    created_at: now
  }
  const { data, error } = await admin.from('compass_onboarding_forms').insert(row).select(FORM_COLUMNS).single()
  if (error) throw new Error(error.message)
  return { ...(data as OnboardingFormRow), answers: {} }
}

function validateOfferPackExists(offerKey: string): void {
  loadOnboardingPack(offerKey)
}

export async function latestOnboardingForm(
  admin: SupabaseClient,
  clientId: string
): Promise<OnboardingFormRow | null> {
  const { data, error } = await admin
    .from('compass_onboarding_forms')
    .select(FORM_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...(data as OnboardingFormRow), answers: (data.answers as Record<string, unknown>) ?? {} }
}

export { FORM_COLUMNS, ONBOARDING_DELIVERY_TASKS }
