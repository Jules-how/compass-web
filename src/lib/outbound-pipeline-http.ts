import { portalAccessResponse, portalJson, readBoundedJson } from './portal-http';
import { applyPipelineCommand, readPipeline, pipelineCapabilities } from './outbound-pipeline-server';
import type { SupabaseClient } from '@supabase/supabase-js';
export function pipelineErrorResponse(error: unknown) {
    const access = portalAccessResponse(error);
    if (access)
        return access;
    const message = error instanceof Error ? error.message : 'pipeline_operation_failed';
    const status = /operator_required/.test(message) ? 403 : /disabled|read_only|schema_unavailable/.test(message) ? 503 : /conflict|immutable|duplicate/.test(message) ? 409 : /not_found/.test(message) ? 404 : /too large/.test(message) ? 413 : /pipeline_|invalid|violates/.test(message) ? 422 : 500;
    return portalJson({
        error: message
    }, {
        status
    });
}
export async function handlePipelineRead(db: SupabaseClient, request: Request, capabilities = false) {
    return portalJson(capabilities ? await pipelineCapabilities(db) : await readPipeline(db, new URL(request.url).searchParams));
}
export async function handlePipelineWrite(db: SupabaseClient, request: Request, actor: string) {
    return portalJson(await applyPipelineCommand(db, await readBoundedJson(request, 256 * 1024), actor));
}
