import { requireAgentAuth } from '@/lib/agent-auth';
import { portalJson } from '@/lib/portal-http';
import { sourcingCatalog } from '@/lib/outbound-sourcing';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const error = requireAgentAuth(request);
  if (error) return error;
  return portalJson(sourcingCatalog);
}
