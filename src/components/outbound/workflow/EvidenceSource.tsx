"use client";
import { useEffect, useState } from "react";
type Source = { url?: string; provider?: string; retrieved_at?: string };
const cache = new Map<string, Source>();
const pending = new Map<string, Promise<Source>>();
function loadSource(id: string) {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(id);
  if (existing) return existing;
  const request = fetch(
    `/api/operator/crm/records/source/${encodeURIComponent(id)}`,
  )
    .then(async (response) => {
      if (!response.ok) throw new Error("Source unavailable");
      return (await response.json()).record as Source;
    })
    .then((source) => {
      cache.set(id, source);
      while (cache.size > 48) cache.delete(cache.keys().next().value!);
      return source;
    })
    .finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}
export function EvidenceSource({ id }: { id: string }) {
  const [result, setResult] = useState<{
    id: string;
    source: Source | null;
    error: string;
  }>({ id, source: null, error: "" });
  const source = result.id === id ? result.source : null;
  const error = result.id === id ? result.error : "";
  useEffect(() => {
    let active = true;
    setResult({ id, source: null, error: "" });
    loadSource(id)
      .then((source) => {
        if (active) setResult({ id, source, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ id, source: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [id]);
  let safe: URL | null = null;
  try {
    const parsed = new URL(source?.url || "");
    if (["http:", "https:"].includes(parsed.protocol)) safe = parsed;
  } catch {}
  return (
    <div className="op-source">
      {safe ? (
        <a href={safe.href} target="_blank" rel="noreferrer">
          {safe.hostname} ↗
        </a>
      ) : (
        <small>
          {error ||
            (source ? "No public source URL recorded" : "Loading source…")}
        </small>
      )}
      {source?.provider && <small> · {source.provider}</small>}
      {source?.retrieved_at && (
        <small>
          {" "}
          · {new Date(source.retrieved_at).toLocaleDateString("en-AU")}
        </small>
      )}
    </div>
  );
}
