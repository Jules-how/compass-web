import { requirePortalAccess } from '@/lib/portal-access';
import { portalJson } from '@/lib/portal-http';
import { pipelineErrorResponse } from '@/lib/outbound-pipeline-http';
import { readMarketIndex } from '@/lib/outbound-market-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'list_id')) return portalJson({ error: 'pipeline_invalid_market_scope' }, { status: 422 });
    return portalJson(await readMarketIndex(supabase, params.get('list_id') || ''));
  } catch (error) { return pipelineErrorResponse(error); }
}
