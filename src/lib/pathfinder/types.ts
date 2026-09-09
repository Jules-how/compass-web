import type { PlanningRow } from "@/lib/planning-server";
import type {
  CompassTask,
  CompassProject,
  CompassBusinessFunction,
  CompassProjectMilestone,
  CompassProjectDependency,
} from "@/lib/types";
export type Actor = "operator" | "agent";
export type WorkType = "project" | "task" | "checkpoint" | "goal";
export type PathfinderLink = {
  id: string;
  goal_id: string;
  work_type: WorkType;
  work_id: string;
  relation: "contributes" | "hypothesis";
  state: "active" | "proposed";
  rationale: string;
  actor: Actor;
  updated_at: string;
};
export type Observation = {
  id: string;
  goal_id: string;
  goal_revision: number;
  idempotency_key: string;
  provenance: "measured" | "reported" | "estimate";
  value: number | null;
  accepted: boolean | null;
  source: string;
  detail: string;
  period_start: string;
  period_end: string;
  observed_at: string;
  evidence_ids: string[];
  actor: Actor;
};
export type PathfinderIssue = {
  id: string;
  goal_id: string;
  issue_key: string;
  title: string;
  symptom: string;
  hypothesis: string;
  alternatives: string;
  next_action: string;
  expected_benefit: string;
  effort_minutes: number | null;
  uncertainty: string;
  prerequisites: string;
  opportunity_cost: string;
  review_on: string | null;
  evidence_ids: string[];
  source: string;
  task_id: string | null;
  status: "open" | "watching" | "resolved" | "dismissed";
  revision: number;
  actor: Actor;
  updated_at: string;
};
export type PathfinderActivity = {
  id: string;
  goal_id: string;
  actor: Actor;
  action: string;
  subject_id: string;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};
export type PathfinderData = {
  readAt: string;
  goals: PlanningRow[];
  links: PathfinderLink[];
  observations: Observation[];
  issues: PathfinderIssue[];
  activity: PathfinderActivity[];
  projects: CompassProject[];
  tasks: CompassTask[];
  checkpoints: CompassProjectMilestone[];
  dependencies: CompassProjectDependency[];
  businessFunctions: CompassBusinessFunction[];
};
