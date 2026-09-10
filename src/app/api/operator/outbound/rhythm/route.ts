import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { loadRhythm, saveRhythm } from "@/lib/outbound-rhythm-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    return portalJson(
      await loadRhythm(supabase, new URL(request.url).searchParams),
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ??
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
      await saveRhythm(
        supabase,
        await readBoundedJson(request, 16000),
        "operator",
      ),
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ??
      portalJson(
        { error: e instanceof Error ? e.message : "save_failed" },
        {
          status:
            e instanceof Error && /conflict|open_action/.test(e.message)
              ? 409
              : 400,
        },
      )
    );
  }
}
