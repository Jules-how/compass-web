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
import {
  ArrowUpRight,
  Flag,
  Maximize2,
  Minus,
  Plus,
  Search,
  Target,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { journeyForView } from "@/lib/pathfinder/workspace.mjs";
import { semanticLevel } from "@/lib/pathfinder/core.mjs";
import type { PathfinderData } from "@/lib/pathfinder/types";
import type { AddKind } from "./QuickAdd";
type NodeData = {
  kind: string;
  recordId: string;
  label: string;
  subtitle: string;
  goalId: string;
  notes?: string;
  date?: string;
  detail?: string;
  projectId?: string;
  add: (kind: AddKind, goalId: string, projectId?: string) => void;
};
function JourneyNode({ data, selected }: NodeProps<Node<NodeData>>) {
  const stage = data.kind === "goal" || data.kind === "checkpoint";
  return (
    <div
      className={`pathfinder-journey-node is-${data.kind} ${selected ? "is-selected" : ""}`}
    >
      <Handle id="route-in" type="target" position={Position.Left} />
      <Handle id="route-out" type="source" position={Position.Right} />
      <Handle id="work-in" type="target" position={Position.Top} />
      <Handle id="work-out" type="source" position={Position.Bottom} />
      <div className="journey-node-eyebrow">
        <span>
          {data.kind === "goal" ? (
            <Target size={13} aria-hidden="true" />
          ) : data.kind === "checkpoint" ? (
            <Flag size={13} aria-hidden="true" />
          ) : null}
          {data.kind === "checkpoint"
            ? "Milestone"
            : data.subtitle.startsWith("Sprint")
              ? "Sprint"
              : data.kind}
        </span>
        <span>
          {data.date
            ? new Intl.DateTimeFormat("en-AU", {
                day: "numeric",
                month: "short",
              }).format(new Date(`${data.date.slice(0, 10)}T12:00:00`))
            : "No date yet"}
        </span>
      </div>
      <strong>{data.label}</strong>
      <p className="journey-node-status">
        {data.subtitle.replaceAll("_", " ").replaceAll("-", " ")}
      </p>
      {data.detail !== "strategy" && data.notes && (
        <p className="journey-node-notes">{data.notes}</p>
      )}
      {stage && (
        <button
          className="journey-node-add nodrag nopan"
          onClick={(event) => {
            event.stopPropagation();
            data.add("task", data.goalId, data.projectId);
          }}
        >
          <Plus size={13} aria-hidden="true" />
          Add next action
          <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
const nodeTypes = { pathfinder: JourneyNode };
const KEY = "compass.pathfinder.journey.v2";
type MapMemory = {
  positions: Record<string, { x: number; y: number }>;
  viewport?: Viewport;
};
function readMemory(): MapMemory {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    const positions = Object.fromEntries(
      Object.entries(saved?.positions ?? {}).filter(
        ([, p]) =>
          p &&
          typeof p === "object" &&
          Number.isFinite((p as any).x) &&
          Number.isFinite((p as any).y),
      ),
    );
    const v = saved?.viewport;
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
  onAdd,
  onCreateGoal,
}: {
  data: PathfinderData;
  goalId: string;
  onFocus: (id: string) => void;
  onOpen: (kind: string, id: string) => void;
  onAdd: (kind: AddKind, goalId?: string, projectId?: string) => void;
  onCreateGoal: () => void;
}) {
  const flow = useReactFlow();
  const [zoom, setZoom] = useState(0.9),
    [proposals, setProposals] = useState(false),
    [history, setHistory] = useState(true),
    [list, setList] = useState(false),
    [query, setQuery] = useState("");
  const [memory, setMemory] = useState<MapMemory>({ positions: {} }),
    [loaded, setLoaded] = useState(false);
  const current = useRef(memory);
  const [detail, setDetail] = useState<
    "strategy" | "route" | "execution" | null
  >("route");
  const level = detail ?? semanticLevel(zoom);
  const reducedMotion = useRef(false);
  useEffect(() => {
    const saved = readMemory();
    setMemory(saved);
    current.current = saved;
    setLoaded(true);
    reducedMotion.current = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);
  const persist = useCallback((patch: Partial<MapMemory>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setMemory(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* layout remains usable without storage */
    }
  }, []);
  const graph = useMemo(
    () =>
      journeyForView(data, {
        level,
        goalId,
        proposals,
        history,
        positions: memory.positions,
      }),
    [data, level, goalId, proposals, history, memory.positions],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  useEffect(() => {
    setNodes(
      graph.nodes.map((node) => ({
        ...node,
        data: { ...node.data, add: onAdd },
      })),
    );
  }, [graph.nodes, onAdd, setNodes]);
  const [fitRequested, setFitRequested] = useState(false);
  useEffect(() => {
    if (!fitRequested) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({
        padding: 0.18,
        minZoom: 0.35,
        maxZoom: 1.05,
        duration: reducedMotion.current ? 0 : 260,
      });
      setFitRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [fitRequested, nodes, flow]);
  const matches = useMemo(
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
        ...data.checkpoints.map((c) => ({
          kind: "checkpoint",
          id: c.id,
          title: c.title,
        })),
        ...data.tasks.map((t) => ({ kind: "task", id: t.id, title: t.title })),
      ]
        .filter(
          (r) => query && r.title.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 12),
    [data, query],
  );
  const previousGoal = useRef(goalId);
  useEffect(() => {
    if (loaded && previousGoal.current !== goalId) {
      previousGoal.current = goalId;
      void flow.setViewport(
        { x: 36, y: 28, zoom: 0.9 },
        { duration: reducedMotion.current ? 0 : 260 },
      );
    }
  }, [goalId, flow, loaded]);
  if (!loaded)
    return (
      <div className="pathfinder-map-loading" role="status">
        Opening your path…
      </div>
    );
  return (
    <section className="pathfinder-map" aria-label="Pathfinder journey map">
      <div className="pathfinder-map-toolbar">
        <div
          className="pathfinder-map-views"
          role="group"
          aria-label="Map detail level"
        >
          {(
            [
              ["strategy", "Milestones"],
              ["route", "Sprints & projects"],
              ["execution", "Tasks & notes"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={level === value}
              onClick={() => {
                setDetail(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <button
            className="compass-btn-ghost"
            aria-pressed={list}
            onClick={() => setList(!list)}
          >
            {list ? "Map view" : "List view"}
          </button>
          <button className="compass-btn-primary" onClick={() => onAdd("task")}>
            <Plus size={14} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
      <div className="pathfinder-map-subtoolbar">
        <label className="pathfinder-map-search">
          <Search size={14} aria-hidden="true" />
          <input
            aria-label="Search goals and work"
            placeholder="Find a goal, milestone or task…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
          {query && (
            <ul>
              {matches.length ? (
                matches.map((r) => (
                  <li key={`${r.kind}:${r.id}`}>
                    <button
                      onClick={() => {
                        onOpen(r.kind, r.id);
                        setQuery("");
                      }}
                    >
                      {r.title}
                      <small>
                        {r.kind === "checkpoint" ? "milestone" : r.kind}
                      </small>
                    </button>
                  </li>
                ))
              ) : (
                <li>No matching work.</li>
              )}
            </ul>
          )}
        </label>
        <details className="pathfinder-map-options">
          <summary>View options</summary>
          <div>
            <label>
              <input
                type="checkbox"
                checked={proposals}
                onChange={(e) => setProposals(e.target.checked)}
              />
              Include proposed links
            </label>
            <label>
              <input
                type="checkbox"
                checked={history}
                onChange={(e) => setHistory(e.target.checked)}
              />
              Include achieved goals
            </label>
            <button
              onClick={() => {
                persist({ positions: {}, viewport: undefined });
                setFitRequested(true);
              }}
            >
              Arrange by date
            </button>
            {goalId && (
              <button onClick={() => onFocus("")}>Show the full journey</button>
            )}
          </div>
        </details>
      </div>
      <div className="pathfinder-map-canvas">
        <div
          className={list ? "invisible h-full" : "h-full"}
          aria-hidden={list || undefined}
          inert={list || undefined}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !(event.target as HTMLElement).closest("button,input")
            ) {
              const node = graph.nodes.find(
                (n) =>
                  n.id ===
                  (event.target as HTMLElement)
                    .closest("[data-id]")
                    ?.getAttribute("data-id"),
              );
              if (node) {
                event.preventDefault();
                onOpen(node.data.kind, node.data.recordId);
              }
            }
          }}
        >
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            zoomOnScroll={false}
            panOnScroll={false}
            preventScrolling={false}
            defaultViewport={memory.viewport ?? { x: 36, y: 28, zoom: 0.9 }}
            minZoom={0.25}
            maxZoom={2}
            onInit={(instance) => setZoom(instance.getZoom())}
            onMove={(event, viewport) => {
              if (event && Math.abs(viewport.zoom - zoom) > 0.001)
                setDetail(null);
              setZoom(viewport.zoom);
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
              if ((event.target as HTMLElement).closest("button")) return;
              (event.currentTarget as HTMLElement).focus();
              onOpen(node.data.kind, node.data.recordId);
            }}
            onNodeDoubleClick={(_, node) => {
              if (node.data.kind === "goal") onFocus(node.data.recordId);
            }}
          >
            <Background color="var(--folio-line)" gap={22} size={1} />
          </ReactFlow>
        </div>
        {!list && (
          <div className="pathfinder-map-zoom">
            <button
              aria-label="Zoom out"
              onClick={() => {
                setDetail(null);
                void flow.zoomOut({
                  duration: reducedMotion.current ? 0 : 200,
                });
              }}
            >
              <Minus size={15} aria-hidden="true" />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => {
                setDetail(null);
                void flow.zoomIn({ duration: reducedMotion.current ? 0 : 200 });
              }}
            >
              <Plus size={15} aria-hidden="true" />
            </button>
            <button
              aria-label="Fit journey in view"
              onClick={() => setFitRequested(true)}
            >
              <Maximize2 size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        {list && (
          <div className="pathfinder-map-list">
            <ul>
              {graph.nodes.map((node) => (
                <li key={node.id}>
                  <button
                    onClick={() => onOpen(node.data.kind, node.data.recordId)}
                  >
                    <small>
                      {node.data.kind === "checkpoint"
                        ? "Milestone"
                        : node.data.kind}
                    </small>
                    <strong>{node.data.label}</strong>
                    <span>{node.data.subtitle}</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!graph.nodes.length && (
          <div className="pathfinder-map-empty">
            <Target size={30} aria-hidden="true" />
            <h3>Your next chapter starts here.</h3>
            <p>Add a goal, then build a path of milestones and small steps.</p>
            <button className="compass-btn-primary" onClick={onCreateGoal}>
              <Plus size={15} aria-hidden="true" />
              Add a goal
            </button>
          </div>
        )}
      </div>
      <footer>
        <span>Scroll for the timeline · pinch or use + / − to zoom</span>
        <span>Left to right, by date · drag to arrange</span>
      </footer>
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
