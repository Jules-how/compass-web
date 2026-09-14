import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/ad-token-crypto";
export const PLANNER_GOOGLE_TOKEN = "integrations.planner_google.refresh_token";
export const PLANNER_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];
export const googleConfigured = () =>
  Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  );
export async function plannerToken(db: SupabaseClient) {
  const { data, error } = await db
    .from("compass_settings")
    .select("value")
    .eq("id", PLANNER_GOOGLE_TOKEN)
    .maybeSingle();
  if (error) throw Error("Unable to read Google connection.");
  return data?.value ? decryptSecret(data.value) : null;
}
export async function savePlannerToken(db: SupabaseClient, token: string) {
  const stamp = new Date().toISOString();
  const { error } = await db
    .from("compass_settings")
    .upsert({
      id: PLANNER_GOOGLE_TOKEN,
      value: encryptSecret(token),
      scope: "integrations",
      is_secret: 1,
      updated_at: stamp,
      mirrored_at: stamp,
    });
  if (error) throw Error("Unable to save Google connection.");
}
export async function googleToken(params: Record<string, string>) {
  if (!googleConfigured())
    throw Error(
      "Google connection needs OAuth credentials configured on the server.",
    );
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      ...params,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok)
    throw Error("Google connection expired or was denied. Reconnect Google.");
  return data as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
  };
}
export async function googleRequest(
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    if (response.status === 412)
      throw Error(
        "This event changed in Google Calendar. Refresh before editing.",
      );
    if (response.status === 403)
      throw Error(
        "Google did not allow this action. Check calendar permissions or reconnect Google.",
      );
    if (response.status === 401) throw Error("Reconnect Google to continue.");
    throw Error(`Google request failed (${response.status}). Try refreshing.`);
  }
  return response.json();
}
