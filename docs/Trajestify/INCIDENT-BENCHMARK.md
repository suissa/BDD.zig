# Trajestify Incident Benchmark

The benchmark runner evaluates ranked root-cause hypotheses against confirmed incident labels. It is deliberately separate from training and calibration: only trajectories assigned to `holdout` are passed to the ranking evaluator.

## Run

From `packages/trajestify`:

```sh
node evaluation/run-incident-benchmark.mjs
```

The default inputs are explicitly synthetic smoke-test fixtures. To evaluate a reviewed dataset, provide all paths and version identifiers:

```sh
node evaluation/run-incident-benchmark.mjs \
  --corpus=evaluation/incidents-v2.jsonl \
  --manifest=evaluation/incidents-v2.splits.json \
  --baseline=evaluation/incidents-v2.baseline.json \
  --dataset-version=incidents-v2 \
  --ranker-version=causal-ranker-2026-11 \
  --k=3
```

The manifest must assign every trajectory exactly once across train, calibration, and holdout. The split validator rejects missing/unknown assignments, duplicate case IDs, empty partitions, and malformed split names. The runner hashes the exact corpus bytes with SHA-256 and reports the dataset/ranker versions, split counts, cutoff, and holdout metrics.

## Metrics and regression gate

The report includes MRR, Recall@K, and Precision@K. The baseline pins the dataset version and K and defines the maximum permitted absolute drop for each metric. A mismatch or a drop beyond tolerance exits non-zero, making it suitable for CI. Baseline changes and dataset-version changes require explicit review; do not silently regenerate the baseline during CI.

## Data quality boundary

The checked-in fixture contains three independent synthetic trajectories solely to exercise train/calibration/holdout isolation and the regression gate. Its scores are not evidence of real-world diagnostic quality. A meaningful production benchmark requires a reviewed, sufficiently large corpus with independently verified root causes, trajectory-level split assignments, and a versioned baseline. Never tune a ranker against holdout labels.
