# Counterfactual repetition and robustness evaluation

The robustness evaluator summarizes repeated paired experiments. Each repetition is an independent result from `runCounterfactualExperiment` with fresh run IDs and the same intervention set.

## API

```js
import { evaluateCounterfactualRobustness } from "../evaluation/evaluate-counterfactual-robustness.mjs";

const report = evaluateCounterfactualRobustness({
  experiments: [
    { repetitionId: "rep-001", replays: firstExperiment.replays },
    { repetitionId: "rep-002", replays: secondExperiment.replays },
  ],
});
```

At least two repetitions are required. Each repetition must include the same intervention IDs, target clauses and descriptions. Run IDs must be globally unique across repetitions.

## Report

For each intervention the report includes resolved/persists/shifted counts, observed resolution rate, a Wilson 95% interval, dominant outcome, outcome consistency and whether every repetition resolved. Baseline stability is reported by comparing the first baseline divergence signature across repetitions.

The Wilson interval describes sampling uncertainty in the observed resolution frequency. It is not a causal-effect confidence interval, and the evaluator makes no causal claim. Baseline instability is a warning that changing conditions or nondeterminism may undermine comparisons.

## Experimental discipline

Use fresh contexts and run IDs for every repetition, fixed fixtures and deterministic clocks where possible. Keep external dependencies mocked or isolated. The runner clones in-memory context only; it cannot undo database writes, network calls, messages or filesystem effects. Repetition alone does not remove confounding, prove intervention efficacy or replace a controlled experimental design.
