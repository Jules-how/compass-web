import { serializePipelineSignal } from "@/lib/outbound-pipeline";
import type {
  SignalDefinition,
  SignalObservation,
} from "@/lib/outbound-pipeline";
/** Preview cannot turn conflicting or unsupported observations into confident copy. */
export function previewSignalValues(
  observations: SignalObservation[],
  definitions: SignalDefinition[],
) {
  const superseded = new Set(
    observations.map((value) => value.supersedes_id).filter(Boolean),
  );
  const eligible = new Set(
    definitions
      .filter((value) => value.writing_eligible)
      .map((value) => value.id),
  );
  const grouped = new Map<string, Set<string>>();
  for (const observation of observations) {
    if (
      superseded.has(observation.id) ||
      !eligible.has(observation.signal_id) ||
      !observation.source_id ||
      !observation.quote ||
      observation.evidence_strength === "none" ||
      observation.usefulness === "none"
    )
      continue;
    const value = serializePipelineSignal(observation.value);
    if (!value.trim()) continue;
    const candidates = grouped.get(observation.signal_id) || new Set<string>();
    candidates.add(value);
    grouped.set(observation.signal_id, candidates);
  }
  const values: Record<string, string> = {},
    conflicts: string[] = [];
  for (const [id, candidates] of grouped)
    if (candidates.size === 1) values[id] = [...candidates][0];
    else conflicts.push(id);
  return { values, conflicts };
}
export function runScopeFilters(filters: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => Boolean(value.trim())),
  );
}
