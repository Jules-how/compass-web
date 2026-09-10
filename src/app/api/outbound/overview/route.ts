import { requirePortalAccess } from "@/lib/portal-access";
import { portalAccessResponse, portalJson, requireSameOrigin } from "@/lib/portal-http";
import { loadOutboundOverview } from "@/lib/outbound-overview-server";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET() {
  try { await requirePortalAccess({ operator: true }); return portalJson(await loadOutboundOverview(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return portalAccessResponse(e) || portalJson({ error: "Outbound could not be refreshed. Retry to read the latest records." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const denied = requireSameOrigin(request); if (denied) return denied;
  try { await requirePortalAccess({ operator: true }); return portalJson(await loadOutboundOverview(true), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return portalAccessResponse(e) || portalJson({ error: "Outbound could not be refreshed. Previous evidence is retained." }, { status: 503 }); }
}
