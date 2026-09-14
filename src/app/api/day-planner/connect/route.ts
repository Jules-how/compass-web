import { NextResponse, type NextRequest } from "next/server";
import { requirePortalAccess } from "@/lib/portal-access";
import { portalAccessResponse, portalJson } from "@/lib/portal-http";
import { googleConfigured, PLANNER_SCOPES } from "@/lib/planner-google";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requirePortalAccess({ operator: true });
    if (!googleConfigured())
      return portalJson(
        {
          error:
            "Google OAuth credentials must be configured on the Compass server before connecting.",
        },
        { status: 503 },
      );
    const state = crypto.randomUUID();
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      redirect_uri: `${request.nextUrl.origin}/api/day-planner/callback`,
      response_type: "code",
      scope: PLANNER_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    const r = NextResponse.redirect(u);
    r.cookies.set("compass_planner_oauth", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 600,
      path: "/",
    });
    return r;
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson({ error: "Unable to connect Google." }, { status: 500 })
    );
  }
}
