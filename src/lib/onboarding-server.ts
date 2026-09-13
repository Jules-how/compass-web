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
  validateOnboardingAnswers
} from '@/lib/onboarding-pack.mjs'
import { bookingGrantEmail, generateOnboardingToken } from '@/lib/onboarding-rate-limit'
import { appendEvidence } from '@/lib/events'

export type OnboardingFormRow = {
  id: string
  client_id: string
  token: string
  offer_key: string
  offer_revision_id: string | null
  engagement_id: string | null
  agreement_id: string | null
  status: 'sent' | 'opened' | 'submitted' | 'expired'
  sent_at: string
  opened_at: string | null
  submitted_at: string | null
  answers: Record<string, unknown>
  created_at: string
}

const FORM_COLUMNS =
  'id,client_id,token,offer_key,offer_revision_id,engagement_id,agreement_id,status,sent_at,opened_at,submitted_at,answers,created_at'

export type OnboardingEngagement = {
  id: string
  client_id: string
  offer_key: string
  offer_revision_id: string
  agreement_id: string
  status: 'paid' | 'onboarding'
  accepted_terms: Record<string, unknown>
}

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

const PROJECT_EXTERNAL_PREFIX = 'onboarding:installation-booking:'

async function ensureDeliveryProject(
  admin: SupabaseClient,
  clientId: string,
  clientName: string,
  engagement: OnboardingEngagement
): Promise<string> {
  const externalId = `${PROJECT_EXTERNAL_PREFIX}${engagement.id}`
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
      name: `${clientName.trim() || 'Client'} · Ads + booking delivery`,
      status: 'in_progress',
      priority: 1,
      health: 'on_track',
      client_id: clientId,
      source: 'onboarding',
      external_id: externalId,
      summary: `Created from paid engagement ${engagement.id}. Delivery stays gated until access, staging and live authorisation are confirmed.`,
      labels: ['onboarding', 'installation-booking', `revision:${engagement.offer_revision_id}`],
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

export type SubmitOnboardingResult = {
  validationErrors?: Array<{ fieldId: string; message: string }>
  clientId: string
  projectId: string
}

export async function processOnboardingSubmit(
  form: OnboardingFormRow
): Promise<SubmitOnboardingResult> {
  if (
    form.offer_key !== DEFAULT_ONBOARDING_OFFER_KEY ||
    !form.offer_revision_id ||
    !form.engagement_id ||
    !form.agreement_id
  ) {
    throw new Error('onboarding_engagement_required')
  }
  const admin = getPortalAdminClient()
  const engagementResult = await admin
    .from('compass_client_engagements')
    .select('id,client_id,offer_key,offer_revision_id,agreement_id,status,accepted_terms')
    .eq('id', form.engagement_id)
    .eq('client_id', form.client_id)
    .maybeSingle()
  if (engagementResult.error) throw new Error(engagementResult.error.message)
  const engagement = engagementResult.data as OnboardingEngagement | null
  if (
    !engagement ||
    !['paid', 'onboarding'].includes(engagement.status) ||
    engagement.offer_key !== form.offer_key ||
    engagement.offer_revision_id !== form.offer_revision_id ||
    engagement.agreement_id !== form.agreement_id
  ) {
    throw new Error('onboarding_lineage_mismatch')
  }
  const pack = loadOnboardingPack(form.offer_key)
  const answers = { ...form.answers }
  const validationErrors = validateOnboardingAnswers(pack, answers)
  if (validationErrors.length > 0) {
    return { validationErrors, clientId: form.client_id, projectId: '' }
  }

  const submittedAt = new Date().toISOString()
  answers.authorisation_at = submittedAt

  const { data: clientRow, error: clientError } = await admin
    .from('compass_clients')
    .select('id,name,industry,website,main_contact_name')
    .eq('id', form.client_id)
    .maybeSingle()
  if (clientError) throw new Error(clientError.message)
  if (!clientRow) throw new Error('client_not_found')

  const { clientPatch, delivery } = mapOnboardingSubmit(
    answers,
    clientRow,
    submittedAt
  )

  const clientUpdate = {
    ...clientPatch,
    updated_at: submittedAt
  }

  const { error: updateClientError } = await admin
    .from('compass_clients')
    .update(clientUpdate)
    .eq('id', form.client_id)
  if (updateClientError) throw new Error(updateClientError.message)

  const projectId = await ensureDeliveryProject(
    admin,
    form.client_id,
    String(clientPatch.name || clientRow.name || ''),
    engagement
  )
  const taskNotes = buildOnboardingTaskNotes(delivery)
  for (const task of taskNotes) {
    await upsertOnboardingTask(admin, projectId, task)
  }

  const engagementUpdate = await admin
    .from('compass_client_engagements')
    .update({
      status: 'onboarding',
      onboarding_snapshot: {
        answers: delivery,
        submitted_at: submittedAt,
        form_id: form.id
      },
      updated_at: submittedAt
    })
    .eq('id', engagement.id)
    .eq('status', engagement.status)
  if (engagementUpdate.error) throw new Error(engagementUpdate.error.message)

  const { error: formError } = await admin
    .from('compass_onboarding_forms')
    .update({
      status: 'submitted',
      submitted_at: submittedAt,
      answers
    })
    .eq('id', form.id)
  if (formError) throw new Error(formError.message)

  try {
    await appendEvidence(admin, {
      client_id: form.client_id,
      source: 'onboarding',
      type: 'client.onboarding.submitted',
      offer: form.offer_key,
      offer_revision_id: form.offer_revision_id,
      engagement_id: form.engagement_id,
      native_id: form.id,
      payload: { form_id: form.id, project_id: projectId, submitted_at: submittedAt }
    })
  } catch {
    // The submitted form and engagement snapshot remain the authoritative receipt.
  }

  return {
    clientId: form.client_id,
    projectId
  }
}

export async function createOnboardingForm(
  admin: SupabaseClient,
  clientId: string,
  engagement: OnboardingEngagement
): Promise<OnboardingFormRow> {
  if (
    engagement.client_id !== clientId ||
    engagement.offer_key !== DEFAULT_ONBOARDING_OFFER_KEY ||
    engagement.status !== 'paid'
  ) {
    throw new Error('paid_installation_engagement_required')
  }
  validateOfferPackExists(engagement.offer_key)
  const now = new Date().toISOString()
  const id = `onboard-form-${crypto.randomUUID()}`
  const token = generateOnboardingToken()
  const row = {
    id,
    client_id: clientId,
    token,
    offer_key: engagement.offer_key,
    offer_revision_id: engagement.offer_revision_id,
    engagement_id: engagement.id,
    agreement_id: engagement.agreement_id,
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

export async function latestPaidOnboardingEngagement(
  admin: SupabaseClient,
  clientId: string
): Promise<OnboardingEngagement | null> {
  const { data, error } = await admin
    .from('compass_client_engagements')
    .select('id,client_id,offer_key,offer_revision_id,agreement_id,status,accepted_terms,paid_at,updated_at')
    .eq('client_id', clientId)
    .eq('offer_key', DEFAULT_ONBOARDING_OFFER_KEY)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data as OnboardingEngagement) : null
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
