# Leakage-safe incident evaluation splits

Use a reviewed, version-controlled manifest to assign entire trajectory groups to
`train`, `calibration`, or `holdout`. Never split individual incidents from
the same `trajectoryId` across partitions: their shared execution history can
leak context into evaluation.

Manifest format:

```json
{
  "assignments": [
    { "trajectoryId": "trajectory-a", "split": "train" },
    { "trajectoryId": "trajectory-b", "split": "calibration" },
    { "trajectoryId": "trajectory-c", "split": "holdout" }
  ]
}
```

Validate corpus and manifest:

```sh
node packages/trajestify/evaluation/split-incidents.mjs \
  incidents.jsonl splits.json
```

The validator checks unique case IDs and trajectory assignments, complete
coverage, unknown groups, allowed split names, and non-empty partitions. Counts
are reported by incident and trajectory. It does not generate random splits or
claim statistical representativeness; assignment should be deterministic and
reviewed before tuning.

The bundled synthetic corpus intentionally contains only one trajectory group,
so it cannot form three independent partitions and must not be used as a
train/calibration/holdout benchmark. A meaningful holdout requires enough
independent trajectory groups and preferably independently reviewed,
privacy-redacted real incidents. Keep holdout labels inaccessible during
hypothesis tuning and report metrics on it only after the model/configuration is
frozen.
