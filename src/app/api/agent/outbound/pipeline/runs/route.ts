import { handlePipelineRead, handlePipelineWrite, pipelineErrorResponse } from '@/lib/outbound-pipeline-http';
import { getPortalAdminClient } from '@/lib/portal-admin';
import { requireAgentAuth } from '@/lib/agent-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
    const auth = requireAgentAuth(request);
    if (auth)
        return auth;
    try {
        return await handlePipelineWrite(getPortalAdminClient(), request, 'agent');
    }
    catch (error) {
        return pipelineErrorResponse(error);
    }
}
