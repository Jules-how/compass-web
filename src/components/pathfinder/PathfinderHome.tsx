"use client";
import Link from "next/link";
import { useCachedJson } from "@/lib/use-cached-json";
import type { PathfinderData } from "@/lib/pathfinder/types";
/** A view of the same persistent findings; this component creates no recommendations. */
export function PathfinderHome() {
  const { data, error } = useCachedJson<PathfinderData>(
    "/api/pathfinder",
    "/api/pathfinder",
  );
  if (error && !data)
    return (
      <div className="compass-panel p-4 text-xs text-stone-500">
        Pathfinder findings unavailable.{" "}
        <Link href="/planning" className="underline">
          Open Pathfinder
        </Link>
      </div>
    );
  const issues =
    data?.issues.filter((i) => ["open", "watching"].includes(i.status)) ?? [];
  if (!issues.length) return null;
  return (
    <section
      className="compass-panel p-4 sm:p-5"
      aria-label="Goal-linked daily findings"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pathfinder · next decisions</h2>
        <Link className="compass-btn-ghost" href="/planning">
          Open map
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {issues.slice(0, 3).map((i) => (
          <li key={i.id}>
            <Link
              className="block rounded-xl bg-stone-50 p-3 hover:bg-stone-100"
              href={`/planning?goal=${encodeURIComponent(i.goal_id)}`}
            >
              <span className="text-xs text-stone-500">
                {data?.goals.find((g) => g.id === i.goal_id)?.data.title}
              </span>
              <strong className="mt-1 block text-sm">{i.title}</strong>
              <p className="mt-1 text-xs text-stone-600">{i.next_action}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
