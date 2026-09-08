import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePlanning,
  checkGoalParent,
  goalProgress,
  pricingScenario,
} from "../src/lib/planning-core.mjs";
import { reviewReadiness } from "../src/lib/experiment-review.mjs";
const goal = {
  title: "Revenue",
  period: "quarterly",
  due: "2026-12-31",
  regular: 5000,
  stretch: 10000,
  actual: "",
  unit: "AUD MRR",
};
test("unknown results stay unknown; actual zero needs evidence", () => {
  const g = validatePlanning("goal", goal);
  assert.equal(g.actual, null);
  assert.equal(goalProgress(g), null);
  assert.throws(
    () => validatePlanning("goal", { ...goal, actual: 0 }),
    /where/,
  );
  assert.equal(
    goalProgress(
      validatePlanning("goal", {
        ...goal,
        actual: 0,
        source: "Billing ledger",
      }),
    ),
    0,
  );
});
test("targets and calendar dates are validated", () => {
  assert.throws(() => validatePlanning("goal", { ...goal, stretch: 4000 }));
  assert.throws(() => validatePlanning("goal", { ...goal, due: "2026-02-30" }));
  assert.throws(() =>
    validatePlanning("goal", { ...goal, start: "2027-01-01" }),
  );
});
test("hierarchy rejects self parent, cycles, shorter parents and missing records", () => {
  assert.throws(() =>
    checkGoalParent({ ...goal, parentId: "child" }, "child", []),
  );
  assert.throws(() =>
    checkGoalParent({ ...goal, parentId: "missing" }, "child", []),
  );
  assert.throws(() =>
    checkGoalParent({ ...goal, parentId: "p" }, "child", [
      { id: "p", data: { period: "weekly" } },
    ]),
  );
  assert.doesNotThrow(() =>
    checkGoalParent({ ...goal, parentId: "p" }, "child", [
      { id: "p", data: { period: "yearly" } },
    ]),
  );
  assert.throws(() =>
    checkGoalParent({ ...goal, parentId: "p" }, "child", [
      { id: "p", data: { period: "yearly", parentId: "child" } },
    ]),
  );
});
test("actual time is not inferred from calendar plan", () => {
  const t = validatePlanning("time", {
    title: "Copy review",
    date: "2026-09-08",
    plannedMinutes: 60,
  });
  assert.equal(t.actualMinutes, null);
  assert.throws(() =>
    validatePlanning("time", {
      title: "Copy",
      date: "2026-09-08",
      actualMinutes: 1500,
    }),
  );
});
test("pricing requires explicit costs and uses contribution, not revenue", () => {
  assert.throws(() =>
    pricingScenario({ monthly: 2500, hours: "", hourlyCost: 0, tools: 0 }),
  );
  const p = pricingScenario({
    monthly: 2500,
    hours: 10,
    hourlyCost: 75,
    tools: 100,
    contribution: 1000,
  });
  assert.equal(p.deliveryCost, 850);
  assert.equal(p.contributionBeforeOverheads, 1650);
  assert.equal(p.extraWinsToCoverFee, 3);
});
const input = {
  control: { instantly_campaign_id: "a", sample_size_target: 100 },
  challenger: { instantly_campaign_id: "b", sample_size_target: 100 },
  controlMetrics: { sendCount: 102, bouncedCount: 2 },
  challengerMetrics: { sendCount: 101, bouncedCount: 1 },
  note: "Qualified reply review",
  reviewDate: "2026-09-01",
  today: "2026-09-08",
  comparable: true,
  mature: true,
};
test("winner assessment needs independent arms, both samples and mature outcomes", () => {
  assert.deepEqual(reviewReadiness(input), []);
  assert.ok(
    reviewReadiness({
      ...input,
      challenger: { ...input.challenger, instantly_campaign_id: "a" },
    }).length,
  );
  assert.ok(reviewReadiness({ ...input, challengerMetrics: null }).length);
  assert.ok(
    reviewReadiness({
      ...input,
      challengerMetrics: { sendCount: 99, bouncedCount: 0 },
    }).length,
  );
  assert.ok(reviewReadiness({ ...input, mature: false }).length);
  assert.ok(reviewReadiness({ ...input, reviewDate: "2026-09-10" }).length);
});

import { isPermanentSuppression } from '../src/lib/outreach-suppression.mjs'
test('explicit opt-out remains distinct from not interested',()=>{assert.equal(isPermanentSuppression('unsubscribed'),true);assert.equal(isPermanentSuppression('suppressed'),true);assert.equal(isPermanentSuppression('out_of_office'),false);assert.equal(isPermanentSuppression('not_interested'),false)})
