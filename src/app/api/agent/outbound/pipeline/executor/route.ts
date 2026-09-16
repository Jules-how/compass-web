import { requireAgentAuth } from "@/lib/agent-auth";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import {
  readOutboundExecutors,
  writeOutboundExecutor,
} from "@/lib/outbound-executor-server";
import { pipelineErrorResponse } from "@/lib/outbound-pipeline-http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson(await readOutboundExecutors(getPortalAdminClient()));
  } catch (error) {
    return pipelineErrorResponse(error);
  }
}
export async function POST(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson(
      await writeOutboundExecutor(
        getPortalAdminClient(),
        await readBoundedJson(request, 65536),
        "agent",
      ),
    );
  } catch (error) {
    return pipelineErrorResponse(error);
  }
}
