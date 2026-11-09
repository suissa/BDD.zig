# Temporal ranker evaluation

The temporal evaluator measures how Trajestify's native hypothesis ranking evolves as executions accumulate within a trajectory.

## Run

After building the package, provide incident labels (JSONL) and the matching trajectory artifacts (JSONL):

```sh
npm run evaluate:temporal -- --corpus=evaluation/incidents.jsonl --artifacts=evaluation/trajectories.jsonl
```

Each incident must contain `caseId`, `runId`, `trajectoryId` and an independently confirmed `confirmedRootCause.hypothesisId`. Every run must have exactly one matching artifact.

## Temporal protocol

- Artifacts are ordered by `startedAt`; equal timestamps are deterministically ordered by `runId`.
- At time t, the ranker receives only earlier artifacts from the same trajectory (strict chronological prefix).
- The current artifact is never included in its own history.
- Future runs and other trajectories cannot affect a prediction.
- Ground-truth labels are read only after ranking to calculate rank, reciprocal rank, and top-1 accuracy.

## Metrics

- **MRR / Top-1 accuracy:** quality of the ranked root-cause hypothesis over successive runs.
- **Rank coverage:** fraction of observations where the confirmed hypothesis appears in the ranked list.
- **Rank change rate:** frequency with which the confirmed hypothesis position changes between consecutive observations in one trajectory.
- Per-trajectory observations expose the prefix history count, ranked position, top hypothesis, and timestamp for audit.

This is a temporal protocol, not evidence of production performance. The tests use synthetic artifacts; use independently confirmed incident labels and a representative longitudinal corpus before interpreting scores operationally. Rank scores remain heuristic, not probabilities or causal proof.
