import test from "node:test";
import assert from "node:assert/strict";
import {
  defineIntent, Given, When, Then, expectValue, runCounterfactualExperiment,
} from "../dist/index.js";
import { evaluateCounterfactualInteractions } from "../evaluation/evaluate-counterfactual-interactions.mjs";

function definition() {
  return defineIntent("checkout", "Checkout flow", [
    Given("context", "Account exists", context => Boolean(context.account)),
    When("charge", "Payment enabled", context => context.paymentEnabled),
    Then("reconcile", "Amount matches", context => expectValue(10, context.actualAmount)),
  ]);
}

async function repetition(repetitionId, offset, combinedAmount) {
  const result = await runCounterfactualExperiment(definition(), {
    account: true, paymentEnabled: true, actualAmount: 11,
  }, [
    { id: "fix-tax", targetClauseId: "reconcile", description: "Fix tax", apply: context => { context.actualAmount = 10; } },
    { id: "fix-discount", targetClauseId: "reconcile", description: "Fix discount", apply: context => { context.actualAmount = 10; } },
    { id: "fix-both", targetClauseId: "reconcile", description: "Apply both fixes", apply: context => { context.actualAmount = combinedAmount; } },
  ], {
    experimentId: `${repetitionId}-experiment`,
    baselineRunId: `${repetitionId}-baseline`,
    counterfactualRunIds: {
      "fix-tax": `${repetitionId}-tax-${offset}`,
      "fix-discount": `${repetitionId}-discount-${offset}`,
      "fix-both": `${repetitionId}-both-${offset}`,
    },
  });
  return { repetitionId, replays: result.replays };
}

const combinations = [{
  combinationId: "fix-both",
  interventionIds: ["fix-tax", "fix-discount"],
}];

test("interaction evaluator detects a combined outcome distinct from both components", async () => {
  const result = evaluateCounterfactualInteractions({
    experiments: [
      await repetition("rep-1", 1, 9),
      await repetition("rep-2", 2, 9),
      await repetition("rep-3", 3, 10),
    ],
    combinations,
  });
  assert.equal(result.causalClaim, false);
  const interaction = result.interactions[0];
  assert.equal(interaction.repetitions, 3);
  assert.equal(interaction.distinctFromBothRate, 2 / 3);
  assert.equal(interaction.interactionSignal, "observed-noncompositional-pattern");
  assert.equal(interaction.patternCounts["distinct-from-both-single-interventions"], 2);
  assert.ok(interaction.distinctFromBothRateWilson95.lower <= 2 / 3);
});

test("interaction evaluator reports when combined outcomes align with both components", async () => {
  const result = evaluateCounterfactualInteractions({
    experiments: [
      await repetition("same-1", 11, 10),
      await repetition("same-2", 12, 10),
    ],
    combinations,
  });
  assert.equal(result.interactions[0].distinctFromBothRate, 0);
  assert.equal(result.interactions[0].patternCounts["aligned-with-both-single-interventions"], 2);
  assert.equal(result.interactions[0].interactionSignal, "no-distinct-combined-outcome-observed");
});

test("interaction evaluator rejects malformed pairs, unknown interventions and missing replays", async () => {
  const experiments = [
    await repetition("invalid-1", 21, 9),
    await repetition("invalid-2", 22, 9),
  ];
  assert.throws(() => evaluateCounterfactualInteractions({
    experiments, combinations: [{ combinationId: "fix-both", interventionIds: ["fix-tax"] }],
  }), /two distinct/);
  assert.throws(() => evaluateCounterfactualInteractions({
    experiments, combinations: [{ combinationId: "unknown", interventionIds: ["fix-tax", "fix-discount"] }],
  }), /Unknown combined intervention/);
  assert.throws(() => evaluateCounterfactualInteractions({
    experiments: experiments.map((experiment, index) => index === 0 ? ({
      ...experiment,
      replays: experiment.replays.filter(replay => replay.intervention.id !== "fix-discount"),
    }) : experiment),
    combinations,
  }), /same intervention set/);
});

test("interaction evaluator rejects duplicate pairs and duplicate combination IDs", async () => {
  const experiments = [
    await repetition("duplicate-1", 31, 9),
    await repetition("duplicate-2", 32, 9),
  ];
  assert.throws(() => evaluateCounterfactualInteractions({
    experiments,
    combinations: [
      { combinationId: "fix-both", interventionIds: ["fix-tax", "fix-discount"] },
      { combinationId: "fix-both", interventionIds: ["fix-discount", "fix-tax"] },
    ],
  }), /Duplicate combinationId/);
  assert.throws(() => evaluateCounterfactualInteractions({
    experiments,
    combinations: [
      { combinationId: "fix-both", interventionIds: ["fix-tax", "fix-discount"] },
      { combinationId: "fix-both-alt", interventionIds: ["fix-discount", "fix-tax"] },
    ],
  }), /Duplicate intervention pair/);
});
