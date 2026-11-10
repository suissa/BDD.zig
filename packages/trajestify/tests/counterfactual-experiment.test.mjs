import test from "node:test";
import assert from "node:assert/strict";
import {
  defineIntent, Given, When, Then, expectValue, runCounterfactualExperiment,
} from "../dist/index.js";
import { evaluateCounterfactualReplay } from "../evaluation/evaluate-counterfactual-replay.mjs";

function definition() {
  return defineIntent("checkout", "Checkout flow", [
    Given("context", "Account is available", context => Boolean(context.account)),
    When("charge", "Payment is submitted", context => context.paymentEnabled),
    Then("reconcile", "Payment amount reconciles", context => expectValue(10, context.actualAmount)),
  ]);
}

test("experiment runs one baseline and isolates every intervention from the same initial state", async () => {
  const initial = { account: true, paymentEnabled: true, actualAmount: 11, touched: [] };
  const result = await runCounterfactualExperiment(definition(), initial, [
    {
      id: "fix-amount", targetClauseId: "reconcile", description: "Correct the amount",
      apply: context => { context.actualAmount = 10; context.touched.push("fix-amount"); },
    },
    {
      id: "leave-amount", targetClauseId: "reconcile", description: "Keep the amount unchanged",
      apply: context => { context.touched.push("leave-amount"); },
    },
  ], {
    experimentId: "checkout-experiment",
    baselineRunId: "checkout-baseline",
    counterfactualRunIds: { "fix-amount": "checkout-fix", "leave-amount": "checkout-unchanged" },
  });

  assert.equal(result.causalClaim, false);
  assert.equal(result.baseline.runId, "checkout-baseline");
  assert.equal(result.replays.length, 2);
  assert.equal(result.replays[0].baseline, result.replays[1].baseline);
  assert.equal(result.replays[0].counterfactual.firstDivergence, null);
  assert.equal(result.replays[1].counterfactual.firstDivergence?.category, "assertion_mismatch");
  assert.deepEqual(initial.touched, []);
  assert.equal(initial.actualAmount, 11);
  const evaluation = evaluateCounterfactualReplay({ replays: result.replays });
  assert.deepEqual(evaluation.outcomeCounts, { resolved: 1, persists: 1, shifted: 0 });
});

test("experiment rejects duplicate IDs, missing run IDs and unknown targets before execution", async () => {
  let executions = 0;
  const intervention = {
    id: "fix", targetClauseId: "reconcile", description: "Fix amount",
    apply: context => { executions += 1; context.actualAmount = 10; },
  };
  const options = {
    experimentId: "invalid-experiment",
    baselineRunId: "baseline",
    counterfactualRunIds: { fix: "counterfactual" },
  };
  await assert.rejects(
    runCounterfactualExperiment(definition(), { actualAmount: 11 }, [intervention, intervention], options),
    /Duplicate intervention id/,
  );
  await assert.rejects(
    runCounterfactualExperiment(definition(), { actualAmount: 11 }, [intervention], {
      ...options, counterfactualRunIds: {},
    }),
    /Missing counterfactual run ID/,
  );
  await assert.rejects(
    runCounterfactualExperiment(definition(), { actualAmount: 11 }, [
      { ...intervention, targetClauseId: "missing" },
    ], options),
    /Unknown intervention target/,
  );
  assert.equal(executions, 0);
});

test("experiment requires unique run IDs and supports custom context cloning", async () => {
  const initial = { account: true, paymentEnabled: true, actualAmount: 11, marker: () => true };
  const result = await runCounterfactualExperiment(definition(), initial, [{
    id: "fix", targetClauseId: "reconcile", description: "Fix amount",
    apply: context => { context.actualAmount = 10; },
  }], {
    experimentId: "custom-clone",
    baselineRunId: "base-run",
    counterfactualRunIds: { fix: "same" },
    cloneContext: context => ({ ...context }),
  });
  assert.equal(result.replays[0].counterfactual.intent.status, "passed");
  await assert.rejects(
    runCounterfactualExperiment(definition(), initial, [{
      id: "fix", targetClauseId: "reconcile", description: "Fix amount", apply: () => {},
    }], {
      experimentId: "duplicate-runs", baselineRunId: "base",
      counterfactualRunIds: { fix: "base" }, cloneContext: context => ({ ...context }),
    }),
    /Duplicate experiment run ID/,
  );
});
