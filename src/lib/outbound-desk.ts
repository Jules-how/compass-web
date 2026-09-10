export const OUTBOUND_DESK_IDS = [
  "overview",
  "notebook",
  "waves",
  "calendar",
  "timeline",
] as const;

export type OutboundDeskId = (typeof OUTBOUND_DESK_IDS)[number];

export const OUTBOUND_DESK_STORAGE_KEY = "compass.outbound.desk.v5";

export const DEFAULT_OUTBOUND_DESK: OutboundDeskId = "overview";

const LEGACY_DESKS = new Set(["pathways", "cassette", "runway", "factory"]);

export function parseOutboundDesk(
  raw: string | null | undefined,
): OutboundDeskId {
  const value = (raw || "").trim().toLowerCase();
  if (LEGACY_DESKS.has(value)) return DEFAULT_OUTBOUND_DESK;
  return (OUTBOUND_DESK_IDS as readonly string[]).includes(value)
    ? (value as OutboundDeskId)
    : DEFAULT_OUTBOUND_DESK;
}

export function readOutboundDesk(): OutboundDeskId {
  if (typeof window === "undefined") return DEFAULT_OUTBOUND_DESK;
  try {
    return parseOutboundDesk(
      window.localStorage.getItem(OUTBOUND_DESK_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_OUTBOUND_DESK;
  }
}

export function writeOutboundDesk(desk: OutboundDeskId): OutboundDeskId {
  const next = parseOutboundDesk(desk);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(OUTBOUND_DESK_STORAGE_KEY, next);
    } catch {
      // quota / private mode
    }
  }
  return next;
}
