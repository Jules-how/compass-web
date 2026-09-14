import { getPortalAdminClient } from "@/lib/portal-admin";
import { z } from "zod";
import { requirePortalAccess } from "@/lib/portal-access";
import {
  portalAccessResponse,
  portalJson,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/portal-http";
import {
  plannerToken,
  googleConfigured,
  googleToken,
  googleRequest,
} from "@/lib/planner-google";
export const dynamic = "force-dynamic";
const eventSchema = z
  .object({
    calendarId: z.string().min(1).max(300),
    id: z
      .string()
      .regex(/^[a-v0-9]{5,1024}$/)
      .optional(),
    eventId: z.string().min(1).max(1024).optional(),
    etag: z.string().min(1).max(300).optional(),
    summary: z.string().trim().min(1).max(1000),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    taskId: z.string().max(200).optional(),
  })
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start),
    "End must follow start",
  );
export async function GET(request: Request) {
  try {
    await requirePortalAccess({ operator: true });
    const supabase = getPortalAdminClient();
    const refresh = await plannerToken(supabase);
    const q = new URL(request.url).searchParams;
    const kind = q.get("kind");
    if (kind === "status" || !refresh)
      return portalJson({
        configured: googleConfigured(),
        connected: Boolean(refresh),
        checkedAt: new Date().toISOString(),
      });
    const { access_token } = await googleToken({
      refresh_token: refresh,
      grant_type: "refresh_token",
    });
    if (kind === "mail") {
      const search = (q.get("q") || "in:inbox").slice(0, 1000);
      const pageToken = q.get("pageToken");
      const params = new URLSearchParams({
        maxResults: "20",
        q: search,
        ...(pageToken ? { pageToken } : {}),
      });
      const list = await googleRequest(
        access_token,
        `gmail/v1/users/me/messages?${params}`,
      );
      const messages = await Promise.all(
        (list.messages || []).map(async (m: { id: string }) => {
          const item = await googleRequest(
            access_token,
            `gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          );
          const headers = item.payload?.headers || [];
          const header = (name: string) =>
            headers.find(
              (h: { name: string }) =>
                h.name.toLowerCase() === name.toLowerCase(),
            )?.value || "";
          return {
            id: item.id,
            threadId: item.threadId,
            subject: header("Subject") || "(No subject)",
            from: header("From"),
            date: header("Date"),
            snippet: item.snippet || "",
            url: `https://mail.google.com/mail/u/0/#all/${item.threadId}`,
          };
        }),
      );
      return portalJson({
        messages,
        nextPageToken: list.nextPageToken || null,
      });
    }
    if (kind === "calendars") {
      let pageToken = "";
      const calendars = [];
      do {
        const data = await googleRequest(
          access_token,
          `calendar/v3/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
        );
        calendars.push(
          ...(data.items || []).map((c: Record<string, unknown>) => ({
            id: c.id,
            name: c.summary,
            color: c.backgroundColor,
            primary: c.primary,
            accessRole: c.accessRole,
          })),
        );
        pageToken = data.nextPageToken || "";
      } while (pageToken);
      return portalJson({ calendars });
    }
    const start = q.get("start"),
      end = q.get("end");
    if (
      !start ||
      !end ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start) ||
      Date.parse(end) - Date.parse(start) > 45 * 86400000
    )
      throw Error("Choose a date range of up to 45 days.");
    const calendarId = q.get("calendarId") || "primary";
    let pageToken = "";
    const events = [];
    do {
      const params = new URLSearchParams({
        timeMin: start,
        timeMax: end,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        ...(pageToken ? { pageToken } : {}),
      });
      const data = await googleRequest(
        access_token,
        `calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );
      events.push(
        ...(data.items || [])
          .filter((e: { status: string }) => e.status !== "cancelled")
          .map((e: Record<string, any>) => ({
            id: e.id,
            calendarId,
            etag: e.etag,
            title: e.summary || "(Untitled event)",
            start: e.start,
            end: e.end,
            location: e.location || "",
            url: e.htmlLink,
            blocking: e.transparency !== "transparent",
            taskId: e.extendedProperties?.private?.compassTaskId || null,
          })),
      );
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return portalJson({ events, checkedAt: new Date().toISOString() });
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Google is unavailable." },
        { status: 400 },
      )
    );
  }
}
export async function POST(request: Request) {
  const origin = requireSameOrigin(request);
  if (origin) return origin;
  try {
    await requirePortalAccess({ operator: true });
    const supabase = getPortalAdminClient();
    const input = eventSchema.parse(await readBoundedJson(request, 12000));
    const refresh = await plannerToken(supabase);
    if (!refresh) throw Error("Connect Google first.");
    const { access_token } = await googleToken({
      refresh_token: refresh,
      grant_type: "refresh_token",
    });
    const base = `calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
    if (input.eventId && !input.etag)
      throw Error("Refresh the event before changing it.");
    const event = {
      summary: input.summary,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      ...(input.taskId
        ? { extendedProperties: { private: { compassTaskId: input.taskId } } }
        : {}),
      ...(!input.eventId
        ? { id: input.id, visibility: "private", transparency: "opaque" }
        : {}),
    };
    if (!input.eventId && !input.id)
      throw Error("A stable event ID is required.");
    let result;
    try {
      result = await googleRequest(
        access_token,
        `${base}${input.eventId ? `/${encodeURIComponent(input.eventId)}` : ""}?sendUpdates=none`,
        {
          method: input.eventId ? "PATCH" : "POST",
          headers: input.etag ? { "If-Match": input.etag } : {},
          body: JSON.stringify(event),
        },
      );
    } catch (e) {
      if (!input.eventId && e instanceof Error && e.message.includes("(409)")) {
        result = await googleRequest(access_token, `${base}/${input.id}`);
        if (
          result.summary !== input.summary ||
          (result.start?.dateTime !== input.start &&
            Date.parse(result.start?.dateTime) !== Date.parse(input.start)) ||
          Date.parse(result.end?.dateTime) !== Date.parse(input.end)
        )
          throw Error(
            "An event with this ID already exists. Refresh the calendar.",
          );
      } else throw e;
    }
    return portalJson({ event: result });
  } catch (e) {
    return (
      portalAccessResponse(e) ||
      portalJson(
        { error: e instanceof Error ? e.message : "Unable to save the event." },
        { status: 400 },
      )
    );
  }
}
