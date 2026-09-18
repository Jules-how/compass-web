import { handleCopyControlGet, handleCopyControlPost } from '@/lib/copy-control-server';
import { pipelineErrorResponse } from '@/lib/outbound-pipeline-http';
import { getPortalAdminClient } from '@/lib/portal-admin';
import { requireAgentAuth } from '@/lib/agent-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  const auth = requireAgentAuth(request); if (auth) return auth;
  try {
    return await handleCopyControlGet(getPortalAdminClient(), request);
  } catch (error) { return pipelineErrorResponse(error); }
}
export async function POST(request: Request) {
  const auth = requireAgentAuth(request); if (auth) return auth;
  try {
    return await handleCopyControlPost(getPortalAdminClient(), request, 'agent');
  } catch (error) { return pipelineErrorResponse(error); }
}
