"use client";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { timelineEntries, goalWorkspace } from "@/lib/pathfinder/workspace.mjs";
import type { PathfinderData } from "@/lib/pathfinder/types";
const DAY = 86400000;
const dayTime = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const shortDate = (date: string | number) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(typeof date === "string" ? dayTime(date) : date));
export type TimelineRange = { span: number; offset: number; undatedOpen: boolean };
export function PathfinderTimeline({
  data,
  goalId,
  onOpen,
  onAdd,
  range: suppliedRange,
  onRangeChange,
}: {
  data: PathfinderData;
  goalId: string;
  onOpen: (kind: string, id: string) => void;
  onAdd: () => void;
  range?: TimelineRange;
  onRangeChange?: (range: TimelineRange) => void;
}) {
  const [localRange, setLocalRange] = useState<TimelineRange>({ span: 90, offset: 0, undatedOpen: false });
  const range = suppliedRange ?? localRange;
  const { span, offset, undatedOpen } = range;
  const changeRange = (patch: Partial<TimelineRange>) => {
    const next = { ...range, ...patch };
    setLocalRange(next);
    onRangeChange?.(next);
  };
  const all = timelineEntries(goalWorkspace(data, goalId));
  const today = dayTime(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(
      new Date(data.readAt),
    ),
  );
  const dated = all.filter((item) => item.date);
  const undated = all.filter((item) => !item.date);
  const allDates = dated.flatMap((item) => [
    dayTime(item.date),
    ...(item.start ? [dayTime(item.start)] : []),
  ]);
  const start =
    span === 0
      ? Math.min(today, ...allDates) - 3 * DAY
      : today + (offset * span - 3) * DAY;
  const end =
    span === 0
      ? Math.max(today + 14 * DAY, ...allDates) + 3 * DAY
      : start + span * DAY;
  const position = (date: number) =>
    Math.max(0, Math.min(100, ((date - start) / (end - start)) * 100));
  const visible = dated.filter(
    (item) =>
      dayTime(item.date) >= start &&
      (item.start ? dayTime(item.start) : dayTime(item.date)) <= end,
  );
  const ticks = Array.from(
    { length: 5 },
    (_, index) => start + ((end - start) * index) / 4,
  );
  return (
    <section className="pathfinder-timeline" aria-label="Planning timeline">
      <header>
        <div>
          <CalendarDays size={16} aria-hidden="true" />
          <h2>Timeline</h2>
          <span>{dated.length} dated items</span>
        </div>
        <div className="timeline-controls">
          <div role="group" aria-label="Timeline range">
            {[
              [30, "Month"],
              [90, "Quarter"],
              [0, "All dates"],
            ].map(([days, label]) => (
              <button
                key={days}
                aria-pressed={span === days}
                onClick={() => {
                  changeRange({ span: Number(days), offset: 0 });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="folio-icon-button"
            aria-label="Previous time period"
            disabled={span === 0}
            onClick={() => changeRange({ offset: offset - 1 })}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            className="folio-icon-button"
            aria-label="Next time period"
            disabled={span === 0}
            onClick={() => changeRange({ offset: offset + 1 })}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button className="compass-btn-ghost" onClick={onAdd}>
            <Plus size={14} aria-hidden="true" />
            Milestone
          </button>
        </div>
      </header>
      <div className="timeline-chart">
        <div className="timeline-axis">
          <span>
            {shortDate(start)} – {shortDate(end)}
          </span>
          <div>
            {ticks.map((tick, i) => (
              <span key={tick} style={{ left: `${i * 25}%` }}>
                {shortDate(tick)}
              </span>
            ))}
          </div>
        </div>
        <div className="timeline-rows">
          {visible.map((item) => (
            <div
              className={`timeline-row is-${item.kind}`}
              key={`${item.kind}:${item.id}`}
            >
              <button
                className="timeline-row-label"
                onClick={() => onOpen(item.kind, item.id)}
              >
                <span>
                  {item.complete ? (
                    <Check size={12} aria-hidden="true" />
                  ) : item.kind === "checkpoint" ? (
                    "◇"
                  ) : item.kind === "goal" ? (
                    "◎"
                  ) : (
                    "○"
                  )}
                </span>
                <span className="timeline-item-caption"><strong>{item.title}</strong><small>{shortDate(item.date)} · {item.complete ? "Complete" : "Open"}</small></span>
              </button>
              <div className="timeline-track">
                {ticks.map((tick) => (
                  <i key={tick} style={{ left: `${position(tick)}%` }} />
                ))}
                {today >= start && today <= end && (
                  <i
                    className="timeline-today"
                    style={{ left: `${position(today)}%` }}
                  />
                )}
                <button
                  className={`timeline-marker ${item.start ? "is-duration" : ""} ${item.complete ? "is-complete" : ""}`}
                  onClick={() => onOpen(item.kind, item.id)}
                  aria-label={`${item.title}, ${shortDate(item.date)}${item.complete ? ", complete" : ""}`}
                  title={`${item.title} · ${shortDate(item.date)}`}
                  style={
                    item.start
                      ? {
                          left: `${position(dayTime(item.start))}%`,
                          width: `${Math.max(1, position(dayTime(item.date)) - position(dayTime(item.start)))}%`,
                        }
                      : { left: `${position(dayTime(item.date))}%` }
                  }
                >
                  <span>
                    {item.kind === "checkpoint"
                      ? "◆"
                      : item.kind === "goal"
                        ? "◎"
                        : "•"}
                  </span>
                </button>
              </div>
              <time className="timeline-mobile-date">
                {shortDate(item.date)}
              </time>
            </div>
          ))}
          {!visible.length && (
            <p className="timeline-empty">
              {dated.length
                ? "No dated work in this window. Choose All dates to see the full plan."
                : "No dated milestones or actions are connected. Add a milestone or open undated work to add dates."}
            </p>
          )}
        </div>
      </div>
      <footer>
        <span>
          <i />
          Today · dates come from your goals and work
        </span>
        {undated.length > 0 && (
          <button
            aria-expanded={undatedOpen}
            onClick={() => changeRange({ undatedOpen: !undatedOpen })}
          >
            {undated.length} without a date{" "}
            <span aria-hidden="true">{undatedOpen ? "−" : "+"}</span>
          </button>
        )}
      </footer>
      {undatedOpen && (
        <ul className="timeline-undated">
          {undated.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <button onClick={() => onOpen(item.kind, item.id)}>
                {item.title}
                <span>
                  Add a date <ChevronRight size={13} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
