import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import * as preparation from './outbound-preparation-server'
import type { Rendered } from './outbound-preparation'

const id = z.string().min(1).max(180)
const recipe = z
  .object({ subject: z.string().min(1).max(200), opener: z.string().min(1).max(500), include_name: z.boolean().optional(), rules: z.array(z.object({id: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/), label: z.string().min(1).max(100), field: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/), contains: z.string().max(200).optional(), opener: z.string().min(1).max(500), subject: z.string().max(200).optional()}).strict()).max(12).optional() })
  .strict()
const settings = z
  .object({
    timezone: z.literal('Australia/Sydney'),
    email_list: z.array(z.email()).min(1).max(100),
    from: z.string(),
    to: z.string(),
    daily_limit: z.number().int().min(1).max(10000)
  })
  .strict()
export const preparationCommand = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('configure'),
      recipe,
      settings,
      revision: z.number().int().min(0)
    })
    .strict(),
  z
    .object({
      action: z.literal('import_inventory'),
      lead_ids: z.array(id).min(1).max(200).optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('create'),
      rows: z.array(z.record(z.string(), z.unknown())).min(1).max(200)
    })
    .strict(),
  z
    .object({
      action: z.literal('revise'),
      run_id: id,
      candidate_id: id,
      changes: z
        .object({
          evidence: z
            .array(
              z
                .object({
                  kind: z.string(),
                  value: z.string(),
                  quote: z.string(),
                  url: z.string(),
                  observed_at: z.string()
                })
                .strict()
            )
            .max(30),
          geography_review: z.object({region:z.enum(['greater_sydney','unconfirmed']),rationale:z.string().max(1000),checked_at:z.string()}).strict().optional(),
          identity_reviewed: z.boolean(),
          hold_reason: z.string().max(1000),
          exclude_reason: z.string().max(1000),
          contact_basis: z
            .object({
              kind: z.string(),
              rationale: z.string(),
              url: z.string(),
              checked_at: z.string()
            })
            .strict(),
          verification: z
            .object({
              status: z.string(),
              provider: z.string(),
              checked_at: z.string()
            })
            .strict()
        })
        .strict()
    })
    .strict(),
  z.object({ action: z.literal('claim'), run_id: id }).strict(),
  z
    .object({
      action: z.literal('heartbeat'),
      run_id: id,
      token: z.uuid(),
      error: z.string().max(1000).optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('complete'),
      run_id: id,
      token: z.uuid(),
      outputs: z
        .array(
          z.object({
            candidate_id: id,
            values: z.record(z.string(), z.string()),
            steps: z.array(z.object({ subject: z.string(), body: z.string() }))
          })
        )
        .max(200)
    })
    .strict(),
  z
    .object({
      action: z.literal('approve'),
      preparation_id: id,
      hash: z.string().length(64)
    })
    .strict(),
  z.object({ action: z.literal('reserve'), preparation_id: id }).strict(),
  z.object({ action: z.literal('export'), preparation_id: id }).strict(),
  z.object({ action: z.literal('reconcile'), preparation_id: id }).strict()
])

/** Worker credentials can prepare and reconcile, but cannot record human approval. */
export async function executePreparationCommand(
  db: SupabaseClient,
  campaignId: string,
  input: unknown,
  operator?: SupabaseClient
) {
  const cmd = preparationCommand.parse(input)
  if ('run_id' in cmd) {
    const run = await db
      .from('compass_outbound_runs')
      .select('campaign_id')
      .eq('id', cmd.run_id)
      .single()
    if (run.error || run.data.campaign_id !== campaignId)
      throw new Error('run_not_in_campaign')
  }
  if ('preparation_id' in cmd) {
    const prep = await db
      .from('compass_outbound_preparations')
      .select('bundle')
      .eq('id', cmd.preparation_id)
      .single()
    if (prep.error || prep.data.bundle.context.campaign_id !== campaignId)
      throw new Error('preparation_not_in_campaign')
  }
  switch (cmd.action) {
    case 'configure':
      await preparation.savePreparationConfig(
        db,
        campaignId,
        cmd.recipe,
        cmd.settings,
        cmd.revision
      )
      return { saved: true }
    case 'import_inventory':
      return preparation.importCampaignInventory(db, campaignId, cmd.lead_ids)
    case 'create':
      return preparation.createPreparationRun(db, campaignId, cmd.rows)
    case 'revise':
      return preparation.revisePreparationRun(
        db,
        campaignId,
        cmd.run_id,
        cmd.candidate_id,
        cmd.changes
      )
    case 'claim':
      return preparation.claimPreparationRun(db, cmd.run_id)
    case 'heartbeat':
      await preparation.heartbeatRun(db, cmd.run_id, cmd.token, cmd.error)
      return { saved: true }
    case 'complete':
      return preparation.completePreparationRun(
        db,
        cmd.run_id,
        cmd.token,
        cmd.outputs as Rendered[]
      )
    case 'approve': {
      if (!operator) throw new Error('human_approval_requires_operator_session')
      await preparation.currentBundle(db, cmd.preparation_id)
      const result = await operator.rpc('outbound_approve_preparation', {
        p_id: cmd.preparation_id,
        p_hash: cmd.hash
      })
      if (result.error) throw new Error(result.error.message)
      return { approved: true }
    }
    case 'reserve':
      return preparation.reserveBrowserLoad(db, cmd.preparation_id)
    case 'export':
      return preparation.preparationExport(db, cmd.preparation_id)
    case 'reconcile':
      return preparation.reconcileBrowserLoad(db, cmd.preparation_id)
  }
}
