"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Handle,
  Position,
  useReactFlow,
  useNodesState,
  type NodeProps,
  type Node,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphForView, semanticLevel } from "@/lib/pathfinder/core.mjs";
import type { PathfinderData } from "@/lib/pathfinder/types";

type NodeData = {
  kind: string;
  recordId: string;
  label: string;
  subtitle: string;
};
function CircleNode({ data, selected }: NodeProps<Node<NodeData>>) {
  const goal = data.kind === "goal";
  return (
    <div
      className={`folio-map-note flex flex-col items-center justify-center rounded-full border-2 bg-white p-4 text-center shadow-soft ${goal ? "size-40" : "size-32"} ${selected ? "border-[#c2410c] ring-4 ring-orange-100" : "border-stone-200"}`}
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <span className="text-[10px] font-medium uppercase tracking-wider text-stone-500">
        {goal
          ? "Outcome"
          : data.kind === "checkpoint"
            ? "Checkpoint"
            : data.kind === "issue"
              ? "Decision"
              : data.kind}
      </span>
      <strong
        className={`${goal ? "text-[14px]" : "text-[12px]"} mt-1 line-clamp-3 leading-snug text-stone-900`}
      >
        {data.label}
      </strong>
      <span className="mt-2 line-clamp-2 text-[10px] leading-tight text-stone-600">
        {data.subtitle.replaceAll("_", " ").replaceAll("-", " ")}
      </span>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { pathfinder: CircleNode };
const KEY = "compass.pathfinder.map.v1";
type MapMemory = {
  positions: Record<string, { x: number; y: number }>;
  viewport?: Viewport;
};
function readMemory(): MapMemory {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!saved || typeof saved !== "object") return { positions: {} };
    const positions = Object.fromEntries(
      Object.entries(saved.positions ?? {}).filter(
        ([, p]) =>
          p &&
          typeof p === "object" &&
          Number.isFinite((p as any).x) &&
          Number.isFinite((p as any).y),
      ),
    );
    const v = saved.viewport;
    return {
      positions: positions as MapMemory["positions"],
      viewport:
        v &&
        [v.x, v.y, v.zoom].every(Number.isFinite) &&
        v.zoom >= 0.25 &&
        v.zoom <= 2
          ? v
          : undefined,
    };
  } catch {
    return { positions: {} };
  }
}
function MapContents({
  data,
  goalId,
  onFocus,
  onOpen,
}: {
  data: PathfinderData;
  goalId: string;
  onFocus: (id: string) => void;
  onOpen: (kind: string, id: string) => void;
}) {
  const flow = useReactFlow();
  const [zoom, setZoom] = useState(1);
  const [proposals, setProposals] = useState(false);
  const [history, setHistory] = useState(true);
  const [list, setList] = useState(false);
  const [query, setQuery] = useState("");
  const [memory, setMemory] = useState<MapMemory>({ positions: {} });
  const [loaded, setLoaded] = useState(false);
  const current = useRef(memory);
  useEffect(() => {
    const m = readMemory();
    m.positions ??= {};
    setMemory(m);
    current.current = m;
    setLoaded(true);
  }, []);
  const persist = useCallback((patch: Partial<MapMemory>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setMemory(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* no persistence */
    }
  }, []);
  const [detail, setDetail] = useState<
    "strategy" | "route" | "execution" | null
  >(null);
  const [fitRequested, setFitRequested] = useState(false);
  const level = detail ?? semanticLevel(zoom);
  const graph = useMemo(
    () =>
      graphForView(data, {
        level,
        goalId,
        proposals,
        history,
        positions: memory.positions,
      }),
    [data, level, goalId, proposals, history, memory.positions],
  );
  useEffect(() => {
    if (!loaded) return;
    const missing = graph.nodes.filter((n) => !current.current.positions[n.id]);
    if (missing.length)
      persist({
        positions: {
          ...current.current.positions,
          ...Object.fromEntries(missing.map((n) => [n.id, n.position])),
        },
      });
  }, [graph.nodes, loaded, persist]);
  const [renderedNodes, setRenderedNodes, onNodesChange] = useNodesState<
    Node<NodeData>
  >([]);
  useEffect(() => {
    setRenderedNodes(graph.nodes);
  }, [graph.nodes, setRenderedNodes]);
  useEffect(() => {
    if (!fitRequested) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.25, maxZoom: 1.4 });
      setFitRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [fitRequested, renderedNodes, flow]);
  const allMatches = useMemo(
    () =>
      [
        ...data.goals
          .filter((g) => !g.data.archived)
          .map((g) => ({
            kind: "goal",
            id: g.id,
            title: g.data.title as string,
          })),
        ...data.projects.map((p) => ({
          kind: "project",
          id: p.id,
          title: p.name,
        })),
        ...data.tasks.map((t) => ({ kind: "task", id: t.id, title: t.title })),
      ]
        .filter(
          (r) => query && r.title.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10),
    [data, query],
  );
  useEffect(() => {
    if (goalId && loaded) {
      const p = current.current.positions[goalId] ?? { x: 500, y: 0 };
      void flow.setCenter(p.x + 80, p.y + 80, { zoom: 1 });
    }
  }, [goalId, flow, loaded]);
  if (!loaded)
    return (
      <p role="status" className="p-8">
        Opening map…
      </p>
    );
  return (
    <section
      className="compass-panel overflow-hidden"
      aria-label="Pathfinder strategy map"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search goals and work</span>
          <input
            className="compass-input w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search goals and work…"
          />
          {query && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-stone-200 bg-white p-2 shadow-soft">
              {allMatches.length ? (
                allMatches.map((r) => (
                  <li key={`${r.kind}:${r.id}`}>
                    <button
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-100"
                      onClick={() => {
                        onOpen(r.kind, r.id);
                        setQuery("");
                      }}
                    >
                      {r.title}
                      <span className="ml-2 text-xs text-stone-500">
                        {r.kind}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="p-3 text-sm text-stone-500">
                  No matching work.
                </li>
              )}
            </ul>
          )}
        </label>
        <button
          className="compass-btn-secondary"
          onClick={() => {
            setDetail(level);
            setFitRequested(true);
          }}
        >
          Fit view
        </button>
        <button
          className="compass-btn-secondary"
          onClick={() => {
            setDetail(null);
            setHistory(false);
            onFocus("");
            void flow.setViewport({ x: 60, y: 80, zoom: 0.65 });
          }}
        >
          Present
        </button>
        {goalId && (
          <button
            className="compass-btn-secondary"
            onClick={() => {
              setDetail(null);
              onFocus("");
              void flow.setViewport({ x: 60, y: 80, zoom: 0.65 });
            }}
          >
            All outcomes
          </button>
        )}
        <button
          className="compass-btn-secondary"
          aria-pressed={list}
          onClick={() => setList(!list)}
        >
          {list ? "Map" : "List"}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-2">
        <div role="group" aria-label="Map detail level" className="flex gap-1">
          {(["strategy", "route", "execution"] as const).map((name) => (
            <button
              key={name}
              className={`rounded-xl px-3 py-1.5 text-xs capitalize ${level === name ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
              aria-pressed={level === name}
              onClick={() => {
                setDetail(name);
                setFitRequested(true);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-stone-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={proposals}
              onChange={(e) => setProposals(e.target.checked)}
            />
            Proposals
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            Achieved outcomes
          </label>
        </div>
      </div>
      <div className="relative h-[min(68vh,760px)] min-h-[430px] bg-[#faf9f6]">
        <div
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const target = (event.target as HTMLElement).closest("[data-id]");
              const node = graph.nodes.find(
                (n) => n.id === target?.getAttribute("data-id"),
              );
              if (node) {
                event.preventDefault();
                onOpen(node.data.kind, node.data.recordId);
              }
            }
          }}
          className={list ? "invisible h-full" : "h-full"}
          aria-hidden={list || undefined}
          inert={list || undefined}
        >
          <ReactFlow
            nodes={renderedNodes}
            onNodesChange={onNodesChange}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            defaultViewport={memory.viewport ?? { x: 60, y: 70, zoom: 0.65 }}
            minZoom={0.25}
            maxZoom={2}
            onInit={(instance) => setZoom(instance.getZoom())}
            onMove={(event, v) => {
              if (event && v.zoom !== zoom) setDetail(null);
              setZoom(v.zoom);
            }}
            onMoveEnd={(_, viewport) => persist({ viewport })}
            onNodeDragStop={(_, node) =>
              persist({
                positions: {
                  ...current.current.positions,
                  [node.id]: node.position,
                },
              })
            }
            onNodeClick={(event, node) => {
              (event.currentTarget as HTMLElement).focus();
              onOpen(node.data.kind, node.data.recordId);
            }}
            onNodeDoubleClick={(_, node) => {
              if (node.data.kind === "goal") onFocus(node.data.recordId);
            }}
            proOptions={{ hideAttribution: false }}
          >
            <Background color="#dedbd5" gap={24} />
          </ReactFlow>
        </div>
        {list && (
          <div className="absolute inset-0 overflow-auto p-5">
            <ul className="grid gap-3 sm:grid-cols-2">
              {graph.nodes.map((node) => (
                <li key={node.id}>
                  <button
                    className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-4 text-left"
                    onClick={() => onOpen(node.data.kind, node.data.recordId)}
                  >
                    <span>
                      <span className="block text-xs capitalize text-stone-500">
                        {node.data.kind}
                      </span>
                      <strong className="text-sm">{node.data.label}</strong>
                      <span className="block text-xs text-stone-500">
                        {node.data.subtitle}
                      </span>
                    </span>
                    <span aria-hidden>↗</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!graph.nodes.length && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-stone-500">
            {data.goals.length
              ? "No outcomes match this view. Enable achieved outcomes or return to all outcomes."
              : "Start with one outcome. Connect the work you already have."}
          </div>
        )}
      </div>
      <p className="border-t border-stone-200 px-4 py-3 text-xs text-stone-500">
        Scroll to reveal detail · click for context · drag to arrange · dashed
        connections are proposals. Connections express contribution, not proven
        causation.
      </p>
    </section>
  );
}
export function PathfinderMap(props: Parameters<typeof MapContents>[0]) {
  return (
    <ReactFlowProvider>
      <MapContents {...props} />
    </ReactFlowProvider>
  );
}
