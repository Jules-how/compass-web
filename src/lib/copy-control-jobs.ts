import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { copySignalInputs, type CopyRenderContext } from './copy-control';
import { renderPipelineTemplate, type SignalDefinition, type SignalObservation, type TemplatePolicy } from './outbound-pipeline';
import { pipelineDatabaseError } from './outbound-pipeline-server';
import { PipelineError } from './outbound-pipeline-schema';
import type { PipelineJob, PipelineJobItem } from './outbound-pipeline-jobs';
export type FrozenCopyScopes = Record<string, { workflow_version_id: string; signals: SignalDefinition[] }>;
export async function freezeCopyScopes(db: SupabaseClient, listIds: string[]): Promise<FrozenCopyScopes> {
  const result: FrozenCopyScopes = {};
  for (const listId of [...new Set(listIds)]) {
    const list = await db.from('compass_lead_lists').select('workflow_version_id').eq('id', listId).maybeSingle(); pipelineDatabaseError(list.error);
    if (!list.data?.workflow_version_id) throw new PipelineError('pipeline_workflow_required');
    const workflow = await db.from('outbound_pipeline_workflows').select('id,policy').eq('id', list.data.workflow_version_id).maybeSingle(); pipelineDatabaseError(workflow.error);
    if (!workflow.data) throw new PipelineError('pipeline_workflow_not_found');
    result[listId] = { workflow_version_id: workflow.data.id, signals: workflow.data.policy.signals };
  }
  return result;
}
export async function renderCopyJobItems(db: SupabaseClient, job: PipelineJob, items: PipelineJobItem[], actor: string, data: { overwrite_manual?: boolean; generated?: Record<string, Record<string, string>> }) {
  const policy = job.config.policy as TemplatePolicy, scopes = job.config.copy_control_scopes as FrozenCopyScopes | undefined;
  if (!scopes) throw new PipelineError('pipeline_copy_snapshot_incomplete_create_new_preview');
  if (data.generated && actor !== 'agent') throw new PipelineError('pipeline_ai_executor_required');
  const observations = new Map<string, SignalObservation>();
  const refs = [...new Set(items.flatMap(item => item.payload.input_refs || []))];
  for (let i = 0; i < refs.length; i += 100) {
    const result = await db.from('outbound_pipeline_signals').select('*').in('id', refs.slice(i, i + 100)).limit(100); pipelineDatabaseError(result.error);
    for (const row of result.data || []) observations.set(row.id, row as SignalObservation);
  }
  if (refs.some(id => !observations.has(id))) throw new PipelineError('pipeline_frozen_evidence_not_found');
  const priorIds = items.map(item => item.payload.previous_id).filter((id): id is string => Boolean(id));
  const prior = priorIds.length ? await db.from('outbound_pipeline_drafts').select('id,copy,provenance').in('id', priorIds).limit(100) : { data: [], error: null };
  pipelineDatabaseError(prior.error);
  const manualIds = new Set((prior.data || []).filter(row => row.provenance === 'manual' || row.copy?.copy_control?.human_edited).map(row => row.id));
  const results = items.map(item => {
    if ((item.payload.manual || manualIds.has(item.payload.previous_id)) && !data.overwrite_manual) return { item_id: item.id, status: 'failed', reason: 'Protected manual edit: unchanged. Explicitly allow replacement in a new preview to revise it.' };
    const listId = item.payload.list_id!, scope = scopes[listId];
    if (!scope) return { item_id: item.id, status: 'failed', reason: 'Frozen workflow scope missing' };
    const companyId = item.payload.company_id!;
    const inputs = copySignalInputs((item.payload.input_refs || []).map(id => observations.get(id)!), scope.signals, { company_id: companyId, workflow_version_id: scope.workflow_version_id });
    // Frozen value/evidence correspondence is mandatory; no live research fills gaps during apply.
    if (Object.entries(item.payload.signals || {}).some(([id, value]) => inputs.values[id] !== value)) return { item_id: item.id, status: 'failed', reason: 'Frozen signal values and evidence differ' };
    const context: CopyRenderContext = { list_id: listId, recipient_id: item.payload.recipient_id, company_id: companyId, workflow_version_id: scope.workflow_version_id, template_version_id: String(job.config.template_version_id), evidence: inputs.signals, generated: data.generated?.[item.id] };
    const rendered = renderPipelineTemplate(policy, item.payload.signals || {}, context);
    if (rendered.missing.length && rendered.missing.every(reason => reason.startsWith('AI generation required:'))) return null;
    return rendered.missing.length ? { item_id: item.id, status: 'failed', reason: rendered.missing.join('; ') } : { item_id: item.id, status: 'applied', copy: rendered.copy };
  }).filter((result): result is NonNullable<typeof result> => Boolean(result));
  if (!results.length) throw new PipelineError('pipeline_ai_executor_required_pending_items_unchanged');
  return results;
}
