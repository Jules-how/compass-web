import { requireAgentAuth } from "@/lib/agent-auth";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { bridgeLegacyCrm } from "@/lib/crm-legacy-server";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { crmErrorResponse } from "@/lib/crm-research-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson(
      await bridgeLegacyCrm(
        getPortalAdminClient(),
        await readBoundedJson(request, 16384),
        "agent",
      ),
    );
  } catch (error) {
    return crmErrorResponse(error);
  }
}
