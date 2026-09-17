/** Per-mounted-reader cache. Never writes CRM data or persists it in browser storage. */
export type PipelineReadSnapshot<T> = {
  data: T | null;
  error: string;
  loading: boolean;
};
type Entry<T> = { data: T; at: number; revision: number };
type Reader<T> = (path: string, signal: AbortSignal) => Promise<T>;

export function createPipelineReadStore<T>(
  read: Reader<T>,
  { maxEntries = 12, staleMs = 30_000, now = Date.now } = {},
) {
  const cache = new Map<string, Entry<T>>();
  let sequence = 0;
  let lastRevision: number | undefined;
  let controller: AbortController | null = null;
  let settled: { path: string; revision: number; value: PipelineReadSnapshot<T> } | null = null;

  const peek = (path: string | null, revision = 0): PipelineReadSnapshot<T> => {
    if (path === null) return { data: null, error: '', loading: false };
    const cached = cache.get(path);
    return {
      data: cached?.data ?? null,
      error: '',
      loading: !cached || cached.revision !== revision || now() - cached.at >= staleMs,
    };
  };
  const snapshot = (path: string | null, revision = 0): PipelineReadSnapshot<T> => {
    if (settled?.path === path && settled.revision === revision) return settled.value;
    return peek(path, revision);
  };

  function load(path: string | null, revision: number, publish: (value: PipelineReadSnapshot<T>) => void) {
    const current = ++sequence;
    controller?.abort();
    controller = null;
    settled = null;
    if (lastRevision !== undefined && lastRevision !== revision) {
      // Keep only this exact view as read-only stale content while refreshing.
      // In particular, a capability refresh must not unmount an open editor.
      const previous = path === null ? undefined : cache.get(path);
      cache.clear();
      if (path !== null && previous) cache.set(path, previous);
    }
    lastRevision = revision;
    const initial = peek(path, revision);
    const emit = (value: PipelineReadSnapshot<T>) => {
      if (current !== sequence) return;
      if (path !== null) settled = { path, revision, value };
      publish(value);
    };
    emit(initial);
    if (path === null || !initial.loading) {
      if (path !== null) {
        const value = cache.get(path);
        if (value) { cache.delete(path); cache.set(path, value); }
      }
      return () => { if (current === sequence) { sequence++; settled = null; } };
    }
    const abort = new AbortController();
    controller = abort;
    void Promise.resolve().then(() => {
      if (abort.signal.aborted || current !== sequence) return undefined;
      return read(path, abort.signal);
    }).then(data => {
      if (abort.signal.aborted || current !== sequence || data === undefined) return;
      cache.delete(path);
      cache.set(path, { data, at: now(), revision });
      while (cache.size > Math.max(1, maxEntries)) cache.delete(cache.keys().next().value!);
      emit({ data, error: '', loading: false });
    }).catch((error: unknown) => {
      if (abort.signal.aborted || current !== sequence) return;
      const status = (error as { status?: number } | null)?.status;
      const denied = status === 401 || status === 403;
      if (denied) cache.clear();
      emit({
        data: denied ? null : initial.data,
        error: error instanceof Error ? error.message : 'Could not load this view. Try refreshing.',
        loading: false,
      });
    });
    return () => {
      abort.abort();
      if (current === sequence) { sequence++; settled = null; }
    };
  }
  return { load, peek, snapshot };
}

export function mergePipelineRecords<T extends { id: string }>(before: T[], next: T[]): T[] {
  return [...new Map([...before, ...next].map(record => [record.id, record])).values()];
}
