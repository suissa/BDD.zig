# Higher-order counterfactual intervention interactions

The higher-order evaluator extends paired interaction analysis to combinations of three or more component interventions. For each full combination, it compares the observed outcome with every non-empty proper subset.

## API

```js
import { evaluateCounterfactualHigherOrderInteractions } from "../evaluation/evaluate-counterfactual-higher-order-interactions.mjs";

const report = evaluateCounterfactualHigherOrderInteractions({
  experiments: repeatedExperiments,
  combinations: [{
    combinationId: "fix-all",
    interventionIds: ["fix-tax", "fix-discount", "fix-shipping"],
    subsets: [
      { interventionId: "tax-only", componentIds: ["fix-tax"] },
      { interventionId: "discount-only", componentIds: ["fix-discount"] },
      { interventionId: "shipping-only", componentIds: ["fix-shipping"] },
      { interventionId: "tax-discount", componentIds: ["fix-tax", "fix-discount"] },
      { interventionId: "tax-shipping", componentIds: ["fix-tax", "fix-shipping"] },
      { interventionId: "discount-shipping", componentIds: ["fix-discount", "fix-shipping"] }
    ]
  }]
});
```

For a combination of N components, the input must map all 2^N - 2 non-empty proper subsets to explicitly executed intervention IDs. Every subset and the full combination must be present in every repetition, sharing that repetition's baseline. At least two independent repetitions are required. Run IDs and intervention metadata are validated by the existing robustness evaluator.

## Interpretation

A full-combination outcome that differs from every proper-subset outcome is reported as `observed-higher-order-noncompositional-pattern`. Otherwise, the report records which proper subsets share the full-combination outcome. The observed frequency includes a Wilson 95% interval.

The evaluator does not synthesize subset outcomes, execute interventions, assume numeric additivity, or claim causality. `causalClaim` is always `false`.

## Complexity and limitations

The number of required subset replays grows exponentially. Use this evaluator for small, deliberately selected intervention sets; it does not impose an arbitrary component limit. The Wilson interval describes the frequency of distinct-from-all-subsets observations, not a causal interaction-effect interval. Confounding, external side effects and unstable baselines can invalidate comparisons.
