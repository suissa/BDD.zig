import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, expectValue, runCounterfactualExperiment } from "../dist/index.js";
import { evaluateCounterfactualSensitivity } from "../evaluation/evaluate-counterfactual-sensitivity.mjs";

function definition() {
  return defineIntent("checkout", "Checkout flow", [
    Given("context", "Account exists", context => Boolean(context.account)),
    When("charge", "Payment enabled", context => context.paymentEnabled),
    Then("reconcile", "Amount matches", context => expectValue(10, context.actualAmount)),
  ]);
}

async function condition(conditionId, amount, offset) {
  const experiments = [];
  for (let repetition = 1; repetition <= 2; repetition += 1) {
    const run = offset + repetition;
    const result = await runCounterfactualExperiment(definition(), {
      account: true, paymentEnabled: true, actualAmount: 11,
    }, [
      { id: "fix", targetClauseId: "reconcile", description: "Correct amount", apply: context => { context.actualAmount = amount; } },
      { id: "noop", targetClauseId: "reconcile", description: "No change", apply: () => {} },
    ], {
      experimentId: `${conditionId}-experiment-${repetition}`,
      baselineRunId: `${conditionId}-baseline-${repetition}`,
      counterfactualRunIds: { fix: `${conditionId}-fix-${repetition}`, noop: `${conditionId}-noop-${repetition}` },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    experiments.push({ repetitionId: `${conditionId}-rep-${repetition}`, replays: result.replays });
  }
  return { conditionId, label: conditionId, experiments };
}

test("sensitivity evaluator distinguishes stable and context-sensitive interventions", async () => {
  const result = evaluateCounterfactualSensitivity({
    conditions: [
      await condition("normal", 10, 0),
      await condition("degraded", 9, 10),
    ],
  });
  assert.equal(result.causalClaim, false);
  assert.equal(result.conditionCount, 2);
  const fix = result.interventions.find(item => item.interventionId === "fix");
  const noop = result.interventions.find(item => item.interventionId === "noop");
  assert.equal(fix.classification, "context-sensitive");
  assert.equal(fix.resolutionRateSpread, 1);
  assert.equal(fix.dominantOutcomeChangesAcrossConditions, true);
  assert.equal(noop.classification, "stable-across-tested-contexts");
  assert.equal(noop.resolutionRateSpread, 0);\n  assert.equal(fix.byCondition[0].resolvedRateWilson95.lower < 1, true);\n  assert.equal(fix.resolutionRateDifferenceIntervals95.length, 1);\n  assert.equal(fix.resolutionRateDifferenceIntervals95[0].excludesZero, false);\n  assert.equal(fix.uncertaintyAssessment, "overlapping-or-inconclusive");\n  assert.equal(noop.uncertaintyAssessment, "overlapping-or-inconclusive");
});

test("sensitivity evaluator supports a configurable threshold and distribution distance", async () => {
  const result = evaluateCounterfactualSensitivity({
    conditions: [
      await condition("a", 10, 20),
      await condition("b", 10, 30),
    ],
    sensitivityThreshold: 0.25,
  });
  const fix = result.interventions.find(item => item.interventionId === "fix");
  assert.equal(fix.classification, "stable-across-tested-contexts");
  assert.equal(fix.maximumOutcomeDistributionDistance, 0);
});

test("sensitivity evaluator rejects invalid conditions, thresholds and reused runs", async () => {
  const first = await condition("first", 10, 40);
  const second = await condition("second", 10, 50);
  assert.throws(() => evaluateCounterfactualSensitivity({ conditions: [first] }), /At least two context conditions/);
  assert.throws(() => evaluateCounterfactualSensitivity({ conditions: [first, first] }), /Duplicate conditionId/);
  assert.throws(() => evaluateCounterfactualSensitivity({ conditions: [first, second], sensitivityThreshold: 2 }), /between 0 and 1/);
  second.experiments[0].replays[0].baseline.runId = first.experiments[0].replays[0].baseline.runId;
  assert.throws(() => evaluateCounterfactualSensitivity({ conditions: [first, second] }), /Run ID reused across context conditions/);
});

test("sensitivity evaluator rejects intervention metadata drift across conditions", async () => {
  const first = await condition("first", 10, 60);
  const second = await condition("second", 10, 70);
  second.experiments[0].replays[0].intervention.description = "Different intervention";
  assert.throws(() => evaluateCounterfactualSensitivity({ conditions: [first, second] }), /metadata changed between context conditions/);
});


test("sensitivity evaluator reports pairwise intervals for every condition pair", async () => {
  const result = evaluateCounterfactualSensitivity({
    conditions: [
      await condition("one", 10, 80),
      await condition("two", 10, 90),
      await condition("three", 10, 100),
    ],
  });
  const fix = result.interventions.find(item => item.interventionId === "fix");
  assert.equal(fix.resolutionRateDifferenceIntervals95.length, 3);
  assert.deepEqual(
    fix.resolutionRateDifferenceIntervals95.map(item => [item.conditionA, item.conditionB]),
    [["one", "two"], ["one", "three"], ["two", "three"]],
  );
  assert.ok(fix.resolutionRateDifferenceIntervals95.every(item =>
    Number.isFinite(item.lower) && Number.isFinite(item.upper) &&
    item.lower <= item.upper && typeof item.excludesZero === "boolean"
  ));
});
