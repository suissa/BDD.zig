# Counterfactual intervention interaction analysis

The interaction evaluator compares an explicitly executed two-intervention combination with each component intervention in the same repeated experiment. It composes the existing counterfactual replay and robustness evaluators.

## API

```js
import { evaluateCounterfactualInteractions } from "../evaluation/evaluate-counterfactual-interactions.mjs";

const report = evaluateCounterfactualInteractions({
  experiments: repeatedExperiments,
  combinations: [
    {
      combinationId: "fix-both",
      interventionIds: ["fix-tax", "fix-discount"],
    },
  ],
});
```

Every repetition must contain the same complete intervention set: both component interventions and the explicitly executed combined intervention. Each repetition uses one shared baseline; run IDs must be unique across repetitions. At least two independent repetitions are required.

## Outcome patterns

For each combination, the evaluator compares the combined outcome with the two component outcomes and records one of four patterns: aligned with both, aligned with the first, aligned with the second, or distinct from both. The last pattern is a descriptive non-compositional observation. Its frequency is accompanied by a Wilson 95% interval.

The evaluator does not infer the combined result from the component results, assume numeric additivity, execute interventions, or claim causality. The combined intervention must actually be replayed from the same repetition baseline. A distinct-from-both outcome is a signal for further investigation, not proof of an interaction effect.

## Limitations

The Wilson interval describes the observed frequency of distinct-from-both outcomes, not an interaction-effect interval. External side effects, confounding and unstable baselines can invalidate comparisons. The report sets `causalClaim: false`.
