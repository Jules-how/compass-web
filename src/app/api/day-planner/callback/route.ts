import { getPortalAdminClient } from "@/lib/portal-admin";
import { NextResponse, type NextRequest } from "next/server";
import { requirePortalAccess } from "@/lib/portal-access";
import {
  googleToken,
  savePlannerToken,
  PLANNER_SCOPES,
} from "@/lib/planner-google";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let result = "failed";
  try {
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    if (
      !state ||
      state !== request.cookies.get("compass_planner_oauth")?.value ||
      !code
    )
      throw Error("Invalid OAuth response");
    await requirePortalAccess({ operator: true });
    const supabase = getPortalAdminClient();
    const token = await googleToken({
      code,
      redirect_uri: `${request.nextUrl.origin}/api/day-planner/callback`,
      grant_type: "authorization_code",
    });
    if (
      !token.refresh_token ||
      !PLANNER_SCOPES.every((s) => token.scope?.split(" ").includes(s))
    )
      throw Error("Google permissions missing");
    await savePlannerToken(supabase, token.refresh_token);
    result = "connected";
  } catch {
    /* Report a safe status without exposing OAuth tokens. */
  }
  const response = NextResponse.redirect(
    new URL(`/calendar?google=${result}`, request.nextUrl.origin),
  );
  response.cookies.set("compass_planner_oauth", "", { path: "/", maxAge: 0 });
  return response;
}
