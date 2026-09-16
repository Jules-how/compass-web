import { handlePipelineRead, handlePipelineWrite, pipelineErrorResponse } from '@/lib/outbound-pipeline-http';
import { getPortalAdminClient } from '@/lib/portal-admin';
import { requirePortalAccess } from '@/lib/portal-access';
import { requireSameOrigin } from '@/lib/portal-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    try {
        const { supabase } = await requirePortalAccess({
            operator: true
        });
        return await handlePipelineRead(supabase, request, true);
    }
    catch (error) {
        return pipelineErrorResponse(error);
    }
}
