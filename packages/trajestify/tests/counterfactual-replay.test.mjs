import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, expectValue, runTrajectory } from "../dist/index.js";
import { evaluateCounterfactualReplay } from "../evaluation/evaluate-counterfactual-replay.mjs";

async function run(runId, actualAmount) {
  const intent = defineIntent("checkout", "Checkout flow", [
    Given("context", "Account is available", context => Boolean(context.account)),
    When("charge", "Payment is submitted", context => context.paymentEnabled),
    Then("reconcile", "Payment amount reconciles", context => expectValue(10, context.actualAmount)),
  ]);
  return runTrajectory(intent, { account: true, paymentEnabled: true, actualAmount }, { runId });
}

test("counterfactual evaluator detects a resolved divergence without making a causal claim", async () => {
  const baseline = await run("baseline-run", 11);
  const counterfactual = await run("counterfactual-run", 10);
  const result = evaluateCounterfactualReplay({
    replays: [{
      replayId: "replay-1",
      baseline,
      counterfactual,
      intervention: {
        id: "correct-payment-amount",
        targetClauseId: "reconcile",
        description: "Use the reconciled amount in the replay payload",
      },
      confirmedHypothesisId: "hypothesis:reconcile:assertion-mismatch",
    }],
  });
  assert.equal(result.method, "paired-trajectory-counterfactual-replay");
  assert.equal(result.causalClaim, false);
  assert.deepEqual(result.outcomeCounts, { resolved: 1, persists: 0, shifted: 0 });
  assert.equal(result.results[0].outcome, "resolved");
  assert.equal(result.results[0].baseline.divergenceClauseId, "reconcile");
  assert.equal(result.results[0].counterfactual.divergenceClauseId, null);
  assert.equal(result.results[0].baseline.targetHypothesisRank, 1);
  assert.equal(result.results[0].counterfactual.targetHypothesisRank, null);
  assert.match(result.results[0].interpretation, /does not establish/);
});

test("counterfactual evaluator distinguishes persistent and shifted divergences", async () => {
  const baseline = await run("baseline-run", 11);
  const persistent = await run("persistent-run", 12);
  const shifted = await run("shifted-run", 10);
  shifted.firstDivergence = {
    ...shifted.firstDivergence,
    eventId: shifted.steps[1].eventId,
    category: "execution_error",
  };
  shifted.steps[1] = { ...shifted.steps[1], status: "failed" };
  const result = evaluateCounterfactualReplay({
    replays: [
      { replayId: "persistent", baseline, counterfactual: persistent,
        intervention: { id: "change-amount-a", targetClauseId: "reconcile", description: "Change amount" } },
      { replayId: "shifted", baseline: { ...baseline, runId: "baseline-2" }, counterfactual: shifted,
        intervention: { id: "change-amount-b", targetClauseId: "reconcile", description: "Change amount" } },
    ],
  });
  assert.deepEqual(result.outcomeCounts, { resolved: 0, persists: 1, shifted: 1 });
});

test("counterfactual evaluator rejects invalid or incomparable replay pairs", async () => {
  const baseline = await run("baseline-run", 11);
  const counterfactual = await run("counterfactual-run", 10);
  const valid = {
    replayId: "replay",
    baseline,
    counterfactual,
    intervention: { id: "fix", targetClauseId: "reconcile", description: "Fix amount" },
  };
  assert.throws(() => evaluateCounterfactualReplay({ replays: [] }), /At least one/);
  assert.throws(() => evaluateCounterfactualReplay({ replays: [{ ...valid, counterfactual: baseline }] }), /distinct runIds/);
  assert.throws(() => evaluateCounterfactualReplay({ replays: [{ ...valid, counterfactual: { ...counterfactual, trajectory: { id: "other" } } }] }), /same trajectory/);
  assert.throws(() => evaluateCounterfactualReplay({ replays: [{ ...valid, intervention: { ...valid.intervention, targetClauseId: "missing" } }] }), /must exist/);
  assert.throws(() => evaluateCounterfactualReplay({ replays: [valid, valid] }), /Duplicate replayId/);
});
