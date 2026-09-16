"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PIPELINE_VERSION,
  type PipelineCommand,
  type PipelineOperation,
  type PipelineReceipt,
} from "@/lib/outbound-pipeline";
export const PIPELINE_API = "/api/operator/outbound/pipeline";
export async function pipelineRead<T>(
  path = "",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(PIPELINE_API + path, {
    cache: "no-store",
    signal,
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message || body.error || "Could not read the outbound database.",
    );
  return body as T;
}
export function usePipelineRead<T>(path: string | null, revision = 0) {
  const previousPath = useRef(path);
  const [state, setState] = useState<{
    data: T | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    const samePath = previousPath.current === path;
    previousPath.current = path;
    setState((previous) => ({
      data: samePath ? previous.data : null,
      error: "",
      loading: Boolean(path !== null),
    }));
    if (path !== null)
      void pipelineRead<T>(path, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setState({ data, error: "", loading: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({ data: null, error: error.message, loading: false });
        });
    return () => controller.abort();
  }, [path, revision]);
  return previousPath.current === path
    ? state
    : { ...state, data: null, loading: path !== null };
}
export function usePipelineCommand(onSaved: () => void, scope = "workspace") {
  const storageKey = `compass.pipeline.pending.${scope}`;
  const pending = useRef<{
    path: string;
    body: object;
  } | null>(null);
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
        setMessage(
          "An earlier save needs reconciliation. Retry the same request before making another change.",
        );
      }
    } catch {
      setMessage(
        "Recovery storage is unavailable. Keep this tab open until saves are confirmed.",
      );
    }
  }, [storageKey]);
  const clearPending = useCallback(() => {
    pending.current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);
  const execute = useCallback(
    async (request: {
      path: string;
      body: object;
    }): Promise<PipelineReceipt | null> => {
      if (pending.current && pending.current !== request) return null;
      pending.current = request;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(request));
      } catch {}
      setBusy(true);
      setMessage("Saving…");
      setFailed(false);
      try {
        const response = await fetch(PIPELINE_API + request.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.body),
        });
        const body = await response.json();
        if (!response.ok) {
          if (response.status < 500) {
            clearPending();
            setUncertain(false);
          } else setUncertain(true);
          throw new Error(
            body.message ||
              body.error ||
              "The server could not confirm this change.",
          );
        }
        clearPending();
        setUncertain(false);
        setMessage("Saved in Compass.");
        onSaved();
        return body;
      } catch (error) {
        setUncertain(Boolean(pending.current));
        setFailed(true);
        setMessage(
          `${(error as Error).message}${pending.current ? " Result uncertain. Retry the same request to reconcile before making another change." : " Your edits remain here."}`,
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onSaved, storageKey, clearPending],
  );
  const save = useCallback(
    (operations: PipelineOperation[]) => {
      const body: PipelineCommand = {
        schema_version: PIPELINE_VERSION,
        request_id: crypto.randomUUID(),
        source: "compass.outbound.ui",
        operations,
      };
      return execute({ path: "", body });
    },
    [execute],
  );
  const command = useCallback(
    (path: string, body: object) => execute({ path, body }),
    [execute],
  );
  const retry = async () => {
    const request = pending.current;
    if (!request) return null;
    const id = (
      request.body as {
        request_id?: string;
      }
    ).request_id;
    if (id)
      try {
        const page = await pipelineRead<{
          records: {
            receipt: PipelineReceipt;
          }[];
        }>(queryPath("receipts", { request_id: id }));
        if (page.records[0]) {
          clearPending();
          setUncertain(false);
          setFailed(false);
          setMessage("Previous save confirmed in Compass.");
          onSaved();
          return page.records[0].receipt;
        }
      } catch {
        /* The idempotent retry remains authoritative when receipt lookup fails. */
      }
    return execute(request);
  };
  return { save, command, retry, busy, message, uncertain, failed };
}
export type CommandState = ReturnType<typeof usePipelineCommand>;
export function queryPath(
  collection: string,
  values: Record<string, string | undefined> = {},
) {
  const params = new URLSearchParams({ collection, limit: "100" });
  for (const [key, value] of Object.entries(values))
    if (value) params.set(key, value);
  return `?${params}`;
}
/** Recoverable editor buffer only; server records remain canonical. */
export function useEditorBuffer<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) setValue(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready)
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {}
  }, [key, value, ready]);
  return [value, setValue] as const;
}
export function usePipelineCatalogue<
  T extends {
    id: string;
  },
>(
  collection: string,
  enabled: boolean | undefined,
  revision: number,
  scope: Record<string, string | undefined> = {},
) {
  const scopeKey = JSON.stringify(scope);
  const [after, setAfter] = useState(""),
    [records, setRecords] = useState<T[]>([]);
  const page = usePipelineRead<{
    records: T[];
    next_after: string | null;
    total_matching: number;
  }>(enabled ? queryPath(collection, { ...scope, after }) : null, revision);
  useEffect(() => {
    setAfter("");
    setRecords([]);
  }, [collection, revision, scopeKey]);
  useEffect(() => {
    if (page.data)
      setRecords((previous) =>
        after
          ? [
              ...new Map(
                [...previous, ...page.data!.records].map((value) => [
                  value.id,
                  value,
                ]),
              ).values(),
            ]
          : page.data!.records,
      );
  }, [page.data, after]);
  return {
    ...page,
    data: page.data ? { ...page.data, records } : null,
    loadMore: () => setAfter(page.data?.next_after || ""),
  };
}
