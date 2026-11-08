# Native ranker adapter

The evaluation harness can now obtain predictions from Trajestify's implemented diagnostic ranker instead of relying only on hand-authored prediction fixtures.

## Build a candidate

Provide an incident corpus in JSONL and the matching trajectory artifacts in JSONL. Each incident must match exactly one artifact by `runId` and `trajectoryId`.

```sh
npm run ranker:predict -- --corpus=evaluation/incidents.jsonl --artifacts=evaluation/trajectories.jsonl --history=evaluation/history.jsonl --output=evaluation/native-candidate.json
```

The optional history file contains earlier Trajestify artifacts in JSONL format. The ranker itself filters history to the same trajectory and to runs completed no later than the current run.

The generated candidate file can be passed directly to `npm run evaluate:rankers` with the same corpus and split manifest:

```sh
npm run evaluate:rankers -- --corpus=evaluation/incidents.jsonl --manifest=evaluation/split.json --candidates=evaluation/native-candidate.json
```

## Safety and interpretation

- Missing, duplicate, mismatched, extra, and non-divergent artifacts are rejected.
- Predictions preserve the native ranker's deterministic order and hypothesis IDs.
- The adapter does not inspect confirmed root-cause labels when generating predictions.
- History is optional and is passed only to the existing temporal ranker.
- Calibration chooses among candidates; only the selected candidate is measured on holdout.
- Scores are heuristic triage scores, not probabilities or proof of causality.

The synthetic tests demonstrate the complete artifact-to-evaluator path. They do not establish real-world diagnostic accuracy; that requires a reviewed incident corpus and independently verified root causes.
