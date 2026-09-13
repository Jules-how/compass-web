import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import { notebookFor, saveNotebook } from "@/lib/goal-notebook-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requirePortalAccess({ operator: true });
    const q = new URL(request.url).searchParams;
    return portalJson({
      record: await notebookFor(q.get("kind") || "", q.get("id") || ""),
    });
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Notebook unavailable." },
        { status: 400 },
      )
    );
  }
}
export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    await requirePortalAccess({ operator: true });
    return portalJson({
      record: await saveNotebook(
        (await readBoundedJson(request, 220000)) as Record<string, any>,
        "operator",
      ),
    });
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Notebook not saved." },
        { status: 409 },
      )
    );
  }
}
