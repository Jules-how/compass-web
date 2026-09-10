import { requireAgentAuth } from "@/lib/agent-auth";
import { portalJson } from "@/lib/portal-http";
import { loadOutboundOverview } from "@/lib/outbound-overview-server";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  const denied = requireAgentAuth(request); if (denied) return denied;
  try { return portalJson(await loadOutboundOverview(request.headers.get("x-compass-fresh") === "1"), { headers: { "Cache-Control": "no-store" } }); }
  catch { return portalJson({ error: "Outbound could not be read. Do not substitute cached campaign intent for provider state." }, { status: 503 }); }
}
