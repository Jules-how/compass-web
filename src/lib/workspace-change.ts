"use client";
const EVENT = "compass:work-changed";
const STORAGE = "compass.work.changed";
export function notifyWorkChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    window.localStorage.setItem(STORAGE, `${Date.now()}:${Math.random()}`);
  } catch {
    /* private browsing */
  }
}
export function onWorkChanged(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === STORAGE) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", storage);
  };
}
/** Same HTTP APIs; successful writes invalidate all views of canonical work. */
export async function workFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const path =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  if (
    response.ok &&
    !["GET", "HEAD"].includes(method) &&
    /\/api\/(tasks|projects|planning|pathfinder)(\/|\?|$)/.test(path)
  )
    notifyWorkChanged();
  return response;
}
