import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, expectValue, runCounterfactualExperiment } from "../dist/index.js";
import { evaluateCounterfactualRobustness } from "../evaluation/evaluate-counterfactual-robustness.mjs";

function definition() {
  return defineIntent("checkout", "Checkout flow", [
    Given("context", "Account exists", context => Boolean(context.account)),
    When("charge", "Payment enabled", context => context.paymentEnabled),
    Then("reconcile", "Amount matches", context => expectValue(10, context.actualAmount)),
  ]);
}

async function repetition(index, amountAfterFix = 10) {
  const interventions = [
    { id: "fix", targetClauseId: "reconcile", description: "Correct amount", apply: context => { context.actualAmount = amountAfterFix; } },
    { id: "noop", targetClauseId: "reconcile", description: "No change", apply: () => {} },
  ];
  const result = await runCounterfactualExperiment(definition(), {
    account: true, paymentEnabled: true, actualAmount: 11,
  }, interventions, {
    experimentId: `experiment-${index}`,
    baselineRunId: `baseline-${index}`,
    counterfactualRunIds: { fix: `fix-${index}`, noop: `noop-${index}` },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  return { repetitionId: `rep-${index}`, replays: result.replays };
}

test("robustness evaluator measures stable outcomes across independent repetitions", async () => {
  const result = evaluateCounterfactualRobustness({
    experiments: [await repetition(1), await repetition(2), await repetition(3)],
  });
  assert.equal(result.causalClaim, false);
  assert.equal(result.repetitionCount, 3);
  assert.equal(result.baselineStability.stable, true);
  const fix = result.interventions.find(item => item.interventionId === "fix");
  const noop = result.interventions.find(item => item.interventionId === "noop");
  assert.equal(fix.stableResolution, true);
  assert.equal(fix.resolvedRate, 1);
  assert.equal(fix.outcomeCounts.resolved, 3);
  assert.equal(noop.outcomeCounts.persists, 3);
  assert.equal(noop.resolvedRate, 0);
  assert.ok(fix.resolvedRateWilson95.lower < 1);
  assert.ok(fix.resolvedRateWilson95.upper <= 1);
});

test("robustness evaluator reports unstable baselines and mixed intervention outcomes", async () => {
  const experiments = [
    await repetition(1),
    await repetition(2, 9),
  ];
  const result = evaluateCounterfactualRobustness({ experiments });
  assert.equal(result.baselineStability.stable, true);
  const fix = result.interventions.find(item => item.interventionId === "fix");
  assert.equal(fix.outcomeCounts.resolved, 1);
  assert.equal(fix.outcomeCounts.persists, 1);
  assert.equal(fix.stableResolution, false);
  assert.equal(fix.outcomeConsistency, 0.5);
});

test("robustness evaluator rejects insufficient, duplicate or unbalanced repetitions", async () => {
  const one = await repetition(1);
  await assert.rejects(
    Promise.resolve().then(() => evaluateCounterfactualRobustness({ experiments: [one] })),
    /At least two independent repetitions/,
  );
  await assert.throws(
    () => evaluateCounterfactualRobustness({ experiments: [one, one] }),
    /Duplicate repetitionId/,
  );
  const altered = await repetition(2);
  altered.replays = altered.replays.slice(0, 1);
  assert.throws(
    () => evaluateCounterfactualRobustness({ experiments: [one, altered] }),
    /same intervention set/,
  );
  const duplicateRun = await repetition(3);
  duplicateRun.replays[0].counterfactual.runId = one.replays[0].counterfactual.runId;
  assert.throws(
    () => evaluateCounterfactualRobustness({ experiments: [one, duplicateRun] }),
    /Run ID reused/,
  );
});
