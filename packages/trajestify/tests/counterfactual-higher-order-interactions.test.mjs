import test from "node:test";
import assert from "node:assert/strict";
import {
  defineIntent, Given, When, Then, expectValue, runCounterfactualExperiment,
} from "../dist/index.js";
import { evaluateCounterfactualHigherOrderInteractions } from "../evaluation/evaluate-counterfactual-higher-order-interactions.mjs";

const componentIds = ["fix-tax", "fix-discount", "fix-shipping"];
const subsetDefinitions = [
  { interventionId: "tax-discount", componentIds: ["fix-tax", "fix-discount"] },
  { interventionId: "tax-shipping", componentIds: ["fix-tax", "fix-shipping"] },
  { interventionId: "discount-shipping", componentIds: ["fix-discount", "fix-shipping"] },
  { interventionId: "tax-only", componentIds: ["fix-tax"] },
  { interventionId: "discount-only", componentIds: ["fix-discount"] },
  { interventionId: "shipping-only", componentIds: ["fix-shipping"] },
];
const combination = {
  combinationId: "fix-all",
  interventionIds: componentIds,
  subsets: subsetDefinitions,
};

function definition() {
  return defineIntent("checkout", "Checkout flow", [
    Given("context", "Account exists", context => Boolean(context.account)),
    When("charge", "Payment enabled", context => context.paymentEnabled),
    Then("reconcile", "Amount matches", context => expectValue(10, context.actualAmount)),
  ]);
}

async function repetition(repetitionId, combinedAmount) {
  const interventionIds = [
    ...componentIds,
    "tax-discount", "tax-shipping", "discount-shipping",
    "tax-only", "discount-only", "shipping-only", "fix-all",
  ];
  const result = await runCounterfactualExperiment(definition(), {
    account: true, paymentEnabled: true, actualAmount: 11,
  }, interventionIds.map(id => ({
    id,
    targetClauseId: "reconcile",
    description: `Replay ${id}`,
    apply: context => { context.actualAmount = id === "fix-all" ? combinedAmount : 10; },
  })), {
    experimentId: `${repetitionId}-experiment`,
    baselineRunId: `${repetitionId}-baseline`,
    counterfactualRunIds: Object.fromEntries(interventionIds.map(id => [id, `${repetitionId}-${id}`])),
  });
  return { repetitionId, replays: result.replays };
}

test("higher-order evaluator detects a triple outcome distinct from every proper subset", async () => {
  const result = evaluateCounterfactualHigherOrderInteractions({
    experiments: [await repetition("higher-1", 9), await repetition("higher-2", 9)],
    combinations: [combination],
  });
  const interaction = result.interactions[0];
  assert.equal(result.causalClaim, false);
  assert.equal(interaction.repetitions, 2);
  assert.equal(interaction.distinctFromAllProperSubsetsCount, 2);
  assert.equal(interaction.distinctFromAllProperSubsetsRate, 1);
  assert.equal(interaction.interactionSignal, "observed-higher-order-noncompositional-pattern");
  assert.equal(interaction.observations[0].matchingProperSubsetInterventionIds.length, 0);
  assert.ok(interaction.distinctFromAllProperSubsetsRateWilson95.lower < 1);
});

test("higher-order evaluator identifies alignment with an explicitly replayed subset", async () => {
  const result = evaluateCounterfactualHigherOrderInteractions({
    experiments: [await repetition("aligned-1", 10), await repetition("aligned-2", 10)],
    combinations: [combination],
  });
  assert.equal(result.interactions[0].distinctFromAllProperSubsetsRate, 0);
  assert.equal(result.interactions[0].interactionSignal, "no-distinct-higher-order-outcome-observed");
  assert.equal(result.interactions[0].observations[0].matchingProperSubsetInterventionIds.length, 6);
});

test("higher-order evaluator rejects incomplete subset lattices and unknown interventions", async () => {
  const experiments = [await repetition("invalid-higher-1", 9), await repetition("invalid-higher-2", 9)];
  assert.throws(() => evaluateCounterfactualHigherOrderInteractions({
    experiments,
    combinations: [{ ...combination, subsets: subsetDefinitions.slice(1) }],
  }), /every non-empty proper subset/);
  assert.throws(() => evaluateCounterfactualHigherOrderInteractions({
    experiments,
    combinations: [{ ...combination, combinationId: "missing-combination" }],
  }), /Unknown combined intervention/);
});

test("higher-order evaluator rejects missing subset replay and duplicate subset mappings", async () => {
  const experiments = [await repetition("missing-higher-1", 9), await repetition("missing-higher-2", 9)];
  assert.throws(() => evaluateCounterfactualHigherOrderInteractions({
    experiments: experiments.map((experiment, index) => index === 0 ? ({
      ...experiment,
      replays: experiment.replays.filter(replay => replay.intervention.id !== "tax-only"),
    }) : experiment),
    combinations: [combination],
  }), /same intervention set/);
  assert.throws(() => evaluateCounterfactualHigherOrderInteractions({
    experiments,
    combinations: [{
      ...combination,
      subsets: [...subsetDefinitions.slice(0, -1), { ...subsetDefinitions[0], interventionId: "tax-only" }],
    }],
  }), /Duplicate proper subset/);
});
