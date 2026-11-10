# Counterfactual sensitivity across context conditions

The sensitivity evaluator composes the repeated robustness evaluator and compares the same interventions across two or more explicitly defined context conditions.

## API

```js
import { evaluateCounterfactualSensitivity } from "../evaluation/evaluate-counterfactual-sensitivity.mjs";

const report = evaluateCounterfactualSensitivity({
  conditions: [
    { conditionId: "normal", experiments: normalRepetitions },
    { conditionId: "degraded", experiments: degradedRepetitions },
  ],
  sensitivityThreshold: 0.2,
});
```

Each condition requires at least two independent repetitions. Intervention IDs, target clauses and descriptions must remain identical across conditions. Run IDs must be globally unique, including across conditions. Each repetition is validated by the robustness evaluator and must use one shared baseline for its interventions.

## Interpretation

For each intervention, the report includes resolution rates and Wilson 95% intervals by condition, the absolute resolution-rate spread, the maximum pairwise total-variation distance between the three outcome distributions (resolved, persists, shifted), and whether the dominant outcome changes. It also reports a conservative pairwise interval for each difference in resolution rates, formed as [lower(A) - upper(B), upper(A) - lower(B)]. The `uncertaintyAssessment` is `at-least-one-pairwise-interval-excludes-zero` only when at least one such interval excludes zero; otherwise it is `overlapping-or-inconclusive`.

An intervention is classified as `context-sensitive` when its resolution-rate spread exceeds `sensitivityThreshold` or its dominant outcome changes. Otherwise it is `stable-across-tested-contexts`. The default threshold is 0.2 and valid values are in [0, 1]. This remains a descriptive decision rule, not a significance test. Pairwise intervals are unadjusted for multiple comparisons and are not causal-effect intervals; with few repetitions, overlapping intervals should be interpreted as inconclusive rather than evidence of equivalence.

## Limitations and experimental discipline

The report sets `causalClaim: false`. Differences are observations across supplied conditions, not proof that context caused an outcome. Stability applies only to the tested contexts, fixtures and repetitions. Document context profiles, keep unrelated variables fixed, use fresh contexts and run IDs, and isolate external side effects. The evaluator does not execute interventions or roll back external writes.
