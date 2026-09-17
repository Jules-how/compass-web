"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  PIPELINE_VERSION,
  type PipelineCommand,
  type PipelineOperation,
  type PipelineReceipt,
} from "@/lib/outbound-pipeline";
import { createPipelineReadStore, mergePipelineRecords } from "./pipeline-read-store";
export const PIPELINE_API = "/api/operator/outbound/pipeline";
export async function pipelineRead<T>(path = "", signal?: AbortSignal): Promise<T> {
  const response = await fetch(PIPELINE_API + path, { cache: "no-store", signal });
  let body: Record<string, unknown>;
  try { body = await response.json(); }
  catch {
    throw Object.assign(new Error("The server returned an unreadable response. Refresh this view to try again."), { status: response.status });
  }
  if (body === null || typeof body !== "object") {
    throw Object.assign(new Error("The server returned an incomplete response. Refresh this view to try again."), { status: response.status });
  }
  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "Could not read the outbound database.";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body as T;
}
/** A mounted reader remembers bounded, scope-keyed pages; refresh revisions invalidate them. */
export function usePipelineRead<T>(path: string | null, revision = 0) {
  const [store] = useState(() => createPipelineReadStore<T>(pipelineRead));
  const [, redraw] = useState(0);
  useEffect(() => store.load(path, revision, () => redraw(value => value + 1)), [store, path, revision]);
  return store.snapshot(path, revision);
}
export function usePipelineCommand(onSaved: () => void, scope = "workspace") {
  const storageKey = `compass.pipeline.pending.${scope}`;
  const pending = useRef<{ path: string; body: object } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      if (value) {
        pending.current = JSON.parse(value);
        setUncertain(true);
        setMessage("An earlier save has not been confirmed. Check that save before making another change.");
      }
    } catch {
      setMessage("Recovery storage is unavailable. Keep this tab open until saves are confirmed.");
    }
  }, [storageKey]);
  const clearPending = useCallback(() => {
    pending.current = null;
    try { sessionStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);
  const execute = useCallback(async (request: { path: string; body: object }): Promise<PipelineReceipt | null> => {
    if (pending.current && pending.current !== request) return null;
    pending.current = request;
    try { sessionStorage.setItem(storageKey, JSON.stringify(request)); } catch {}
    setBusy(true);
    setMessage("Saving…");
    setFailed(false);
    try {
      const response = await fetch(PIPELINE_API + request.path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) { clearPending(); setUncertain(false); }
        else setUncertain(true);
        throw new Error(body.message || body.error || "The server could not confirm this change.");
      }
      clearPending();
      setUncertain(false);
      setMessage("Saved in Compass.");
      onSaved();
      return body;
    } catch (error) {
      setUncertain(Boolean(pending.current));
      setFailed(true);
      setMessage(`${(error as Error).message}${pending.current ? " The result is uncertain. Check the same save before making another change." : " Your edits remain here."}`);
      return null;
    } finally { setBusy(false); }
  }, [onSaved, storageKey, clearPending]);
  const save = useCallback((operations: PipelineOperation[]) => {
    const body: PipelineCommand = { schema_version: PIPELINE_VERSION, request_id: crypto.randomUUID(), source: "compass.outbound.ui", operations };
    return execute({ path: "", body });
  }, [execute]);
  const command = useCallback((path: string, body: object) => execute({ path, body }), [execute]);
  const retry = async () => {
    const request = pending.current;
    if (!request) return null;
    const id = (request.body as { request_id?: string }).request_id;
    if (id) try {
      const page = await pipelineRead<{ records: { receipt: PipelineReceipt }[] }>(queryPath("receipts", { request_id: id }));
      if (page.records[0]) {
        clearPending(); setUncertain(false); setFailed(false);
        setMessage("Previous save confirmed in Compass."); onSaved();
        return page.records[0].receipt;
      }
    } catch { /* The exact idempotent retry remains authoritative. */ }
    return execute(request);
  };
  return { save, command, retry, busy, message, uncertain, failed };
}
export type CommandState = ReturnType<typeof usePipelineCommand>;
export function queryPath(collection: string, values: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ collection, limit: "100" });
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `?${params}`;
}
/** Editor recovery is bound to its key before any persistence effect is allowed. */
export function useEditorBuffer<T>(key: string, initial: T) {
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const [buffer, setBuffer] = useState({ key, value: initial, ready: false });
  useEffect(() => {
    let value = initialRef.current;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) value = JSON.parse(saved);
    } catch { /* A missing/unavailable recovery store must not prevent editing. */ }
    setBuffer({ key, value, ready: true });
  }, [key]);
  useEffect(() => {
    if (buffer.ready && buffer.key === key) {
      try { sessionStorage.setItem(key, JSON.stringify(buffer.value)); } catch {}
    }
  }, [buffer, key]);
  const setValue: Dispatch<SetStateAction<T>> = useCallback(next => {
    setBuffer(previous => {
      if (previous.key !== key) return previous;
      return { ...previous, value: typeof next === "function" ? (next as (value: T) => T)(previous.value) : next };
    });
  }, [key]);
  return [buffer.key === key ? buffer.value : initial, setValue] as const;
}
export function usePipelineCatalogue<T extends { id: string }>(
  collection: string, enabled: boolean | undefined, revision: number,
  scope: Record<string, string | undefined> = {},
) {
  const key = JSON.stringify([collection, Object.entries(scope).sort(([a], [b]) => a.localeCompare(b))]);
  const [pagination, setPagination] = useState<{ key: string; revision: number; after: string; records: T[] }>({ key, revision, after: "", records: [] });
  const sameScope = pagination.key === key && pagination.revision === revision;
  const after = sameScope ? pagination.after : "";
  const page = usePipelineRead<{ records: T[]; next_after: string | null; total_matching: number }>(
    enabled ? queryPath(collection, { ...scope, after }) : null, revision,
  );
  const records = page.data ? mergePipelineRecords(after ? pagination.records : [], page.data.records) : sameScope && after ? pagination.records : [];
  return {
    ...page,
    data: page.data ? { ...page.data, records } : null,
    loadMore: () => {
      if (!page.loading && !page.error && page.data?.next_after) {
        setPagination({ key, revision, after: page.data.next_after, records });
      }
    },
  };
}
