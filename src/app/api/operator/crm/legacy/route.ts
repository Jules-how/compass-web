import { requirePortalAccess } from "@/lib/portal-access";
import { requireSameOrigin } from "@/lib/portal-http";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { bridgeLegacyCrm } from "@/lib/crm-legacy-server";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { crmErrorResponse } from "@/lib/crm-research-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { user } = await requirePortalAccess({ operator: true });
    return portalJson(
      await bridgeLegacyCrm(
        getPortalAdminClient(),
        await readBoundedJson(request, 16384),
        "operator:" + user.id,
      ),
    );
  } catch (error) {
    return crmErrorResponse(error);
  }
}
