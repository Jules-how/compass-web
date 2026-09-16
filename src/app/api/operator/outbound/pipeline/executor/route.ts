import { requirePortalAccess } from "@/lib/portal-access";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { portalJson } from "@/lib/portal-http";
import { readOutboundExecutors } from "@/lib/outbound-executor-server";
import { pipelineErrorResponse } from "@/lib/outbound-pipeline-http";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requirePortalAccess({ operator: true });
    return portalJson(await readOutboundExecutors(getPortalAdminClient()));
  } catch (error) {
    return pipelineErrorResponse(error);
  }
}
