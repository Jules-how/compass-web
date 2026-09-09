/** Preserve optimistic concurrency without putting encrypted content in a URL. */
export async function compareAndSwapPlanning(db, id, previous, value, at) {
  const { data, error } = await db.rpc("compass_save_planning_revision", {
    p_id: id,
    p_expected_value: previous,
    p_value: value,
    p_at: at,
  });
  if (error) throw new Error("Unable to save planning record. Please retry after checking service status.");
  if (data !== true) throw new Error("This record changed. Reload before editing it.");
}

export function currentPlanningRecord(row) {
  const { history, ...current } = row;
  return current;
}
