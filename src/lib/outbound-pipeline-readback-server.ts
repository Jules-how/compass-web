import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalPipeline, PipelineError } from './outbound-pipeline-schema';
import { pipelineDatabaseError, requirePipeline } from './outbound-pipeline-server';
import { readPipelineDelivery } from './outbound-pipeline-delivery-server';
import { currentBundle, verifyPausedCampaign } from './outbound-preparation-server';
import { reconcileRecipients, type PlatformLead } from './outbound-preparation';
import { instantlyFetch, resolveInstantlyApiKey } from './instantly';
import { instantlyGetCampaign } from './instantly-write';
import type { PipelineReadback } from './outbound-pipeline-readback';
import type { DeliveryItem } from './outbound-pipeline-delivery';
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_:.-]+$/);
const commandSchema = z.strictObject({
    schema_version: z.literal('outbound.pipeline.v1'), request_id: id.min(8), source: z.string().min(1).max(500), manifest_id: id, readback_id: id, expected_revision: z.number().int().nonnegative(), action: z.enum([
        'start_baseline', 'start_reconcile', 'page', 'compare_chunk', 'finish', 'approve_baseline'
    ]), data: z.strictObject({})
});
export async function readPipelineReadback(db: SupabaseClient, readbackId: string): Promise<PipelineReadback> {
    requirePipeline();
    const result = await db.from('outbound_pipeline_readbacks').select('id,manifest_id,phase,baseline_id,status,revision,cursor,page_count,scanned_count,compare_after,approved,summary,created_at,finished_at').eq('id', readbackId).maybeSingle();
    pipelineDatabaseError(result.error);
    if (!result.data)
        throw new PipelineError('pipeline_not_found');
    return result.data as PipelineReadback;
}
export async function readPipelineReadbackResults(db: SupabaseClient, readbackId: string, after?: string) {
    requirePipeline();
    let q = db.from('outbound_pipeline_readback_results').select('*').eq('readback_id', readbackId);
    if (after) {
        try {
            const c = JSON.parse(Buffer.from(after, 'base64url').toString());
            if (c.readback_id !== readbackId || typeof c.item_id !== 'string')
                throw new Error();
            q = q.gt('item_id', c.item_id);
        }
        catch {
            throw new PipelineError('pipeline_cursor_scope_conflict');
        }
    }
    const r = await q.order('item_id').limit(101);
    pipelineDatabaseError(r.error);
    return {
        records: (r.data || []).slice(0, 100), next_after: r.data && r.data.length > 100 ? Buffer.from(JSON.stringify({
            readback_id: readbackId, item_id: r.data[99].item_id
        })).toString('base64url') : null
    };
}
function stableLead(input: PlatformLead): PlatformLead {
    if (!input || typeof input.id !== 'string' || typeof input.email !== 'string')
        throw new PipelineError('pipeline_invalid_provider_recipient');
    return {
        id: input.id, email: input.email.trim().toLowerCase(), first_name: input.first_name || '', company_name: input.company_name || '', personalization: input.personalization || '', payload: input.payload || {}, custom_variables: input.custom_variables || {}
    };
}
export async function applyPipelineReadback(db: SupabaseClient, input: unknown, actor: string) {
    requirePipeline(true);
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success)
        throw new PipelineError('pipeline_invalid_readback_command');
    const command = parsed.data;
    if (command.action === 'approve_baseline' && !actor.startsWith('operator:'))
        throw new PipelineError('pipeline_operator_required');
    const hash = createHash('sha256').update(canonicalPipeline(command)).digest('hex');
    const previous = await db.from('outbound_pipeline_receipts').select('payload_hash,actor,receipt').eq('request_id', command.request_id).maybeSingle();
    pipelineDatabaseError(previous.error);
    if (previous.data) {
        if (previous.data.payload_hash !== hash || previous.data.actor !== actor)
            throw new PipelineError('pipeline_idempotency_conflict');
        return previous.data.receipt;
    }
    const manifest = await readPipelineDelivery(db, command.manifest_id);
    if (!manifest.approved)
        throw new PipelineError('pipeline_operator_approval_required');
    const payload: Record<string, unknown> = {};
    if (command.action === 'page' || command.action === 'finish' || command.action.startsWith('start_')) {
        const load = await db.from('compass_outbound_loads').select('instantly_campaign_id').eq('preparation_id', manifest.id).maybeSingle();
        pipelineDatabaseError(load.error);
        if (!load.data)
            throw new PipelineError('pipeline_approved_reservation_required');
        const key = await resolveInstantlyApiKey(db);
        if (!key)
            throw new PipelineError('instantly_readback_not_configured');
        const bundle = await currentBundle(db, manifest.id);
        const campaign = await instantlyGetCampaign(key, load.data.instantly_campaign_id);
        verifyPausedCampaign(bundle, campaign as Record<string, unknown>);
        if (command.action === 'finish' && manifest.context.pipeline?.copy_mode === 'recipient_variables') {
            const readback = await readPipelineReadback(db, command.readback_id);
            if (readback.phase === 'reconcile') {
                const preview = await db.from('outbound_pipeline_receipts').select('request_id').contains('receipt', {
                    result: {
                        provider_preview: {
                            manifest_hash: manifest.hash
                        }
                    }
                }).limit(1);
                pipelineDatabaseError(preview.error);
                if (!preview.data?.length)
                    throw new PipelineError('pipeline_provider_preview_review_required');
            }
        }
        if (command.action === 'finish')
            payload.campaign = {
                id: load.data.instantly_campaign_id, status: campaign.status, checked_at: new Date().toISOString()
            };
        if (command.action === 'page') {
            const claim = await db.rpc('outbound_pipeline_readback_claim', {
                p_id: command.readback_id, p_revision: command.expected_revision
            });
            pipelineDatabaseError(claim.error);
            const lease = claim.data;
            if (lease.manifest_id !== manifest.id)
                throw new PipelineError('pipeline_readback_scope_mismatch');
            const page = await instantlyFetch<{
                items: PlatformLead[];
                next_starting_after?: string;
            }>('/leads/list', key, {
                method: 'POST', body: JSON.stringify({
                    campaign: load.data.instantly_campaign_id, limit: 100, distinct_contacts: false, ...(lease.cursor ? {
                        starting_after: lease.cursor
                    } : {})
                })
            });
            if (!Array.isArray(page.items) || page.items.length > 100 || (page.next_starting_after !== undefined && page.next_starting_after !== null && typeof page.next_starting_after !== 'string'))
                throw new PipelineError('pipeline_invalid_provider_page');
            Object.assign(payload, {
                lease_token: lease.lease_token, cursor: lease.cursor, rows: page.items.map(stableLead), next_cursor: page.next_starting_after || null
            });
        }
    }
    if (command.action === 'compare_chunk') {
        const readback = await readPipelineReadback(db, command.readback_id);
        if (readback.manifest_id !== manifest.id)
            throw new PipelineError('pipeline_readback_scope_mismatch');
        let query = db.from('outbound_pipeline_delivery_items').select('*').eq('manifest_id', manifest.id).eq('status', 'pass');
        if (readback.compare_after)
            query = query.gt('id', readback.compare_after);
        const result = await query.order('id').limit(100);
        pipelineDatabaseError(result.error);
        const items = (result.data || []) as DeliveryItem[];
        if (!items.length)
            throw new PipelineError('pipeline_no_pending_comparisons');
        const actual = await db.from('outbound_pipeline_readback_rows').select('raw').eq('readback_id', readback.id).in('email', items.map(i => i.record!.candidate.email)).limit(10001);
        pipelineDatabaseError(actual.error);
        if ((actual.data?.length || 0) > 10000)
            throw new PipelineError('pipeline_excessive_provider_duplicates');
        const bundle = await currentBundle(db, manifest.id);
        bundle.records = items.map(i => i.record!);
        const compared = reconcileRecipients(bundle, (actual.data || []).map(row => row.raw as PlatformLead));
        payload.results = compared.receipts.map((r, index) => ({
            ...r, item_id: items[index].id, recipient_id: items[index].recipient_id
        }));
        payload.last_item_id = items.at(-1)!.id;
    }
    const saved = await db.rpc('outbound_pipeline_readback_command', {
        p_command: command, p_hash: hash, p_actor: actor, p_payload: payload
    });
    pipelineDatabaseError(saved.error);
    return saved.data;
}
