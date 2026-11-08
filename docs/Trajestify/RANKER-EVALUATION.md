# Trajestify Ranker Evaluation Harness

The harness compares independently produced ranking outputs against confirmed incident root causes. It does not assume a particular feature schema or ranking algorithm: each candidate supplies one ordered hypothesis list per incident case.

## Run

From `packages/trajestify`:

```sh
npm run evaluate:rankers
```

For a reviewed corpus and candidate output file:

```sh
node evaluation/run-ranker-evaluation.mjs \
  --corpus=evaluation/incidents-v2.jsonl \
  --manifest=evaluation/incidents-v2.splits.json \
  --candidates=evaluation/incidents-v2.ranker-predictions.json \
  --k=3
```

The candidate file is JSON with a `rankers` array. Each entry has a stable `rankerId`, `version`, and `predictions`; each prediction contains a `caseId` and ordered `rankedHypothesisIds`. Every candidate must provide exactly one valid prediction for every corpus case. Unknown, duplicate, missing, empty, or malformed predictions fail validation.

## Selection and leakage boundaries

1. The trajectory split manifest is validated before evaluation.
2. Candidate ranking metrics (MRR, Recall@K, Precision@K) are calculated only on `calibration`.
3. The winner is selected by MRR, then Recall@K, then Precision@K. Stable lexical ranker ID/version ordering resolves exact ties.
4. Only the selected candidate is evaluated on `holdout`; holdout metrics are never used to select or reorder candidates.
5. The `train` partition is not used by this evaluator. It is reserved for future fitting/training workflows.

This is a comparison harness for ranker output artifacts, not a training framework. Ranker implementations should generate predictions in an isolated step, then pass those artifacts to this evaluator. Never tune a ranker after inspecting holdout labels or scores.

## Interpretation

The committed candidate outputs and corpus are synthetic smoke-test fixtures. Their scores demonstrate deterministic selection and split isolation only; they do not establish that either candidate is better in real incidents. A production comparison requires independently verified labels, representative trajectories, multiple projects/time periods, and a reviewed split manifest.
