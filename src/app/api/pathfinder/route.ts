import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import {
  loadPathfinder,
  executePathfinder,
  pathfinderError,
} from "@/lib/pathfinder/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requirePortalAccess({ operator: true });
    return portalJson(await loadPathfinder());
  } catch (e) {
    return pathfinderError(e);
  }
}
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    return portalJson({
      result: await executePathfinder(
        await readBoundedJson(request),
        "operator",
        supabase,
      ),
    });
  } catch (e) {
    return pathfinderError(e);
  }
}
