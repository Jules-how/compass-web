import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { loadOperatingDay, executeOperating } from "@/lib/operating-server";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    await requirePortalAccess({ operator: true });
    return portalJson(
      await loadOperatingDay(
        new URL(request.url).searchParams.get("day") || undefined,
      ),
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "load_failed" },
        { status: 500 },
      )
    );
  }
}
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    return portalJson(
      await executeOperating(
        await readBoundedJson(request, 100000),
        "operator",
        supabase,
      ),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "save_failed";
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: message },
        { status: /conflict|reused/.test(message) ? 409 : 400 },
      )
    );
  }
}
