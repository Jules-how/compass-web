import { handlePipelineRead, handlePipelineWrite, pipelineErrorResponse } from '@/lib/outbound-pipeline-http';
import { getPortalAdminClient } from '@/lib/portal-admin';
import { requirePortalAccess } from '@/lib/portal-access';
import { requireSameOrigin } from '@/lib/portal-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
    const origin = requireSameOrigin(request);
    if (origin)
        return origin;
    try {
        const { user } = await requirePortalAccess({
            operator: true
        });
        return await handlePipelineWrite(getPortalAdminClient(), request, 'operator:' + user.id);
    }
    catch (error) {
        return pipelineErrorResponse(error);
    }
}
