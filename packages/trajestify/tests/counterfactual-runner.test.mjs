import test from "node:test";
import assert from "node:assert/strict";
import {
  defineIntent, Given, When, Then, expectValue, runCounterfactualReplay,
} from "../dist/index.js";

function definition() {
  return defineIntent("checkout", "Checkout flow", [
    Given("context", "Account is available", context => Boolean(context.account)),
    When("charge", "Payment is submitted", context => context.paymentEnabled),
    Then("reconcile", "Payment amount reconciles", context => expectValue(10, context.actualAmount)),
  ]);
}

test("counterfactual runner independently clones context and resolves only the replay", async () => {
  const initial = { account: true, paymentEnabled: true, actualAmount: 11 };
  const result = await runCounterfactualReplay(definition(), initial, {
    id: "correct-payment-amount",
    targetClauseId: "reconcile",
    description: "Set the observed amount to the expected amount",
    apply: context => { context.actualAmount = 10; },
  }, {
    baselineRunId: "baseline-run",
    counterfactualRunId: "counterfactual-run",
  });

  assert.equal(result.baseline.firstDivergence?.category, "assertion_mismatch");
  assert.equal(result.counterfactual.firstDivergence, null);
  assert.equal(result.baseline.runId, "baseline-run");
  assert.equal(result.counterfactual.runId, "counterfactual-run");
  assert.equal(initial.actualAmount, 11);
  assert.equal(result.intervention.targetClauseId, "reconcile");
});

test("counterfactual runner supports async and replacement-context interventions", async () => {
  const result = await runCounterfactualReplay(definition(), {
    account: true, paymentEnabled: true, actualAmount: 11,
  }, {
    id: "replace-context",
    targetClauseId: "reconcile",
    description: "Replace the replay context",
    apply: async context => ({ ...context, actualAmount: 10 }),
  }, {
    baselineRunId: "baseline-async",
    counterfactualRunId: "counterfactual-async",
  });
  assert.equal(result.counterfactual.intent.status, "passed");
});

test("counterfactual runner validates intervention targets and run identity", async () => {
  const valid = {
    id: "fix", targetClauseId: "reconcile", description: "Fix amount",
    apply: context => context,
  };
  await assert.rejects(
    runCounterfactualReplay(definition(), {}, valid, {
      baselineRunId: "same", counterfactualRunId: "same",
    }),
    /must be distinct/,
  );
  await assert.rejects(
    runCounterfactualReplay(definition(), {}, { ...valid, targetClauseId: "missing" }, {
      baselineRunId: "a", counterfactualRunId: "b",
    }),
    /Unknown intervention target/,
  );
});

test("counterfactual runner accepts an explicit clone strategy for non-serializable contexts", async () => {
  const initial = { actualAmount: 11, account: true, paymentEnabled: true, marker: () => true };
  const result = await runCounterfactualReplay(definition(), initial, {
    id: "fix", targetClauseId: "reconcile", description: "Fix amount",
    apply: context => { context.actualAmount = 10; },
  }, {
    baselineRunId: "custom-clone-a",
    counterfactualRunId: "custom-clone-b",
    cloneContext: context => ({ ...context }),
  });
  assert.equal(result.baseline.intent.status, "diverged");
  assert.equal(result.counterfactual.intent.status, "passed");
});
