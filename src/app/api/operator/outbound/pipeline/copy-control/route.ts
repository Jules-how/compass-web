import { handleCopyControlGet, handleCopyControlPost } from '@/lib/copy-control-server';
import { pipelineErrorResponse } from '@/lib/outbound-pipeline-http';
import { getPortalAdminClient } from '@/lib/portal-admin';
import { requirePortalAccess } from '@/lib/portal-access';
import { requireSameOrigin } from '@/lib/portal-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const access = await requirePortalAccess({ operator: true });
    return await handleCopyControlGet(access.supabase, request);
  } catch (error) { return pipelineErrorResponse(error); }
}
export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  try {
    const access = await requirePortalAccess({ operator: true });
    return await handleCopyControlPost(getPortalAdminClient(), request, 'operator:' + access.user.id);
  } catch (error) { return pipelineErrorResponse(error); }
}
