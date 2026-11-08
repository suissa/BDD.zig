import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateRankerCandidates } from "../evaluation/run-ranker-evaluation.mjs";

const incidents = (await readFile(new URL("../evaluation/benchmark-fixture.synthetic.jsonl", import.meta.url), "utf8"))
  .trim().split(/\r?\n/).map(line => JSON.parse(line));
const manifest = JSON.parse(await readFile(new URL("../evaluation/benchmark-split.synthetic.json", import.meta.url), "utf8"));
const candidates = JSON.parse(await readFile(new URL("../evaluation/ranker-candidates.synthetic.json", import.meta.url), "utf8")).rankers;

test("selects ranker using calibration and evaluates only the selected ranker on holdout", () => {
  const result = evaluateRankerCandidates({ incidents, manifest, rankers: candidates, k: 2 });
  assert.equal(result.selectionSplit, "calibration");
  assert.equal(result.evaluationSplit, "holdout");
  assert.deepEqual(result.selectedRanker, { rankerId: "evidence-first", version: "2", selectedBy: "calibration" });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].calibrationMetrics.mrr, 1);
  assert.equal(result.selectedRankerHoldoutMetrics.caseCount, 1);
  assert.equal(result.holdoutEvaluatedCandidateCount, 1);
  assert.equal("holdoutMetrics" in result.candidates[0], false);
});

test("holdout labels and predictions cannot influence candidate selection", () => {
  const changedHoldout = incidents.map(item => item.trajectoryId === "trajectory-holdout"
    ? { ...item, confirmedRootCause: { ...item.confirmedRootCause, hypothesisId: "changed-label" } }
    : item);
  const changedCandidates = candidates.map(candidate => ({
    ...candidate,
    predictions: candidate.predictions.map(prediction => prediction.caseId === "holdout-001"
      ? { ...prediction, rankedHypothesisIds: ["changed-label", "other"] }
      : prediction),
  }));
  const original = evaluateRankerCandidates({ incidents, manifest, rankers: candidates, k: 2 });
  const changed = evaluateRankerCandidates({ incidents: changedHoldout, manifest, rankers: changedCandidates, k: 2 });
  assert.equal(changed.selectedRanker.rankerId, original.selectedRanker.rankerId);
  assert.deepEqual(changed.candidates, original.candidates);
  assert.notDeepEqual(changed.selectedRankerHoldoutMetrics, original.selectedRankerHoldoutMetrics);
});

test("rejects missing, duplicate, unknown and malformed predictions", () => {
  const missing = candidates.map(x => ({ ...x, predictions: x.predictions.slice(1) }));
  assert.throws(() => evaluateRankerCandidates({ incidents, manifest, rankers: missing, k: 2 }), /exactly one prediction/);
  const duplicate = candidates.map(x => ({ ...x, predictions: [...x.predictions, x.predictions[0]] }));
  assert.throws(() => evaluateRankerCandidates({ incidents, manifest, rankers: duplicate, k: 2 }), /exactly one prediction/);
  const unknown = candidates.map(x => ({ ...x, predictions: x.predictions.map((p, i) => i ? p : { ...p, caseId: "unknown" }) }));
  assert.throws(() => evaluateRankerCandidates({ incidents, manifest, rankers: unknown, k: 2 }), /unknown caseId/);
  const malformed = candidates.map(x => ({ ...x, predictions: x.predictions.map((p, i) => i ? p : { ...p, rankedHypothesisIds: ["dup", "dup"] }) }));
  assert.throws(() => evaluateRankerCandidates({ incidents, manifest, rankers: malformed, k: 2 }), /unique ranked hypothesis IDs/);
});

test("rejects duplicate candidate identities and invalid cutoffs", () => {
  const duplicate = [candidates[0], { ...candidates[1], rankerId: candidates[0].rankerId }];
  assert.throws(() => evaluateRankerCandidates({ incidents, manifest, rankers: duplicate, k: 2 }), /Duplicate rankerId/);
  assert.throws(() => evaluateRankerCandidates({ incidents, manifest, rankers: candidates, k: 0 }), /positive integer/);
});

test("uses stable lexical tie-break when calibration metrics are equal", () => {
  const tied = candidates.map(candidate => ({
    ...candidate,
    predictions: candidate.predictions.map(prediction => prediction.caseId === "calibration-001"
      ? { ...prediction, rankedHypothesisIds: ["noise", "cause-calibration"] }
      : prediction),
  }));
  const result = evaluateRankerCandidates({ incidents, manifest, rankers: tied, k: 2 });
  assert.equal(result.selectedRanker.rankerId, "baseline-frequency");
});
