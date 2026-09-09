import { OperatorShell } from "@/components/OperatorShell";
import { PlanningBoard } from "@/components/planning/PlanningBoard";
import { PathfinderBoard } from "@/components/pathfinder/PathfinderBoard";
import { PlanningRecords } from "@/components/planning/PlanningRecords";
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; goal?: string }>;
}) {
  const params = await searchParams;
  return (
    <OperatorShell width="full">
      {params.view === "records" ? (
        <PlanningBoard />
      ) : params.view === "activity" ? (
        <PlanningRecords />
      ) : (
        <PathfinderBoard initialGoalId={params.goal} />
      )}
    </OperatorShell>
  );
}
