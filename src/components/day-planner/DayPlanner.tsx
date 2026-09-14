"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Play,
  Pause,
  Clock,
  Flag,
  MessageSquare,
  Sun,
  Sunset,
  Target,
  Archive,
  Search,
  Settings,
  Mail,
  RefreshCw,
  Check,
  ArrowUp,
  ArrowDown,
  GripVertical,
  CalendarCheck,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { CompassTask, CompassProject } from "@/lib/types";
import type { PlannerData, PlannerTask } from "@/lib/day-planner-schema";
import {
  dayKey,
  addDays,
  clock,
  duration,
  parseDuration,
  minutes,
  minuteInZone,
  zonedInstant,
  projectTasks,
  elapsedSeconds,
  EMPTY_PLANNER,
  layoutOverlaps,
} from "@/lib/day-planner.mjs";
import { workFetch } from "@/lib/workspace-change";
import { PlannerNotes } from "./PlannerNotes";
import "./day-planner.css";
type RecordState = { revision: number; data: PlannerData };
type EventItem = {
  id: string;
  calendarId: string;
  etag: string;
  title: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  location?: string;
  url?: string;
  blocking: boolean;
  taskId?: string;
};
type Cal = {
  id: string;
  name: string;
  color: string;
  primary?: boolean;
  accessRole: string;
};
type MailItem = {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  url: string;
};
type View = "board" | "day" | "three" | "weekdays" | "week" | "month";
type Mode =
  | "planner"
  | "today"
  | "focus"
  | "planning"
  | "shutdown"
  | "highlights"
  | "weekly"
  | "review"
  | "backlog"
  | "archive";
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await workFetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Unable to save. Please try again.");
  return data;
}
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const initial =
      ref.current?.querySelector<HTMLElement>(
        'input[aria-label="Task title"]',
      ) || ref.current?.querySelector<HTMLElement>("input,textarea,select");
    initial?.focus();
    return () => {
      prev?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dp-dialog ${wide ? "dp-dialog-wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dp-dialog-head">
        <span>{title}</span>
        <button aria-label={`Close ${title}`} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function DayPlanner() {
  const [record, setRecord] = useState<RecordState | null>(null),
    recordRef = useRef<RecordState | null>(null);
  const [tasks, setTasks] = useState<CompassTask[]>([]),
    [subtasks, setSubtasks] = useState<CompassTask[]>([]),
    [projects, setProjects] = useState<CompassProject[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [notice, setNotice] = useState(""),
    [date, setDate] = useState(() => dayKey()),
    [view, setView] = useState<View>("board"),
    [mode, setMode] = useState<Mode>("planner"),
    [search, setSearch] = useState(""),
    [channel, setChannel] = useState("all"),
    [editing, setEditing] = useState<CompassTask | "new" | null>(null),
    [newDay, setNewDay] = useState<string | null>(null),
    [newStart, setNewStart] = useState<number | null>(null),
    [focusId, setFocusId] = useState<string | null>(null),
    [now, setNow] = useState(Date.now()),
    [breakUntil, setBreakUntil] = useState<number | null>(null),
    [settings, setSettings] = useState(false),
    [step, setStep] = useState(0),
    [mailOpen, setMailOpen] = useState(false),
    [mails, setMails] = useState<MailItem[]>([]),
    [mailSearch, setMailSearch] = useState("in:inbox"),
    [mailNext, setMailNext] = useState<string | null>(null),
    [mailLoading, setMailLoading] = useState(false),
    [mailError, setMailError] = useState(""),
    [connected, setConnected] = useState(false),
    [configured, setConfigured] = useState(false),
    [calendars, setCalendars] = useState<Cal[]>([]),
    [selectedCalendars, setSelectedCalendars] = useState<string[]>(["primary"]),
    [targetCalendar, setTargetCalendar] = useState("primary"),
    [events, setEvents] = useState<EventItem[]>([]),
    [googleError, setGoogleError] = useState(""),
    [googleLoading, setGoogleLoading] = useState(false),
    [eventEdit, setEventEdit] = useState<EventItem | null>(null),
    [googleRefresh, setGoogleRefresh] = useState(0),
    [goals, setGoals] = useState<{ id: string; data: { title: string } }[]>([]);
  const state = useMemo(() => {
    const base = record?.data || (EMPTY_PLANNER as PlannerData);
    const meta = { ...base.tasks };
    for (const [id, m] of Object.entries(meta)) {
      if (!m.eventId) continue;
      const event = events.find(
        (e) => e.id === m.eventId && e.calendarId === m.calendarId,
      );
      if (event?.start.dateTime && event.end.dateTime)
        meta[id] = {
          ...m,
          day: dayKey(event.start.dateTime),
          start: minuteInZone(event.start.dateTime),
          planned: Math.round(
            (Date.parse(event.end.dateTime) -
              Date.parse(event.start.dateTime)) /
              60000,
          ),
        };
    }
    return { ...base, tasks: meta };
  }, [record, events]);
  const load = useCallback(async () => {
    try {
      const [p, t, g] = await Promise.all([
        api<RecordState>("/api/day-planner"),
        api<{
          topTasks: CompassTask[];
          subtasks: CompassTask[];
          projects: CompassProject[];
        }>("/api/tasks"),
        api<{ configured: boolean; connected: boolean }>(
          "/api/day-planner/google?kind=status",
        ),
      ]);
      recordRef.current = p;
      setRecord(p);
      setTasks(t.topTasks);
      setSubtasks(t.subtasks);
      setProjects(t.projects);
      setConfigured(g.configured);
      setConnected(g.connected);
      setError("");
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, []);
  useEffect(() => {
    void load();
    void api<{ records: { id: string; data: { title: string } }[] }>(
      "/api/planning?kind=goal",
    )
      .then((r) => setGoals(r.records))
      .catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const command = async (c: unknown) => {
    if (!recordRef.current) throw Error("Wait for the planner to load.");
    const r = await api<RecordState>("/api/day-planner", {
      revision: recordRef.current.revision,
      requestId: crypto.randomUUID(),
      command: c,
    });
    recordRef.current = r;
    setRecord(r);
    return r;
  };
  const patchMeta = async (id: string, patch: PlannerTask) => {
    await command({ action: "task", id, patch });
  };
  const patchTask = async (t: CompassTask, patch: Partial<CompassTask>) => {
    const updated = await api<CompassTask>(
      `/api/tasks/${encodeURIComponent(t.id)}`,
      { ...patch, expected_updated_at: t.updated_at },
      "PATCH",
    );
    if (t.parent_task_id)
      setSubtasks((s) => s.map((x) => (x.id === t.id ? updated : x)));
    else setTasks((s) => s.map((x) => (x.id === t.id ? updated : x)));
    return updated;
  };
  const newTask = async (
    title: string,
    day: string | null,
    parent?: string,
    notes?: string,
  ) => {
    const t = await api<CompassTask>("/api/tasks", {
      title,
      notes: notes || null,
      status: "not-started",
      parent_task_id: parent || null,
      source: "calendar",
    });
    if (parent) setSubtasks((s) => [...s, t]);
    else setTasks((s) => [...s, t]);
    if (!parent) {
      try {
        await patchMeta(t.id, {
          day,
          channel: "work",
          rank: Date.now(),
          planned: null,
        });
      } catch (e) {
        setEditing(t);
        throw Error(
          `The task was created, but its calendar details were not saved. Open it to retry. ${(e as Error).message}`,
        );
      }
    }
    return t;
  };
  const complete = async (t: CompassTask) => {
    if (recordRef.current?.data.timer?.taskId === t.id)
      await command({ action: "timer", taskId: null });
    const meta = recordRef.current?.data.tasks[t.id];
    if (t.status !== "completed" && meta?.repeat && meta.repeat !== "none") {
      const next = await api<{
        task: CompassTask;
        day: string;
        seriesId: string;
      }>("/api/day-planner/repeat", { taskId: t.id });
      setTasks((rows) =>
        rows.some((x) => x.id === next.task.id) ? rows : [...rows, next.task],
      );
      await patchMeta(next.task.id, {
        ...meta,
        day: next.day,
        start: null,
        eventId: null,
        actualSeconds: 0,
        comments: [],
        seriesId: next.seriesId,
        rank: Date.now(),
      });
    }
    await patchTask(t, {
      status: t.status === "completed" ? "not-started" : "completed",
    });
  };
  const add = (d: string | null = date) => {
    setNewDay(d);
    setNewStart(null);
    setEditing("new");
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        )
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a") {
        e.preventDefault();
        setNewDay(date);
        setNewStart(null);
        setEditing("new");
      }
      if (e.key === "p") {
        setMode("planning");
        setStep(0);
      }
      if (e.key === "t") {
        setDate(dayKey());
        setMode("today");
      }
      if (e.key === "f") {
        setMode("focus");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [date]);
  const weekStart = useMemo(() => {
    const d = new Date(`${date}T12:00:00Z`).getUTCDay();
    return addDays(date, -((d + 6) % 7));
  }, [date]);
  const days = useMemo(() => {
    if (mode === "today" || mode === "planning") return [date];
    if (view === "month") {
      const first = date.slice(0, 7) + "-01";
      const day = new Date(`${first}T12:00:00Z`).getUTCDay();
      return Array.from({ length: 42 }, (_, i) =>
        addDays(first, i - ((day + 6) % 7)),
      );
    }
    const n =
      view === "day"
        ? 1
        : view === "three"
          ? 3
          : view === "board"
            ? 5
            : view === "weekdays"
              ? 5
              : 7;
    return Array.from({ length: n }, (_, i) =>
      addDays(view === "week" || view === "weekdays" ? weekStart : date, i),
    );
  }, [date, view, mode, weekStart]);
  const rangeStart = view === "month" ? days[0] : weekStart,
    rangeEnd = view === "month" ? addDays(days[41], 1) : addDays(weekStart, 14);
  useEffect(() => {
    if (!connected) return;
    let live = true;
    setGoogleLoading(true);
    setGoogleError("");
    Promise.all(
      selectedCalendars.map((id) =>
        api<{ events: EventItem[] }>(
          `/api/day-planner/google?start=${encodeURIComponent(zonedInstant(rangeStart, "00:00"))}&end=${encodeURIComponent(zonedInstant(rangeEnd, "00:00"))}&calendarId=${encodeURIComponent(id)}`,
        ),
      ),
    )
      .then((results) => {
        if (live) setEvents(results.flatMap((r) => r.events));
      })
      .catch((e) => {
        if (live) setGoogleError(e.message);
      })
      .finally(() => {
        if (live) setGoogleLoading(false);
      });
    return () => {
      live = false;
    };
  }, [connected, rangeStart, rangeEnd, selectedCalendars, googleRefresh]);
  useEffect(() => {
    if (!connected) return;
    api<{ calendars: Cal[] }>("/api/day-planner/google?kind=calendars")
      .then((r) => {
        setCalendars(r.calendars);
        const primary = r.calendars.find((c) => c.primary);
        if (primary) {
          setSelectedCalendars([primary.id]);
          setTargetCalendar(primary.id);
        }
      })
      .catch((e) => setGoogleError(e.message));
  }, [connected]);
  const eventsOn = (d: string) =>
    events
      .filter(
        (e) =>
          (e.start.date || dayKey(e.start.dateTime)) <= d &&
          (e.end.date ? e.end.date > d : dayKey(e.end.dateTime) >= d),
      )
      .map((e) => ({
        ...e,
        startMinute: e.start.date
          ? 0
          : dayKey(e.start.dateTime!) < d
            ? 0
            : minuteInZone(e.start.dateTime!),
        endMinute: e.end.date
          ? 1440
          : dayKey(e.end.dateTime!) > d
            ? 1440
            : minuteInZone(e.end.dateTime!),
      }));
  const ordered = [...tasks].sort(
    (a, b) => (state.tasks[a.id]?.rank || 0) - (state.tasks[b.id]?.rank || 0),
  );
  const filtered = ordered.filter(
    (t) =>
      (channel === "all" ||
        (state.tasks[t.id]?.channel || "work") === channel) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  );
  const tasksOn = (d: string | null) =>
    filtered.filter(
      (t) =>
        !state.tasks[t.id]?.archived &&
        t.status !== "cancelled" &&
        (state.tasks[t.id]?.day || null) === d,
    );
  const projections = (d: string) =>
    projectTasks(
      ordered,
      state.tasks,
      eventsOn(d),
      d,
      Math.max(
        minutes(state.settings.start) || 540,
        d === dayKey() ? minuteInZone(new Date(now).toISOString()) : 0,
      ),
      1440,
    ) as Record<string, number>;
  const workload = (d: string) =>
    tasksOn(d)
      .filter((t) => t.status !== "completed")
      .reduce((s, t) => s + (state.tasks[t.id]?.planned || 0), 0);
  const startTimer = async (t: CompassTask, pomodoro = false) => {
    await command({
      action: "timer",
      taskId: state.timer?.taskId === t.id ? null : t.id,
      mode: pomodoro ? "pomodoro" : "focus",
    });
    setFocusId(t.id);
    setMode("focus");
  };
  const schedule = async (t: CompassTask, d: string, start: number) => {
    const m = recordRef.current!.data.tasks[t.id] || {};
    const planned = m.planned || 30;
    if (start + planned > 1440)
      throw Error(
        "This block would extend beyond the day. Choose an earlier time.",
      );
    if (m.eventId)
      throw Error(
        "This task has a Google event. Open its event to reschedule both calendars.",
      );
    await patchMeta(t.id, { day: d, start, planned });
    setNotice("Time block saved in Compass.");
  };
  const reorder = async (t: CompassTask, d: string, before?: CompassTask) => {
    const rows = tasksOn(d);
    let rank = Date.now();
    if (before) {
      const index = rows.findIndex((x) => x.id === before.id);
      const prev =
        index > 0
          ? state.tasks[rows[index - 1].id]?.rank || 0
          : (state.tasks[before.id]?.rank || 0) - 2;
      rank = (prev + (state.tasks[before.id]?.rank || 0)) / 2;
    }
    if (state.tasks[t.id]?.eventId && state.tasks[t.id]?.day !== d)
      throw Error("Move this task through its Google event.");
    await patchMeta(t.id, {
      day: d,
      ...(state.tasks[t.id]?.eventId ? {} : { start: null }),
      rank,
    });
  };
  const loadMail = async (next?: string) => {
    setMailLoading(true);
    setMailError("");
    try {
      const r = await api<{
        messages: MailItem[];
        nextPageToken: string | null;
      }>(
        `/api/day-planner/google?kind=mail&q=${encodeURIComponent(mailSearch)}${next ? `&pageToken=${encodeURIComponent(next)}` : ""}`,
      );
      setMails((s) => (next ? [...s, ...r.messages] : r.messages));
      setMailNext(r.nextPageToken);
    } catch (e) {
      setMailError((e as Error).message);
    } finally {
      setMailLoading(false);
    }
  };
  const importMail = async (m: MailItem) => {
    const existing = tasks.find((t) => state.tasks[t.id]?.sourceUrl === m.url);
    if (existing) {
      setEditing(existing);
      return;
    }
    const t = await newTask(
      m.subject,
      date,
      undefined,
      `${m.from}\n\n${m.snippet}\n\n${m.url}`,
    );
    await patchMeta(t.id, { sourceUrl: m.url });
    setNotice("Email added to your tasks.");
    setEditing(t);
  };
  const focusTask =
    tasks.find((t) => t.id === (focusId || state.timer?.taskId)) ||
    tasksOn(date).find((t) => t.status !== "completed");
  function card(t: CompassTask, d: string | null) {
    const m = state.tasks[t.id] || {},
      channelInfo = state.channels.find((c) => c.id === (m.channel || "work")),
      estimated = d ? projections(d)[t.id] : undefined;
    return (
      <article
        key={t.id}
        className={`dp-card ${t.status === "completed" ? "is-done" : ""}`}
        draggable={!busy}
        onDragStart={(e) => e.dataTransfer.setData("text/compass-task", t.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = e.dataTransfer.getData("text/compass-task");
          const dragged = tasks.find((x) => x.id === id);
          if (dragged && d && dragged.id !== t.id)
            void run(() => reorder(dragged, d, t));
        }}
      >
        <div className="dp-card-meta">
          <span>
            {m.start != null
              ? clock(m.start)
              : estimated != null
                ? clock(estimated)
                : t.due
                  ? `Due ${t.due}`
                  : ""}
          </span>
          <button
            title="Edit planned and actual time"
            onClick={() => setEditing(t)}
          >
            {m.actualSeconds ? `${duration(m.actualSeconds / 60)} / ` : ""}
            {duration(m.planned)}
          </button>
        </div>
        <button className="dp-card-title" onClick={() => setEditing(t)}>
          {t.title}
        </button>
        {subtasks.some((s) => s.parent_task_id === t.id) && (
          <small>
            {
              subtasks.filter(
                (s) => s.parent_task_id === t.id && s.status === "completed",
              ).length
            }
            /{subtasks.filter((s) => s.parent_task_id === t.id).length} subtasks
          </small>
        )}
        <footer>
          <button
            aria-label={`${t.status === "completed" ? "Reopen" : "Complete"} ${t.title}`}
            className="dp-complete"
            disabled={busy}
            onClick={() => void run(() => complete(t))}
          >
            <Check size={13} />
          </button>
          <button
            aria-label={`Start timer for ${t.title}`}
            disabled={busy}
            onClick={() => void run(() => startTimer(t))}
          >
            {state.timer?.taskId === t.id ? (
              <Pause size={14} />
            ) : (
              <Play size={14} />
            )}
          </button>
          {t.notes && <MessageSquare size={13} />}
          <button
            aria-label={`Edit priority for ${t.title}`}
            onClick={() => setEditing(t)}
          >
            <Flag
              size={13}
              fill={t.priority > 0 && t.priority < 3 ? "currentColor" : "none"}
            />
          </button>
          {d && (
            <>
              <button
                aria-label={`Move ${t.title} up`}
                disabled={busy || tasksOn(d)[0]?.id === t.id}
                onClick={() =>
                  void run(async () => {
                    const rows = tasksOn(d),
                      i = rows.findIndex((x) => x.id === t.id);
                    if (i > 0) await reorder(t, d, rows[i - 1]);
                  })
                }
              >
                <ArrowUp size={12} />
              </button>
              <button
                aria-label={`Move ${t.title} down`}
                disabled={busy || tasksOn(d).at(-1)?.id === t.id}
                onClick={() =>
                  void run(async () => {
                    const rows = tasksOn(d),
                      i = rows.findIndex((x) => x.id === t.id);
                    await reorder(t, d, rows[i + 2]);
                  })
                }
              >
                <ArrowDown size={12} />
              </button>
            </>
          )}
          <span className="dp-channel" style={{ color: channelInfo?.color }}>
            # <span>{channelInfo?.name || "Work"}</span>
          </span>
        </footer>
      </article>
    );
  }
  function column(d: string | null, title?: string) {
    const total = d ? workload(d) : 0;
    return (
      <section
        className="dp-day-column"
        key={d || "backlog"}
        aria-label={title || d!}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const t = tasks.find(
            (t) => t.id === e.dataTransfer.getData("text/compass-task"),
          );
          if (t)
            void run(async () => {
              if (state.tasks[t.id]?.eventId)
                throw Error("Move this task through its linked Google event.");
              await patchMeta(t.id, { day: d, start: null, rank: Date.now() });
            });
        }}
      >
        <header>
          <h2>
            {title ||
              (d === dayKey()
                ? "Today"
                : new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", {
                    weekday: "long",
                  }))}
          </h2>
          {d && (
            <span>
              {new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", {
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
          {d && (
            <div
              className="dp-workload"
              title={`${duration(total)} planned of ${duration(state.settings.capacity)} capacity`}
            >
              <i
                style={{
                  width: `${Math.min(100, (total / state.settings.capacity) * 100)}%`,
                  background:
                    total > state.settings.capacity ? "#d96648" : undefined,
                }}
              />
            </div>
          )}
        </header>
        <button className="dp-add-row" onClick={() => add(d)}>
          <Plus size={16} />
          <span>Add task</span>
          {d && <small>{duration(total)}</small>}
        </button>
        <div className="dp-card-list">{tasksOn(d).map((t) => card(t, d))}</div>
        {!tasksOn(d).length && (
          <p className="dp-empty">
            {d
              ? "Add a task or drag one here."
              : "Work you have not assigned to a day."}
          </p>
        )}
      </section>
    );
  }
  function grid(gridDays: string[], compact = false) {
    return (
      <div className={`dp-time-wrap ${compact ? "dp-time-compact" : ""}`}>
        <div className="dp-time-head">
          <span />
          <div
            style={{
              gridTemplateColumns: `repeat(${gridDays.length},minmax(0,1fr))`,
            }}
          >
            {gridDays.map((d) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={d === dayKey() ? "is-today" : ""}
              >
                {new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", {
                  weekday: "short",
                })}
                <strong>{Number(d.slice(-2))}</strong>
              </button>
            ))}
          </div>
        </div>
        <div
          className="dp-time-scroll"
          ref={(element) => {
            if (element && !element.dataset.initialised) {
              element.scrollTop = 360;
              element.dataset.initialised = "true";
            }
          }}
        >
          <div className="dp-time-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * 60 }}>
                {clock(h * 60)}
              </span>
            ))}
          </div>
          <div
            className="dp-time-days"
            style={{
              gridTemplateColumns: `repeat(${gridDays.length},minmax(0,1fr))`,
            }}
          >
            {gridDays.map((d) => (
              <div
                key={d}
                className="dp-time-day"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const t = tasks.find(
                    (t) => t.id === e.dataTransfer.getData("text/compass-task"),
                  );
                  const at = Math.max(
                    0,
                    Math.min(
                      1425,
                      Math.round(
                        (e.clientY -
                          e.currentTarget.getBoundingClientRect().top) /
                          15,
                      ) * 15,
                    ),
                  );
                  if (t) void run(() => schedule(t, d, at));
                }}
              >
                {Array.from({ length: 48 }, (_, i) => (
                  <button
                    className="dp-time-slot"
                    key={i}
                    aria-label={`Add task on ${d} at ${clock(i * 30)}`}
                    style={{ top: i * 30 }}
                    onClick={() => {
                      setNewDay(d);
                      setNewStart(i * 30);
                      setEditing("new");
                    }}
                  />
                ))}
                {layoutOverlaps(eventsOn(d)).map(
                  (
                    e: EventItem & {
                      startMinute: number;
                      endMinute: number;
                      lane: number;
                      laneCount: number;
                    },
                  ) => (
                    <button
                      key={`${e.calendarId}:${e.id}`}
                      className="dp-event"
                      style={{
                        top: e.startMinute,
                        height: Math.max(22, e.endMinute - e.startMinute),
                        left: `calc(${(e.lane / e.laneCount) * 100}% + 3px)`,
                        width: `calc(${100 / e.laneCount}% - 6px)`,
                        background:
                          calendars.find((c) => c.id === e.calendarId)?.color ||
                          "#a4dfe4",
                      }}
                      onClick={() => setEventEdit(e)}
                    >
                      <strong>{e.title}</strong>
                      <span>
                        {e.start.date
                          ? "All day"
                          : `${clock(e.startMinute)} – ${clock(e.endMinute)}`}
                      </span>
                    </button>
                  ),
                )}
                {tasksOn(d)
                  .filter(
                    (t) =>
                      t.status !== "completed" && !state.tasks[t.id]?.eventId,
                  )
                  .map((t) => {
                    const m = state.tasks[t.id] || {},
                      start = m.start ?? projections(d)[t.id];
                    if (start == null || !m.planned) return null;
                    return (
                      <TimeBlock
                        key={t.id}
                        task={t}
                        start={start}
                        planned={m.planned}
                        projected={m.start == null}
                        busy={busy}
                        open={() => setEditing(t)}
                        resize={(value) =>
                          run(() => patchMeta(t.id, { planned: value }))
                        }
                      />
                    );
                  })}
                <div
                  className="dp-shutdown-line"
                  style={{
                    top:
                      minutes(
                        state.days[d]?.shutdownTime || state.settings.shutdown,
                      ) || 1020,
                  }}
                  title="Shutdown time"
                />
                {d === dayKey() && (
                  <div
                    className="dp-now-line"
                    style={{ top: minuteInZone(new Date(now).toISOString()) }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <main className="dp-root" aria-busy={busy}>
      <aside className="dp-nav">
        <button
          className={mode === "planner" ? "active" : ""}
          onClick={() => setMode("planner")}
        >
          <CalendarDays size={16} />
          Planner
        </button>
        <button
          className={mode === "today" ? "active" : ""}
          onClick={() => {
            setDate(dayKey());
            setMode("today");
          }}
        >
          <Sun size={16} />
          Today
        </button>
        <button
          className={mode === "focus" ? "active" : ""}
          onClick={() => setMode("focus")}
        >
          <Play size={16} />
          Focus
        </button>
        <small>DAILY RITUALS</small>
        <button
          className={mode === "planning" ? "active" : ""}
          onClick={() => {
            setMode("planning");
            setStep(0);
          }}
        >
          <CalendarCheck size={16} />
          Daily planning
        </button>
        <button onClick={() => setMode("shutdown")}>
          <Sunset size={16} />
          Daily shutdown
        </button>
        <button onClick={() => setMode("highlights")}>
          <Check size={16} />
          Daily highlights
        </button>
        <small>WEEKLY RITUALS</small>
        <button onClick={() => setMode("weekly")}>
          <Target size={16} />
          Weekly planning
        </button>
        <button onClick={() => setMode("review")}>
          <Clock size={16} />
          Weekly review
        </button>
        <small>YOUR WORK</small>
        <button onClick={() => setMode("backlog")}>
          <Archive size={16} />
          Backlog
        </button>
        <button onClick={() => setMode("archive")}>
          <Archive size={16} />
          Archive
        </button>
        {state.channels.map((c) => (
          <button
            key={c.id}
            className={channel === c.id ? "active" : ""}
            onClick={() => setChannel(channel === c.id ? "all" : c.id)}
          >
            <span style={{ color: c.color }}>#</span>
            {c.name}
          </button>
        ))}
        <button onClick={() => setSettings(true)}>
          <Settings size={16} />
          Preferences
        </button>
        <Link href="/sales/outbound?desk=calendar" className="dp-campaign-link">
          Campaign calendar <ExternalLink size={12} />
        </Link>
      </aside>
      <div className="dp-main">
        <header className="dp-toolbar">
          <div>
            <button
              aria-label="Previous period"
              onClick={() =>
                setDate(
                  addDays(
                    date,
                    view === "month"
                      ? -28
                      : view === "week" || view === "weekdays"
                        ? -7
                        : -1,
                  ),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Next period"
              onClick={() =>
                setDate(
                  addDays(
                    date,
                    view === "month"
                      ? 28
                      : view === "week" || view === "weekdays"
                        ? 7
                        : 1,
                  ),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setDate(dayKey())}>Today</button>
            <input
              aria-label="Go to date"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="dp-search">
              <Search size={14} />
              <input
                aria-label="Search tasks"
                placeholder="Search tasks"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Planner layout"
              value={view}
              onChange={(e) => {
                setView(e.target.value as View);
                setMode("planner");
              }}
            >
              <option value="board">Board</option>
              <option value="day">Calendar · One day</option>
              <option value="three">Calendar · Three days</option>
              <option value="weekdays">Calendar · Weekdays</option>
              <option value="week">Calendar · Week</option>
              <option value="month">Calendar · Month</option>
            </select>
            <button
              aria-label="Google Calendar settings"
              onClick={() => setSettings(true)}
            >
              <CalendarDays size={16} />
            </button>
            <button
              aria-label="Import from Gmail"
              onClick={() => {
                setMailOpen(true);
                if (connected) void loadMail();
              }}
            >
              <Mail size={16} />
            </button>
            <button
              aria-label="Refresh planner"
              disabled={busy || googleLoading}
              onClick={() => {
                void load();
                setGoogleRefresh((n) => n + 1);
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </header>
        {error && (
          <div className="dp-error" role="alert">
            {error}
            <button onClick={() => void load()}>Reload saved version</button>
          </div>
        )}
        {googleError && (
          <div className="dp-error" role="alert">
            Calendar: {googleError}
          </div>
        )}
        {notice && (
          <div className="dp-notice" role="status">
            {notice}
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {!record ? (
          <div className="dp-loading">
            {error ? "Your planner could not load." : "Loading your day…"}
          </div>
        ) : (
          <>
            {(mode === "planner" || mode === "today") && (
              <div className="dp-workspace">
                {mode === "today" || view === "board" ? (
                  <>
                    <div className="dp-board">
                      {(mode === "today" ? [date] : days).map((d) => column(d))}
                    </div>
                    {grid([date], true)}
                  </>
                ) : view === "month" ? (
                  <>
                    <div className="dp-month">
                      <div className="dp-month-labels">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (d) => (
                            <span key={d}>{d}</span>
                          ),
                        )}
                      </div>
                      <div className="dp-month-grid">
                        {days.map((d) => (
                          <section
                            key={d}
                            className={d === dayKey() ? "is-today" : ""}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              const t = tasks.find(
                                (t) =>
                                  t.id ===
                                  e.dataTransfer.getData("text/compass-task"),
                              );
                              if (t)
                                void run(() =>
                                  patchMeta(t.id, { day: d, start: null }),
                                );
                            }}
                          >
                            <button
                              onClick={() => {
                                setDate(d);
                                setMode("today");
                              }}
                            >
                              {Number(d.slice(-2))}
                            </button>
                            {eventsOn(d)
                              .slice(0, 4)
                              .map((e) => (
                                <button
                                  key={e.id}
                                  className="dp-month-event"
                                  onClick={() => setEventEdit(e)}
                                >
                                  {e.title}
                                </button>
                              ))}
                            {tasksOn(d).map((t) => (
                              <button
                                key={t.id}
                                className="dp-month-task"
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData(
                                    "text/compass-task",
                                    t.id,
                                  )
                                }
                                onClick={() => setEditing(t)}
                              >
                                {t.status === "completed" ? "✓ " : ""}
                                {t.title}
                              </button>
                            ))}
                          </section>
                        ))}
                      </div>
                    </div>
                    <div className="dp-task-rail">{column(date)}</div>
                  </>
                ) : (
                  <>
                    {grid(days)}
                    <div className="dp-task-rail">{column(date)}</div>
                  </>
                )}
              </div>
            )}
            {mode === "backlog" && (
              <div className="dp-board">
                {column(null, "Backlog")}
                <section className="dp-explainer">
                  <h2>Make room for what matters.</h2>
                  <p>
                    Keep tasks here until you are ready to plan them. Moving a
                    task to a day does not change its deadline.
                  </p>
                </section>
              </div>
            )}
            {mode === "archive" && (
              <div className="dp-archive">
                <h2>Archived tasks</h2>
                {filtered
                  .filter((t) => state.tasks[t.id]?.archived)
                  .map((t) => (
                    <div key={t.id}>
                      {card(t, state.tasks[t.id]?.day || null)}
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() => patchMeta(t.id, { archived: false }))
                        }
                      >
                        Restore task
                      </button>
                    </div>
                  ))}
              </div>
            )}
            {mode === "focus" && (
              <section className="dp-focus">
                {focusTask ? (
                  <>
                    <div className="dp-focus-picker">
                      <select
                        aria-label="Task to focus on"
                        value={focusTask.id}
                        onChange={(e) => setFocusId(e.target.value)}
                      >
                        {tasks
                          .filter((t) => t.status !== "completed")
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                      <button onClick={() => setEditing(focusTask)}>
                        Open task
                      </button>
                    </div>
                    <h1>{focusTask.title}</h1>
                    <div className="dp-focus-clock">
                      <div>
                        <small>ACTUAL</small>
                        <strong>
                          {duration(
                            elapsedSeconds(state, focusTask.id, now) / 60,
                          )}
                          <sub>
                            :
                            {String(
                              elapsedSeconds(state, focusTask.id, now) % 60,
                            ).padStart(2, "0")}
                          </sub>
                        </strong>
                      </div>
                      <div>
                        <small>PLANNED</small>
                        <strong>
                          {duration(state.tasks[focusTask.id]?.planned)}
                        </strong>
                      </div>
                    </div>
                    {state.timer?.mode === "pomodoro" &&
                      state.timer.taskId === focusTask.id && (
                        <p role="timer">
                          Pomodoro ·{" "}
                          {duration(
                            Math.max(
                              0,
                              state.timer.durationSeconds -
                                Math.floor(
                                  (now - Date.parse(state.timer.startedAt)) /
                                    1000,
                                ),
                            ) / 60,
                          )}{" "}
                          remaining
                        </p>
                      )}
                    {breakUntil && (
                      <p role="timer">
                        {breakUntil > now
                          ? `Break · ${duration((breakUntil - now) / 60000)} remaining`
                          : "Break finished. Ready when you are."}
                      </p>
                    )}
                    <div className="dp-focus-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            if (state.timer)
                              await command({ action: "timer", taskId: null });
                            setBreakUntil(
                              Date.now() + state.settings.breakMinutes * 60000,
                            );
                          })
                        }
                      >
                        Take a {state.settings.breakMinutes} minute break
                      </button>
                      <button
                        className="dp-primary"
                        disabled={busy}
                        onClick={() => void run(() => startTimer(focusTask))}
                      >
                        {state.timer?.taskId === focusTask.id ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                        {state.timer?.taskId === focusTask.id
                          ? "Stop timer"
                          : "Start timer"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() => startTimer(focusTask, true))
                        }
                      >
                        Pomodoro · {state.settings.pomodoro} min
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void run(() => complete(focusTask))}
                      >
                        <Check size={16} />
                        Complete task
                      </button>
                    </div>
                    <div className="dp-focus-notes">
                      {subtasks
                        .filter((t) => t.parent_task_id === focusTask.id)
                        .map((t) => (
                          <label key={t.id}>
                            <input
                              type="checkbox"
                              checked={t.status === "completed"}
                              disabled={busy}
                              onChange={() => void run(() => complete(t))}
                            />
                            {t.title}
                          </label>
                        ))}
                      <p>{focusTask.notes}</p>
                    </div>
                  </>
                ) : (
                  <div className="dp-empty">
                    <h2>Choose one thing to focus on.</h2>
                    <button onClick={() => add()}>Add a task</button>
                  </div>
                )}
              </section>
            )}
            {mode === "planning" && (
              <>
                <div className="dp-steps">
                  {[
                    "Add tasks",
                    "Estimate time",
                    "Prioritise",
                    "Schedule",
                    "Document",
                  ].map((s, i) => (
                    <button
                      key={s}
                      className={i === step ? "active" : ""}
                      onClick={() => setStep(i)}
                    >
                      {i < step ? "✓ " : `${i + 1}. `}
                      {s}
                    </button>
                  ))}
                </div>
                <div className="dp-planning">
                  <section className="dp-guide">
                    <h2>
                      {
                        [
                          "What do you want to get done today?",
                          "How much time will you need?",
                          "What can wait?",
                          "Finalise your plan for today",
                          "Your daily plan",
                        ][step]
                      }
                    </h2>
                    <p>
                      {
                        [
                          "Add your tasks and pull in work from Gmail.",
                          "Estimate each task before filling your day.",
                          "Keep what matters today. Move other work to tomorrow or your backlog.",
                          "Put your tasks in order, then place them on your calendar.",
                          "Capture the plan and anything that could get in your way.",
                        ][step]
                      }
                    </p>
                    <div className="dp-capacity">
                      <strong>{duration(workload(date))}</strong> planned ·{" "}
                      {duration(state.settings.capacity)} capacity
                    </div>
                    {step === 0 && (
                      <button
                        onClick={() => {
                          setMailOpen(true);
                          if (connected) void loadMail();
                        }}
                      >
                        <Mail size={16} />
                        Add tasks from Gmail
                      </button>
                    )}
                    <label>
                      Shutdown time
                      <input
                        type="time"
                        value={
                          state.days[date]?.shutdownTime ||
                          state.settings.shutdown
                        }
                        onChange={(e) =>
                          void run(async () => {
                            await command({
                              action: "day",
                              day: date,
                              patch: { shutdownTime: e.target.value },
                            });
                          })
                        }
                      />
                    </label>
                    <div className="dp-step-actions">
                      <button
                        disabled={step === 0}
                        onClick={() => setStep((s) => s - 1)}
                      >
                        <ChevronLeft size={16} />
                        Back
                      </button>
                      <button
                        className="dp-primary"
                        disabled={busy}
                        onClick={() =>
                          step < 4
                            ? setStep((s) => s + 1)
                            : void run(async () => {
                                await command({
                                  action: "day",
                                  day: date,
                                  patch: { planned: true },
                                });
                                setMode("today");
                                setNotice("Daily plan saved.");
                              })
                        }
                      >
                        {step === 4 ? "Start your day" : "Next"}
                      </button>
                    </div>
                  </section>
                  {step === 4 ? (
                    <Journal
                      key={`plan-${date}`}
                      value={state.days[date]?.notes || ""}
                      title="Planned for today"
                      summary={tasksOn(date).map(
                        (t) =>
                          `${t.title} · ${duration(state.tasks[t.id]?.planned)}`,
                      )}
                      save={(value) =>
                        run(async () => {
                          await command({
                            action: "day",
                            day: date,
                            patch: { notes: value },
                          });
                          setNotice("Daily plan notes saved.");
                        })
                      }
                    />
                  ) : (
                    <div className="dp-board">
                      {column(date)}
                      {step === 2 && column(addDays(date, 1), "Tomorrow")}
                      {step === 2 && column(null, "Backlog")}
                    </div>
                  )}
                  {step === 3 && grid([date], true)}
                </div>
              </>
            )}
            {["shutdown", "highlights", "weekly", "review"].includes(mode) && (
              <section className="dp-ritual">
                <h1>
                  {
                    (
                      {
                        shutdown: "Time to wrap up",
                        highlights: "Daily highlights",
                        weekly: "Plan your week",
                        review: "Review your week",
                      } as Partial<Record<Mode, string>>
                    )[mode]
                  }
                </h1>
                <p>
                  {mode === "shutdown"
                    ? "Review what you finished and decide what can wait."
                    : mode === "weekly"
                      ? "Set your intentions and review the work ahead."
                      : "Compare what you planned with what you actually did."}
                </p>
                <div className="dp-review-summary">
                  <strong>
                    {
                      tasks.filter(
                        (t) =>
                          t.status === "completed" &&
                          (mode === "review"
                            ? state.tasks[t.id]?.day! >= weekStart &&
                              state.tasks[t.id]?.day! <= addDays(weekStart, 6)
                            : state.tasks[t.id]?.day === date),
                      ).length
                    }{" "}
                    tasks completed
                  </strong>
                  <span>
                    {duration(
                      tasksOn(date).reduce(
                        (n, t) => n + elapsedSeconds(state, t.id, now) / 60,
                        0,
                      ),
                    )}{" "}
                    actual today
                  </span>
                </div>
                <Journal
                  key={`${mode}-${date}`}
                  value={
                    (mode === "weekly"
                      ? state.days[weekStart]?.weeklyNotes
                      : state.days[date]?.reflection) || ""
                  }
                  title={mode === "weekly" ? "Weekly intentions" : "Reflection"}
                  summary={tasksOn(date)
                    .filter((t) => t.status === "completed")
                    .map((t) => t.title)}
                  save={(value) =>
                    run(async () => {
                      await command({
                        action: "day",
                        day: mode === "weekly" ? weekStart : date,
                        patch:
                          mode === "weekly"
                            ? { weeklyNotes: value }
                            : { reflection: value },
                      });
                      setNotice("Reflection saved.");
                    })
                  }
                />
                {mode === "shutdown" && (
                  <>
                    <div className="dp-card-list">
                      {tasksOn(date)
                        .filter((t) => t.status !== "completed")
                        .map((t) => (
                          <div key={t.id}>
                            {card(t, date)}
                            <button
                              disabled={
                                busy || Boolean(state.tasks[t.id]?.eventId)
                              }
                              onClick={() =>
                                void run(() =>
                                  patchMeta(t.id, {
                                    day: addDays(date, 1),
                                    start: null,
                                  }),
                                )
                              }
                            >
                              Move to tomorrow
                            </button>
                          </div>
                        ))}
                    </div>
                    <button
                      className="dp-primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (state.timer)
                            await command({ action: "timer", taskId: null });
                          await command({
                            action: "day",
                            day: date,
                            patch: { shutdown: true },
                          });
                          setNotice(
                            "Day wrapped up. Your unfinished tasks remain available.",
                          );
                        })
                      }
                    >
                      Finish the day
                    </button>
                  </>
                )}
                {mode === "weekly" && (
                  <div className="dp-board">
                    {Array.from({ length: 5 }, (_, i) =>
                      column(addDays(weekStart, i)),
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
        {state.timer && mode !== "focus" && (
          <button
            className="dp-running"
            onClick={() => {
              setFocusId(state.timer!.taskId);
              setMode("focus");
            }}
          >
            <span className="dp-pulse" />
            {tasks.find((t) => t.id === state.timer!.taskId)?.title} ·{" "}
            {duration(elapsedSeconds(state, state.timer.taskId, now) / 60)}
          </button>
        )}
      </div>
      {editing && (
        <TaskEditor
          key={editing === "new" ? `new-${newDay}` : editing.id}
          task={editing === "new" ? null : editing}
          defaultDay={newDay}
          defaultStart={newStart}
          state={state}
          projects={projects}
          subtasks={subtasks}
          goals={goals}
          busy={busy}
          externalError={error}
          close={() => setEditing(null)}
          save={async (input, meta) => {
            await run(async () => {
              let t =
                editing === "new"
                  ? await newTask(input.title!, meta.day || null)
                  : await patchTask(editing, input);
              if (
                editing === "new" &&
                (input.notes || input.project_id || input.due || input.priority)
              )
                t = await patchTask(t, input);
              setEditing(t);
              await patchMeta(t.id, meta);
              setEditing(null);
              setNotice("Task saved.");
            });
          }}
          addSubtask={(title, parent) =>
            run(async () => {
              await newTask(title, null, parent);
            })
          }
          completeSubtask={(t) => run(() => complete(t))}
          archive={(t) =>
            run(async () => {
              if (state.timer?.taskId === t.id)
                await command({ action: "timer", taskId: null });
              await patchMeta(t.id, { archived: true });
              setEditing(null);
            })
          }
          duplicate={(t) =>
            run(async () => {
              const copy = await newTask(
                `${t.title} (copy)`,
                state.tasks[t.id]?.day || null,
                undefined,
                t.notes || "",
              );
              await patchMeta(copy.id, {
                ...state.tasks[t.id],
                eventId: null,
                actualSeconds: 0,
                rank: Date.now(),
              });
              setEditing(copy);
            })
          }
          startTimer={(t) => run(() => startTimer(t))}
          complete={(t) => run(() => complete(t))}
        />
      )}
      {settings && (
        <Modal
          title="Calendar & preferences"
          onClose={() => setSettings(false)}
        >
          <SettingsPanel
            state={state}
            configured={configured}
            connected={connected}
            calendars={calendars}
            selected={selectedCalendars}
            target={targetCalendar}
            setSelected={setSelectedCalendars}
            setTarget={setTargetCalendar}
            busy={busy}
            save={(patch) =>
              run(async () => {
                await command({ action: "settings", patch });
                setNotice("Preferences saved.");
              })
            }
            saveChannels={(channels) =>
              run(async () => {
                await command({ action: "channels", channels });
              })
            }
          />
        </Modal>
      )}
      {mailOpen && (
        <Modal title="Tasks from Gmail" onClose={() => setMailOpen(false)}>
          <div className="dp-mail">
            {error && <p role="alert">{error}</p>}
            {!connected ? (
              <>
                <p>
                  Connect Google to browse your inbox and add emails to your
                  daily plan.
                </p>
                <a className="dp-primary" href="/api/day-planner/connect">
                  Connect Google
                </a>
              </>
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void loadMail();
                  }}
                >
                  <input
                    aria-label="Search Gmail"
                    value={mailSearch}
                    onChange={(e) => setMailSearch(e.target.value)}
                  />
                  <button disabled={mailLoading}>Search</button>
                </form>
                {mailError && (
                  <p role="alert" className="dp-error">
                    {mailError}
                  </p>
                )}
                {mailLoading && <p role="status">Loading messages…</p>}
                {mails.map((m) => (
                  <article key={m.id}>
                    <small>{m.from}</small>
                    <h3>{m.subject}</h3>
                    <p>{m.snippet}</p>
                    <button
                      disabled={busy}
                      onClick={() => void run(() => importMail(m))}
                    >
                      <Plus size={14} />
                      Add to tasks
                    </button>
                    <a href={m.url} target="_blank" rel="noreferrer">
                      Open in Gmail
                    </a>
                  </article>
                ))}
                {mailNext && (
                  <button
                    disabled={mailLoading}
                    onClick={() => void loadMail(mailNext)}
                  >
                    Load more
                  </button>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
      {eventEdit && (
        <EventEditor
          event={eventEdit}
          externalError={error}
          busy={busy}
          canEdit={Boolean(
            calendars.find(
              (c) =>
                c.id === eventEdit.calendarId &&
                ["owner", "writer"].includes(c.accessRole),
            ),
          )}
          close={() => setEventEdit(null)}
          save={(input) =>
            run(async () => {
              await api("/api/day-planner/google", input);
              if (
                eventEdit.taskId &&
                tasks.some((t) => t.id === eventEdit.taskId)
              )
                await patchMeta(eventEdit.taskId, {
                  day: dayKey(input.start),
                  start: minuteInZone(input.start),
                  planned: Math.round(
                    (Date.parse(input.end) - Date.parse(input.start)) / 60000,
                  ),
                });
              setGoogleRefresh((n) => n + 1);
              setEventEdit(null);
              setNotice("Google Calendar event saved.");
            })
          }
          addTask={() =>
            run(async () => {
              const existing = tasks.find(
                (t) => state.tasks[t.id]?.eventId === eventEdit.id,
              );
              if (existing) {
                setEditing(existing);
                setEventEdit(null);
                return;
              }
              const t = await newTask(
                eventEdit.title,
                date,
                undefined,
                eventEdit.url,
              );
              await patchMeta(t.id, {
                eventId: eventEdit.id,
                calendarId: eventEdit.calendarId,
                day: eventEdit.start.date || dayKey(eventEdit.start.dateTime),
                start: eventEdit.start.date
                  ? null
                  : minuteInZone(eventEdit.start.dateTime),
                planned: eventEdit.start.date
                  ? null
                  : Math.round(
                      (Date.parse(eventEdit.end.dateTime!) -
                        Date.parse(eventEdit.start.dateTime!)) /
                        60000,
                    ),
              });
              setEventEdit(null);
              setEditing(t);
            })
          }
        />
      )}
      {connected && record && mode !== "focus" && (
        <button
          className="dp-google-publish"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const list = tasksOn(date).filter(
                (t) =>
                  state.tasks[t.id]?.start != null &&
                  !state.tasks[t.id]?.eventId &&
                  t.status !== "completed",
              );
              if (!list.length) {
                setNotice(
                  "Set a task start time first, then add its block to Google Calendar.",
                );
                return;
              }
              for (const t of list) {
                const m = state.tasks[t.id];
                const eventId =
                  "c" +
                  Array.from(new TextEncoder().encode(t.id + date))
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
                const start = zonedInstant(date, clock(m.start!));
                const end = new Date(
                  Date.parse(start) + (m.planned || 30) * 60000,
                ).toISOString();
                const { event } = await api<{ event: { id: string } }>(
                  "/api/day-planner/google",
                  {
                    id: eventId,
                    calendarId: targetCalendar,
                    summary: t.title,
                    start,
                    end,
                    taskId: t.id,
                  },
                );
                await patchMeta(t.id, {
                  eventId: event.id,
                  calendarId: targetCalendar,
                });
              }
              setGoogleRefresh((n) => n + 1);
              setNotice(`${list.length} task blocks added to Google Calendar.`);
            })
          }
        >
          <CalendarCheck size={15} />
          Add today’s blocks to Google
        </button>
      )}
    </main>
  );
}
function Journal({
  title,
  value,
  summary,
  save,
}: {
  title: string;
  value: string;
  summary: string[];
  save: (v: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <section className="dp-journal">
      <h2>{title}</h2>
      <ul>
        {summary.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <label>
        Notes
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What matters? What could get in your way?"
        />
      </label>
      <div>
        <button onClick={() => void save(draft)}>
          Save notes{draft !== value ? " •" : ""}
        </button>
        <button
          onClick={() =>
            void navigator.clipboard.writeText(
              `${title}\n\n${summary.map((s) => `• ${s}`).join("\n")}\n\n${draft}`,
            )
          }
        >
          Copy plan
        </button>
      </div>
    </section>
  );
}
function TaskEditor({
  task,
  defaultDay,
  defaultStart,
  state,
  projects,
  subtasks,
  goals,
  busy,
  externalError,
  close,
  save,
  addSubtask,
  completeSubtask,
  archive,
  duplicate,
  startTimer,
  complete,
}: {
  task: CompassTask | null;
  defaultDay: string | null;
  defaultStart: number | null;
  state: PlannerData;
  projects: CompassProject[];
  subtasks: CompassTask[];
  goals: { id: string; data: { title: string } }[];
  busy: boolean;
  close: () => void;
  save: (p: Partial<CompassTask>, m: PlannerTask) => Promise<unknown>;
  externalError: string;
  addSubtask: (title: string, parent: string) => Promise<unknown>;
  completeSubtask: (t: CompassTask) => Promise<unknown>;
  archive: (t: CompassTask) => Promise<unknown>;
  duplicate: (t: CompassTask) => Promise<unknown>;
  startTimer: (t: CompassTask) => Promise<unknown>;
  complete: (t: CompassTask) => Promise<unknown>;
}) {
  const original = task ? state.tasks[task.id] || {} : {};
  const [title, setTitle] = useState(task?.title || ""),
    [notes, setNotes] = useState(task?.notes || ""),
    [html, setHtml] = useState(
      original.richNotes || `<p>${escapeHtml(task?.notes || "")}</p>`,
    ),
    [day, setDay] = useState(task ? original.day || "" : defaultDay || ""),
    [due, setDue] = useState(task?.due?.slice(0, 10) || ""),
    [start, setStart] = useState(
      original.start != null
        ? clock(original.start)
        : !task && defaultStart != null
          ? clock(defaultStart)
          : "",
    ),
    [planned, setPlanned] = useState(
      original.planned != null
        ? duration(original.planned)
        : !task && defaultStart != null
          ? "0:30"
          : "",
    ),
    [actual, setActual] = useState(
      original.actualSeconds ? duration(original.actualSeconds / 60) : "",
    ),
    [priority, setPriority] = useState(task?.priority || 0),
    [project, setProject] = useState(task?.project_id || ""),
    [channel, setChannel] = useState(original.channel || "work"),
    [goal, setGoal] = useState(original.goalId || ""),
    [repeat, setRepeat] = useState<NonNullable<PlannerTask["repeat"]>>(
      original.repeat || "none",
    ),
    [sub, setSub] = useState(""),
    [comment, setComment] = useState(""),
    [comments, setComments] = useState(original.comments || []),
    [localError, setLocalError] = useState(""),
    [dirty, setDirty] = useState(false),
    [expanded, setExpanded] = useState(Boolean(task));
  const closeSafe = () => {
    if (dirty && !window.confirm("Discard your unsaved task changes?")) return;
    close();
  };
  const submit = async () => {
    try {
      setLocalError("");
      if (!title.trim()) throw Error("Give this task a title.");
      const amount = parseDuration(planned);
      const at = start ? minutes(start) : null;
      if (start && !day)
        throw Error("Choose a planned day for this time block.");
      if (at != null && at + (amount || 30) > 1440)
        throw Error("This time block extends beyond the day.");
      const m: PlannerTask = {
        ...original,
        day: day || null,
        start: at,
        planned: at != null ? amount || 30 : amount,
        channel,
        goalId: goal,
        repeat,
        richNotes: html,
        comments,
      };
      if (
        actual !==
        (original.actualSeconds ? duration(original.actualSeconds / 60) : "")
      ) {
        if (state.timer?.taskId === task?.id)
          throw Error("Stop the running timer before editing actual time.");
        m.actualSeconds = (parseDuration(actual) || 0) * 60;
      }
      await save(
        {
          title: title.trim(),
          notes,
          due: due || null,
          priority,
          project_id: project || null,
        },
        m,
      );
    } catch (e) {
      setLocalError((e as Error).message);
    }
  };
  if (!expanded)
    return (
      <Modal title="Add task" onClose={closeSafe}>
        <form
          className="dp-quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            autoFocus
            aria-label="Task title"
            required
            placeholder="What do you want to work on?"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
          <div>
            <label>
              Day
              <input
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              Planned
              <input
                aria-label="Planned duration"
                placeholder="--:--"
                value={planned}
                onChange={(e) => {
                  setPlanned(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              Channel
              <select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  setDirty(true);
                }}
              >
                {state.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {start && (
              <label>
                Start
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
            )}
          </div>
          {(localError || externalError) && (
            <p role="alert" className="dp-error">
              {localError || externalError}
            </p>
          )}
          <footer>
            <button type="button" onClick={() => setExpanded(true)}>
              More details
            </button>
            <span>Enter to add</span>
            <button className="dp-primary" disabled={busy}>
              Add task
            </button>
          </footer>
        </form>
      </Modal>
    );
  return (
    <Modal title={task ? "Task details" : "Add task"} onClose={closeSafe} wide>
      <form
        className="dp-task-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onChange={() => setDirty(true)}
      >
        <div className="dp-editor-top">
          <label>
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {state.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              <option value={0}>None</option>
              <option value={1}>Urgent</option>
              <option value={2}>High</option>
              <option value={3}>Normal</option>
              <option value={4}>Low</option>
            </select>
          </label>
          <label>
            Planned day
            <input
              aria-label="Planned day"
              type="date"
              value={day}
              disabled={Boolean(original.eventId)}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label>
            Due date
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
        </div>
        <input
          autoFocus
          className="dp-editor-title"
          aria-label="Task title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to work on?"
        />
        <div className="dp-editor-times">
          <label>
            Planned time
            <input
              aria-label="Planned duration"
              placeholder="0:30"
              value={planned}
              disabled={Boolean(original.eventId)}
              onChange={(e) => setPlanned(e.target.value)}
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              value={start}
              disabled={Boolean(original.eventId)}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Actual time
            <input
              aria-label="Actual duration"
              placeholder="--:--"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </label>
          {task && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startTimer(task)}
            >
              <Play size={16} />
              {state.timer?.taskId === task.id ? "Stop timer" : "Start timer"}
            </button>
          )}
        </div>
        <div className="dp-duration-presets">
          {[5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180, 240].map((n) => (
            <button
              disabled={Boolean(original.eventId)}
              type="button"
              key={n}
              onClick={() => {
                setPlanned(duration(n));
                setDirty(true);
              }}
            >
              {n < 60 ? `${n}m` : `${n / 60}h`}
            </button>
          ))}
        </div>
        {original.eventId && (
          <p className="dp-hint">
            This task is linked to Google Calendar. Open its event in the
            calendar to change its time.
          </p>
        )}
        <PlannerNotes
          value={html}
          onChange={(h, t) => {
            setHtml(h);
            setNotes(t);
            setDirty(true);
          }}
        />
        {task && (
          <section className="dp-subtasks">
            <h3>Subtasks</h3>
            {subtasks
              .filter((s) => s.parent_task_id === task.id)
              .map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={s.status === "completed"}
                    disabled={busy}
                    onChange={() => void completeSubtask(s)}
                  />
                  {s.title}
                </label>
              ))}
            <div>
              <input
                aria-label="New subtask"
                placeholder="Add subtask"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (sub.trim())
                      void addSubtask(sub.trim(), task.id).then((ok) => {
                        if (ok) setSub("");
                      });
                  }
                }}
              />
              <button
                type="button"
                aria-label="Add subtask"
                disabled={busy || !sub.trim()}
                onClick={() =>
                  void addSubtask(sub.trim(), task.id).then((ok) => {
                    if (ok) setSub("");
                  })
                }
              >
                <Plus size={16} />
              </button>
            </div>
          </section>
        )}
        <div className="dp-editor-top">
          <label>
            Project
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repeat after completion
            <select
              value={repeat}
              onChange={(e) =>
                setRepeat(e.target.value as NonNullable<PlannerTask["repeat"]>)
              }
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            Objective
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="">No objective</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.data.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {original.sourceUrl && (
          <a href={original.sourceUrl} target="_blank" rel="noreferrer">
            Open original source <ExternalLink size={13} />
          </a>
        )}
        <section className="dp-comments">
          <h3>Comments</h3>
          {comments.map((c) => (
            <article key={c.id}>
              <small>Jules · {new Date(c.at).toLocaleString("en-AU")}</small>
              <p>{c.text}</p>
            </article>
          ))}
          <textarea
            aria-label="New comment"
            placeholder="Add a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            type="button"
            disabled={!comment.trim()}
            onClick={() => {
              setComments((s) => [
                ...s,
                {
                  id: crypto.randomUUID(),
                  text: comment.trim(),
                  at: new Date().toISOString(),
                },
              ]);
              setComment("");
              setDirty(true);
            }}
          >
            Add comment to draft
          </button>
        </section>
        {(localError || externalError) && (
          <p role="alert" className="dp-error">
            {localError || externalError}
          </p>
        )}
        <footer className="dp-editor-footer">
          {task && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void complete(task)}
              >
                <Check size={15} />
                {task.status === "completed" ? "Reopen" : "Complete"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void duplicate(task)}
              >
                <Copy size={15} />
                Duplicate
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void archive(task)}
              >
                <Archive size={15} />
                Archive
              </button>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    `${location.origin}/tasks?task=${encodeURIComponent(task.id)}`,
                  )
                }
              >
                Copy link
              </button>
            </>
          )}
          <button type="submit" className="dp-primary" disabled={busy}>
            {busy ? "Saving…" : task ? "Save changes" : "Add task"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function SettingsPanel({
  state,
  configured,
  connected,
  calendars,
  selected,
  target,
  setSelected,
  setTarget,
  busy,
  save,
  saveChannels,
}: {
  state: PlannerData;
  configured: boolean;
  connected: boolean;
  calendars: Cal[];
  selected: string[];
  target: string;
  setSelected: (v: string[]) => void;
  setTarget: (v: string) => void;
  busy: boolean;
  save: (v: PlannerData["settings"]) => Promise<unknown>;
  saveChannels: (v: PlannerData["channels"]) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(state.settings),
    [name, setName] = useState(""),
    [color, setColor] = useState("#669999");
  return (
    <div className="dp-settings">
      <h2>Google Calendar & Gmail</h2>
      <p>
        {connected
          ? "Google is connected. Calendar events refresh when you change dates or press Refresh."
          : configured
            ? "Connect Google to read calendars, timebox tasks and import emails."
            : "The connection flow is ready, but the server needs Google OAuth credentials before you can connect."}
      </p>
      <a href="/api/day-planner/connect" className="dp-primary">
        {connected ? "Reconnect Google" : "Connect Google"}
      </a>
      <p className="dp-hint">
        Calendar event access and read-only Gmail access. Task blocks are sent
        to Google only when you choose “Add today’s blocks to Google”.
      </p>
      {calendars.length > 0 && (
        <>
          <h3>Visible calendars</h3>
          {calendars.map((c) => (
            <label className="dp-check-label" key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
            </label>
          ))}
          <label>
            Calendar for new blocks
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {calendars
                .filter((c) => ["owner", "writer"].includes(c.accessRole))
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      <h2>Your day</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(draft);
        }}
      >
        <label>
          Start time
          <input
            type="time"
            value={draft.start}
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
        </label>
        <label>
          Shutdown time
          <input
            type="time"
            value={draft.shutdown}
            onChange={(e) => setDraft({ ...draft, shutdown: e.target.value })}
          />
        </label>
        <label>
          Daily capacity (minutes)
          <input
            type="number"
            min={15}
            max={1440}
            value={draft.capacity}
            onChange={(e) =>
              setDraft({ ...draft, capacity: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Pomodoro session (minutes)
          <input
            type="number"
            min={1}
            max={180}
            value={draft.pomodoro}
            onChange={(e) =>
              setDraft({ ...draft, pomodoro: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Break (minutes)
          <input
            type="number"
            min={1}
            max={60}
            value={draft.breakMinutes}
            onChange={(e) =>
              setDraft({ ...draft, breakMinutes: Number(e.target.value) })
            }
          />
        </label>
        <button disabled={busy} type="submit">
          Save preferences
        </button>
      </form>
      <h2>Channels</h2>
      <ul>
        {state.channels.map((c) => (
          <li key={c.id}>
            <span style={{ color: c.color }}>#</span> {c.name}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            void saveChannels([
              ...state.channels,
              { id: crypto.randomUUID(), name: name.trim(), color },
            ]).then((ok) => {
              if (ok) setName("");
            });
        }}
      >
        <label>
          New channel
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          Channel colour
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button disabled={busy}>Add channel</button>
      </form>
      <h2>Keyboard shortcuts</h2>
      <p>
        A · add task
        <br />P · daily planning
        <br />T · today
        <br />F · focus
        <br />
        Escape · close dialog
      </p>
    </div>
  );
}
function EventEditor({
  externalError,
  event,
  canEdit,
  busy,
  close,
  save,
  addTask,
}: {
  externalError: string;
  event: EventItem;
  canEdit: boolean;
  busy: boolean;
  close: () => void;
  save: (input: {
    calendarId: string;
    eventId: string;
    etag: string;
    summary: string;
    start: string;
    end: string;
    taskId?: string;
  }) => Promise<unknown>;
  addTask: () => Promise<unknown>;
}) {
  const [title, setTitle] = useState(event.title),
    [day, setDay] = useState(event.start.date || dayKey(event.start.dateTime)),
    [endDay, setEndDay] = useState(
      event.end.date || dayKey(event.end.dateTime),
    ),
    [start, setStart] = useState(
      event.start.dateTime
        ? clock(minuteInZone(event.start.dateTime))
        : "09:00",
    ),
    [end, setEnd] = useState(
      event.end.dateTime ? clock(minuteInZone(event.end.dateTime)) : "10:00",
    ),
    [error, setError] = useState("");
  return (
    <Modal title="Calendar event" onClose={close}>
      {externalError && <p role="alert">{externalError}</p>}
      <form
        className="dp-event-editor"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const s = zonedInstant(day, start),
              t = zonedInstant(endDay, end);
            if (Date.parse(t) <= Date.parse(s))
              throw Error("End time must follow the start.");
            void save({
              calendarId: event.calendarId,
              eventId: event.id,
              etag: event.etag,
              summary: title,
              start: s,
              end: t,
              taskId: event.taskId || undefined,
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!canEdit}
            required
          />
        </label>
        <label>
          Start date
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={!canEdit || Boolean(event.start.date)}
          />
        </label>
        <label>
          Start
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={!canEdit || Boolean(event.start.date)}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={endDay}
            onChange={(e) => setEndDay(e.target.value)}
            disabled={!canEdit || Boolean(event.start.date)}
          />
        </label>
        <label>
          End
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={!canEdit || Boolean(event.start.date)}
          />
        </label>
        {event.location && <p>{event.location}</p>}
        <p>
          {event.blocking ? "Blocking time" : "Available time"}
          {event.start.date ? " · All-day event" : ""}
        </p>
        {error && <p role="alert">{error}</p>}
        <div>
          <button type="button" disabled={busy} onClick={() => void addTask()}>
            Add to tasks
          </button>
          {event.url && (
            <a href={event.url} target="_blank" rel="noreferrer">
              Open in Google Calendar
            </a>
          )}
          {canEdit && !event.start.date && (
            <button className="dp-primary" disabled={busy}>
              Save to Google
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function TimeBlock({
  task,
  start,
  planned,
  projected,
  busy,
  open,
  resize,
}: {
  task: CompassTask;
  start: number;
  planned: number;
  projected: boolean;
  busy: boolean;
  open: () => void;
  resize: (n: number) => Promise<unknown>;
}) {
  const [size, setSize] = useState(planned),
    drag = useRef<{ y: number; size: number } | null>(null);
  useEffect(() => setSize(planned), [planned]);
  const clamp = (n: number) =>
    Math.max(15, Math.min(1440 - start, Math.round(n / 15) * 15));
  return (
    <div
      draggable={!busy}
      onDragStart={(e) => {
        if (drag.current) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/compass-task", task.id);
      }}
      className={`dp-task-block ${projected ? "is-projected" : ""}`}
      style={{ top: start, height: Math.max(22, size) }}
    >
      <button onClick={open}>
        <strong>{task.title}</strong>
        <span>
          {clock(start)} · {duration(size)}
          {projected ? " · suggested" : ""}
        </span>
      </button>
      {!projected && (
        <button
          className="dp-resize-handle"
          aria-label={`Resize ${task.title}. Use up and down arrow keys.`}
          disabled={busy}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, size };
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setSize(clamp(drag.current.size + e.clientY - drag.current.y));
          }}
          onPointerUp={(e) => {
            if (!drag.current) return;
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (size !== planned)
              void resize(size).then((ok) => {
                if (!ok) setSize(planned);
              });
          }}
          onPointerCancel={() => {
            drag.current = null;
            setSize(planned);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              setSize(clamp(size + (e.key === "ArrowDown" ? 15 : -15)));
            }
          }}
          onKeyUp={(e) => {
            if (
              (e.key === "ArrowUp" || e.key === "ArrowDown") &&
              size !== planned
            )
              void resize(size).then((ok) => {
                if (!ok) setSize(planned);
              });
          }}
        >
          <span />
        </button>
      )}
    </div>
  );
}
