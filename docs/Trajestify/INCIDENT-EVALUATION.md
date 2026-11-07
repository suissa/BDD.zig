# Evaluating Trajestify against labeled incidents

The incident evaluator adapts the incident corpus to the existing ranking evaluator. Each incident contributes its `confirmedRootCause.hypothesisId` as a relevant label. A label is accepted only when verification is `confirmed` and at least one evidence reference is present.

## Run

```sh
node packages/trajestify/evaluation/evaluate-incidents.mjs
node packages/trajestify/evaluation/evaluate-incidents.mjs packages/trajestify/evaluation/corpus.incidents.synthetic.jsonl --k=2 --details
```

The default input is `corpus.incidents.synthetic.jsonl`. The output includes MRR, Recall@k, Precision@k and operational false-positive rate at k. `--details` includes per-incident rank, missed root cause and incorrect top-k candidates.

## Interpretation and limitations

The bundled corpus is synthetic and is only a plumbing/contract check. Metrics over it are not evidence of production diagnostic accuracy. Real evaluation requires independently reviewed incident timelines, explicit evidence references, confirmed root causes, privacy review/redaction and a held-out split to avoid tuning against the evaluation set. Keep uncertain cases out of confirmed labels; do not infer ground truth from the ranker itself.
