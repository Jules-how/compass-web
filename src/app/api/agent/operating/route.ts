import { requireAgentAuth } from "@/lib/agent-auth";
import { portalJson, readBoundedJson } from "@/lib/portal-http";
import { loadOperatingDay, executeOperating } from "@/lib/operating-server";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  const denied = requireAgentAuth(request);
  if (denied) return denied;
  try {
    return portalJson(
      await loadOperatingDay(
        new URL(request.url).searchParams.get("day") || undefined,
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
  const denied = requireAgentAuth(request);
  if (denied) return denied;
  try {
    return portalJson(
      await executeOperating(await readBoundedJson(request, 100000), "agent"),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "save_failed";
    return portalJson(
      { error: message },
      { status: /conflict|reused/.test(message) ? 409 : 400 },
    );
  }
}
