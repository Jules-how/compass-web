import { OperatorShell } from "@/components/OperatorShell";
import { PlanningBoard } from "@/components/planning/PlanningBoard";
export default function PlanningPage() {
  return (
    <OperatorShell width="full">
      <PlanningBoard />
    </OperatorShell>
  );
}
