import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalPipeline, PipelineError } from './outbound-pipeline-schema';
import { pipelineDatabaseError, requirePipeline } from './outbound-pipeline-server';
import { buildPipelineDeliveryItem, pipelineVariableSequence, validatePipelineSendContext, type DeliveryManifest, type DeliveryItem } from './outbound-pipeline-delivery';
import { reserveBrowserLoad, currentBundle } from './outbound-preparation-server';
import { instantlyExpected, type Context } from './outbound-preparation';
import { verifyPausedCampaign } from './outbound-preparation-server';
import { instantlyFetch, resolveInstantlyApiKey } from './instantly';
import { instantlyGetCampaign, instantlyUpdateCampaign } from './instantly-write';
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_:.-]+$/);
const envelope = z.strictObject({
    schema_version: z.literal('outbound.pipeline.v1'), request_id: id.min(8), source: z.string().min(1).max(500), manifest_id: id, expected_revision: z.number().int().nonnegative(), action: z.enum([
        'create', 'build_chunk', 'approve', 'reserve', 'configure_sequence', 'approve_preview'
    ]), data: z.unknown()
});
const createData = z.strictObject({
    copy_mode: z.enum([
        'recipient_variables', 'existing_sequence'
    ]).default('existing_sequence'), list_id: id, campaign_id: id, workflow_version_id: id, template_version_id: id, verification_run_id: id.optional(), recipient_ids: z.array(id).max(1000).optional(), filters: z.record(z.enum([
        'q', 'city', 'suburb', 'country', 'administrative_region', 'fit', 'stage', 'status', 'draft_status', 'verification_status'
    ]), z.string().max(500)).optional()
});
export async function readPipelineDelivery(db: SupabaseClient, manifestId: string) { requirePipeline(); const result = await db.from('outbound_pipeline_delivery_manifests').select('*').eq('id', manifestId).maybeSingle(); pipelineDatabaseError(result.error); if (!result.data)
    throw new PipelineError('pipeline_not_found'); const approval = await db.from('compass_outbound_approvals').select('hash,approved_at').eq('preparation_id', manifestId).maybeSingle(); pipelineDatabaseError(approval.error); return {
    ...result.data, approved: approval.data?.hash === result.data.hash, approved_at: approval.data?.approved_at || null
} as DeliveryManifest & {
    approved: boolean;
    approved_at: string | null;
}; }
export async function readPipelineDeliveryItems(db: SupabaseClient, manifestId: string, after?: string) { requirePipeline(); let q = db.from('outbound_pipeline_delivery_items').select('*').eq('manifest_id', manifestId); if (after) {
    try {
        const cursor = JSON.parse(Buffer.from(after, 'base64url').toString());
        if (cursor.manifest_id !== manifestId || typeof cursor.id !== 'string')
            throw new Error();
        q = q.gt('id', cursor.id);
    }
    catch {
        throw new PipelineError('pipeline_cursor_scope_conflict');
    }
} const result = await q.order('id').limit(101); pipelineDatabaseError(result.error); return {
    records: (result.data || []).slice(0, 100), next_after: (result.data || []).length > 100 ? Buffer.from(JSON.stringify({
        manifest_id: manifestId, id: result.data![99].id
    })).toString('base64url') : null
}; }
export async function applyPipelineDelivery(db: SupabaseClient, input: unknown, actor: string, operator?: SupabaseClient) {
    requirePipeline(true);
    let command: z.infer<typeof envelope>;
    try {
        command = envelope.parse(input);
        command.data = command.action === 'create' ? createData.parse(command.data) : command.action === 'approve_preview' ? z.strictObject({
            evidence: z.string().min(10).max(2000)
        }).parse(command.data) : z.strictObject({}).parse(command.data);
    }
    catch (error) {
        throw new PipelineError('pipeline_invalid_delivery_command: ' + (error instanceof Error ? error.message : 'invalid'));
    }
    const hash = createHash('sha256').update(canonicalPipeline(command)).digest('hex');
    const prior = await db.from('outbound_pipeline_receipts').select('payload_hash,actor,receipt').eq('request_id', command.request_id).maybeSingle();
    pipelineDatabaseError(prior.error);
    if (prior.data) {
        if (prior.data.payload_hash !== hash || prior.data.actor !== actor)
            throw new PipelineError('pipeline_idempotency_conflict');
        return prior.data.receipt;
    }
    if (command.action === 'create') {
        const d = command.data as z.infer<typeof createData>;
        const campaign = await db.from('compass_pipeline_campaigns').select('id,offer_revision_id,market_test_id,vertical_tags,location_tags,sequence_draft,status').eq('id', d.campaign_id).maybeSingle();
        pipelineDatabaseError(campaign.error);
        if (!campaign.data)
            throw new PipelineError('pipeline_campaign_required');
        const config = await db.from('compass_outbound_configs').select('recipe,settings').eq('campaign_id', d.campaign_id).maybeSingle();
        pipelineDatabaseError(config.error);
        if (!config.data)
            throw new PipelineError('pipeline_reviewed_campaign_settings_required');
        const offer = await db.from('compass_offer_revisions').select('snapshot').eq('id', campaign.data.offer_revision_id).maybeSingle();
        pipelineDatabaseError(offer.error);
        if (!offer.data)
            throw new PipelineError('pipeline_offer_revision_required');
        const context: Context = {
            campaign_id: d.campaign_id, offer_revision_id: campaign.data.offer_revision_id, market_test_id: campaign.data.market_test_id, offer: offer.data.snapshot, vertical: campaign.data.vertical_tags?.[0] || '', city: campaign.data.location_tags?.[0] || '', sequence: campaign.data.sequence_draft, recipe: config.data.recipe, settings: config.data.settings, pipeline: {
                manifest_id: command.manifest_id, list_id: d.list_id, workflow_version_id: d.workflow_version_id, template_version_id: d.template_version_id
            }
        };
        if (d.copy_mode === 'recipient_variables') {
            const template = await db.from('outbound_pipeline_templates').select('policy').eq('id', d.template_version_id).maybeSingle();
            pipelineDatabaseError(template.error);
            if (!template.data)
                throw new PipelineError('pipeline_template_required');
            context.pipeline!.copy_mode = d.copy_mode;
            context.pipeline!.source_sequence = context.sequence;
            context.sequence = pipelineVariableSequence(context.sequence, 1 + (template.data.policy.followups?.length || 0));
        }
        const errors = validatePipelineSendContext(context);
        if (errors.length)
            throw new PipelineError('pipeline_send_settings_invalid: ' + errors.join(', '));
        const result = await db.rpc('outbound_pipeline_delivery_create', {
            p_command: command, p_hash: hash, p_actor: actor, p_context: context
        });
        pipelineDatabaseError(result.error);
        return result.data;
    }
    const manifest = await readPipelineDelivery(db, command.manifest_id);
    if (manifest.revision !== command.expected_revision)
        throw new PipelineError('pipeline_revision_conflict');
    if (command.action === 'build_chunk') {
        const result = await db.from('outbound_pipeline_delivery_items').select('*').eq('manifest_id', manifest.id).eq('status', 'queued').order('id').limit(100);
        pipelineDatabaseError(result.error);
        const items = (result.data || []) as DeliveryItem[];
        if (!items.length)
            throw new PipelineError('pipeline_no_pending_delivery_items');
        const records = items.map(item => ({
            item_id: item.id, record: buildPipelineDeliveryItem(item, manifest.context)
        }));
        const saved = await db.rpc('outbound_pipeline_delivery_commit', {
            p_command: command, p_hash: hash, p_actor: actor, p_records: records
        });
        pipelineDatabaseError(saved.error);
        return saved.data;
    }
    let actionResult: unknown;
    if (command.action === 'approve') {
        if (!operator || !actor.startsWith('operator:'))
            throw new PipelineError('pipeline_operator_required');
        await currentBundle(db, manifest.id);
        const result = await operator.rpc('outbound_approve_preparation', {
            p_id: manifest.id, p_hash: manifest.hash
        });
        pipelineDatabaseError(result.error);
        actionResult = {
            approved: true, hash: manifest.hash
        };
    }
    else if (command.action === 'approve_preview') {
        if (!operator || !actor.startsWith('operator:') || !manifest.approved)
            throw new PipelineError('pipeline_operator_required');
        await currentBundle(db, manifest.id);
        actionResult = {
            provider_preview: {
                manifest_hash: manifest.hash, template_version_id: manifest.template_version_id, sequence_hash: createHash('sha256').update(canonicalPipeline(manifest.context.sequence)).digest('hex'), evidence: (command.data as {
                    evidence: string;
                }).evidence, reviewed_at: new Date().toISOString()
            }
        };
    }
    else if (command.action === 'configure_sequence') {
        if (!operator || !actor.startsWith('operator:'))
            throw new PipelineError('pipeline_operator_required');
        if (!manifest.approved || manifest.context.pipeline?.copy_mode !== 'recipient_variables')
            throw new PipelineError('pipeline_reviewed_variable_sequence_required');
        const bundle = await currentBundle(db, manifest.id);
        const campaign = await db.from('compass_pipeline_campaigns').select('instantly_campaign_id').eq('id', manifest.campaign_id).maybeSingle();
        pipelineDatabaseError(campaign.error);
        const campaignId = campaign.data?.instantly_campaign_id;
        if (!campaignId)
            throw new PipelineError('bind_paused_instantly_campaign_first');
        const key = await resolveInstantlyApiKey(db);
        if (!key)
            throw new PipelineError('instantly_readback_not_configured');
        const remote = await instantlyGetCampaign(key, campaignId);
        if (remote.status !== 0 && remote.status !== 2)
            throw new PipelineError('campaign_must_be_paused');
        const actual = await instantlyFetch<{
            items: unknown[];
        }>('/leads/list', key, {
            method: 'POST', body: JSON.stringify({
                campaign: campaignId, limit: 1, distinct_contacts: false
            })
        });
        if (!Array.isArray(actual.items) || actual.items.length)
            throw new PipelineError('pipeline_sequence_change_requires_empty_campaign');
        const pausedAgain = await instantlyGetCampaign(key, campaignId);
        if (pausedAgain.status !== 0 && pausedAgain.status !== 2)
            throw new PipelineError('campaign_must_be_paused');
        await currentBundle(db, manifest.id);
        await instantlyUpdateCampaign(key, campaignId, {
            sequences: instantlyExpected(bundle).sequences
        });
        const checked = await instantlyGetCampaign(key, campaignId);
        verifyPausedCampaign(bundle, checked as Record<string, unknown>);
        actionResult = {
            configured: true, campaign_id: campaignId, requires_selected_lead_preview: true
        };
    }
    else {
        actionResult = await reserveBrowserLoad(db, manifest.id);
    }
    const receipt = await db.rpc('outbound_pipeline_delivery_action_receipt', {
        p_command: command, p_hash: hash, p_actor: actor, p_result: actionResult
    });
    pipelineDatabaseError(receipt.error);
    return receipt.data;
}
export async function pipelineDeliveryArtifact(db: SupabaseClient, manifestId: string) { requirePipeline(); const m = await readPipelineDelivery(db, manifestId); if (!m.approved)
    throw new PipelineError('pipeline_operator_approval_required'); await reserveBrowserLoad(db, m.id); const gate = await db.rpc('outbound_pipeline_delivery_delta', {
    p_manifest_id: m.id, p_limit: 1
}); pipelineDatabaseError(gate.error); let after = ''; let keys: string[] | null = null; let buffer: Record<string, string>[] = []; let ended = false; const encoder = new TextEncoder(); const cell = (v: string) => '"' + v.replaceAll('"', '""') + '"'; const stream = new ReadableStream<Uint8Array>({
    async pull(controller) { try {
        if (ended)
            return;
        if (!buffer.length) {
            const result = await db.rpc('outbound_pipeline_delivery_delta', {
                p_manifest_id: m.id, p_after: after, p_limit: 100
            });
            pipelineDatabaseError(result.error);
            if (ended)
                return;
            if (!result.data?.length) {
                ended = true;
                controller.close();
                return;
            }
            after = result.data.at(-1)!.id;
            buffer = (result.data as DeliveryItem[]).map(row => row.record!.rendered!.values);
            if (!keys) {
                keys = Object.keys(buffer[0]);
                controller.enqueue(encoder.encode(keys.map(cell).join(',') + '\r\n'));
                return;
            }
        }
        const rows = buffer;
        buffer = [];
        controller.enqueue(encoder.encode(rows.map(row => keys!.map(key => cell(row[key] || '')).join(',') + '\r\n').join('')));
    }
    catch (error) {
        if (!ended) {
            ended = true;
            controller.error(error);
        }
    } }, cancel() { ended = true; }
}); return new Response(stream, {
    headers: {
        'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="paused-load-${m.id.replace(/[^a-zA-Z0-9_-]/g, '')}.csv"`, 'Cache-Control': 'private, no-store'
    }
}); }
