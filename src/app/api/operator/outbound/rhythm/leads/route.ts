import { z } from "zod";
import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { commitLeadRows } from "@/lib/lead-commit";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    const { supabase } = await requirePortalAccess({ operator: true });
    const row = z
      .object({
        company: z.string().trim().min(1).max(250),
        phone: z.string().trim().min(7).max(40),
        phone_source_url: z.string().url(),
        city: z.string().trim().min(1).max(100),
      })
      .parse(await readBoundedJson(request, 4000));
    return portalJson(
      await commitLeadRows(supabase, {
        rows: [row],
        source: "operator_published_phone",
      }),
    );
  } catch (e) {
    return (
      portalAccessResponse(e) ??
      portalJson(
        { error: e instanceof Error ? e.message : "save_failed" },
        { status: 400 },
      )
    );
  }
}
