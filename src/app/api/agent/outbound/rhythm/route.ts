import { requireAgentAuth } from "@/lib/agent-auth";
import { getPortalAdminClient } from "@/lib/portal-admin";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { loadRhythm, saveRhythm } from "@/lib/outbound-rhythm-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson(
      await loadRhythm(
        getPortalAdminClient(),
        new URL(request.url).searchParams,
      ),
    );
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  const auth = requireAgentAuth(request);
  if (auth) return auth;
  try {
    return portalJson(
      await saveRhythm(
        getPortalAdminClient(),
        await readBoundedJson(request, 16000),
        "agent",
      ),
    );
  } catch (e) {
    return portalJson(
      { error: e instanceof Error ? e.message : "save_failed" },
      {
        status:
          e instanceof Error && /conflict|open_action/.test(e.message)
            ? 409
            : 400,
      },
    );
  }
}
