export const PLANNER_ZONE = "Australia/Sydney";
export const EMPTY_PLANNER = {
  version: 1,
  tasks: {},
  days: {},
  channels: [
    { id: "work", name: "Work", color: "#e6a23c" },
    { id: "personal", name: "Personal", color: "#6d9eaf" },
  ],
  settings: {
    start: "09:00",
    shutdown: "17:00",
    capacity: 360,
    pomodoro: 25,
    breakMinutes: 5,
  },
  timer: null,
};
/** @param {Date|string|number} [value] */
export function dayKey(value = new Date(), zone = PLANNER_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function validDay(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function minutes(s) {
  if (!/^\d{2}:\d{2}$/.test(s || "")) return null;
  const [h, m] = s.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
export function clock(n) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
}
export function duration(n) {
  return n == null
    ? "--:--"
    : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
}
export function parseDuration(raw) {
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  let n;
  if (/^\d+:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map(Number);
    if (m > 59) throw Error("Use minutes below 60 after the colon.");
    n = h * 60 + m;
  } else if (/^\d+(\.\d+)?\s*h(r|ours?)?$/.test(s)) n = parseFloat(s) * 60;
  else if (/^\d+(\.\d+)?\s*(m(in(utes?)?)?)?$/.test(s)) n = parseFloat(s);
  else throw Error("Enter minutes, 1:30, or 1.5h.");
  if (!Number.isFinite(n) || n < 0 || n > 1440)
    throw Error("Enter a duration from 0 to 1,440 minutes.");
  return Math.round(n);
}
export function zonedInstant(day, time, zone = PLANNER_ZONE) {
  if (!validDay(day) || minutes(time) == null)
    throw Error("Choose a valid date and time.");
  const wall = Date.parse(`${day}T${time}:00Z`);
  let instant = wall;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(instant))
        .map((p) => [p.type, p.value]),
    );
    const delta =
      wall -
      Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    if (delta === 0) return new Date(instant).toISOString();
    instant += delta;
  }
  throw Error(
    "This time does not exist because the clocks change. Choose another time.",
  );
}
export function minuteInZone(iso, zone = PLANNER_ZONE) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return minutes(p);
}
export function findSlot(start, length, busy, end = 1440) {
  let at = start;
  for (const b of [...busy].sort((a, b) => a.start - b.start)) {
    if (b.end <= at) continue;
    if (at + length <= b.start) break;
    at = Math.max(at, b.end);
  }
  return at + length <= end ? at : null;
}
export function projectTasks(tasks, meta, events, day, start, end = 1440) {
  const busy = events
    .filter((e) => e.blocking !== false)
    .map((e) => ({ start: e.startMinute, end: e.endMinute }));
  for (const t of tasks) {
    const m = meta[t.id];
    if (m?.day === day && m.start != null && m.planned > 0)
      busy.push({ start: m.start, end: m.start + m.planned });
  }
  const out = {};
  let cursor = start;
  for (const t of tasks) {
    const m = meta[t.id] || {};
    if (t.status === "completed" || m.archived || m.day !== day || !m.planned)
      continue;
    if (m.start != null) {
      out[t.id] = m.start;
      continue;
    }
    const slot = findSlot(cursor, m.planned, busy, end);
    if (slot != null) {
      out[t.id] = slot;
      busy.push({ start: slot, end: slot + m.planned });
      cursor = slot + m.planned;
    }
  }
  return out;
}
export function elapsedSeconds(state, id, now = Date.now()) {
  const stored = state.tasks[id]?.actualSeconds || 0;
  const timer = state.timer;
  if (timer?.taskId !== id) return stored;
  const until =
    timer.mode === "pomodoro"
      ? Math.min(
          now,
          Date.parse(timer.startedAt) + timer.durationSeconds * 1000,
        )
      : now;
  return (
    stored +
    Math.max(0, Math.floor((until - Date.parse(timer.startedAt)) / 1000))
  );
}
export function reducePlanner(state, command, now = new Date().toISOString()) {
  const next = structuredClone(state);
  if (command.action === "task") {
    next.tasks[command.id] = {
      ...(next.tasks[command.id] || {}),
      ...command.patch,
    };
  } else if (command.action === "day") {
    next.days[command.day] = {
      ...(next.days[command.day] || {}),
      ...command.patch,
    };
  } else if (command.action === "settings") {
    next.settings = { ...next.settings, ...command.patch };
  } else if (command.action === "channels") {
    next.channels = command.channels;
  } else if (command.action === "timer") {
    if (next.timer) {
      const id = next.timer.taskId;
      next.tasks[id] = {
        ...next.tasks[id],
        actualSeconds: elapsedSeconds(next, id, Date.parse(now)),
      };
      next.timer = null;
    }
    if (command.taskId)
      next.timer = {
        taskId: command.taskId,
        startedAt: now,
        mode: command.mode || "focus",
        durationSeconds: (next.settings.pomodoro || 25) * 60,
      };
  } else throw Error("Unknown planner action.");
  return next;
}
export function nextRepeatDay(day, rule) {
  if (!validDay(day) || rule === "none") return null;
  if (rule === "weekly") return addDays(day, 7);
  if (rule === "monthly") {
    const d = new Date(`${day}T12:00:00Z`);
    const n = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(n, last));
    return d.toISOString().slice(0, 10);
  }
  let next = addDays(day, 1);
  if (rule === "weekdays")
    while ([0, 6].includes(new Date(`${next}T12:00:00Z`).getUTCDay()))
      next = addDays(next, 1);
  return next;
}
export function layoutOverlaps(events) {
  const sorted = [...events].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute,
  );
  const groups = [];
  let group = [],
    end = -1;
  for (const event of sorted) {
    if (group.length && event.startMinute >= end) {
      groups.push(group);
      group = [];
      end = -1;
    }
    group.push(event);
    end = Math.max(end, event.endMinute);
  }
  if (group.length) groups.push(group);
  return groups.flatMap((group) => {
    const lanes = [];
    const placed = group.map((event) => {
      let lane = lanes.findIndex((end) => end <= event.startMinute);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = event.endMinute;
      return { ...event, lane };
    });
    return placed.map((e) => ({ ...e, laneCount: lanes.length }));
  });
}
