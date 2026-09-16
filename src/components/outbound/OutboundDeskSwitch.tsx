"use client";

import { cn } from "@/lib/utils";
import type { OutboundDeskId } from "@/lib/outbound-desk";

const DESKS: Array<{ id: OutboundDeskId; label: string }> = [
  { id: "workflow", label: "Leads" },
  { id: "overview", label: "Overview" },
  { id: "calendar", label: "Test planner" },
];

export function OutboundDeskSwitch({
  value,
  onChange,
}: {
  value: OutboundDeskId;
  onChange: (next: OutboundDeskId) => void;
}) {
  return (
    <div className="compass-seg" role="group" aria-label="Outbound desk">
      {DESKS.map((desk) => {
        const active = value === desk.id;
        return (
          <button
            key={desk.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(desk.id)}
            className={cn(
              "compass-seg-btn",
              active && "compass-seg-btn-active",
            )}
          >
            {desk.label}
          </button>
        );
      })}
    </div>
  );
}
