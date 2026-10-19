import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRanking } from "../evaluation/evaluate-hypotheses.mjs";

test("evaluation computes MRR, Recall@k, Precision@k and false-positive rate", () => {
  const report = evaluateRanking([
    { caseId: "a", rankedHypothesisIds: ["wrong", "right"], relevantHypothesisIds: ["right"] },
    { caseId: "b", rankedHypothesisIds: ["target", "noise"], relevantHypothesisIds: ["target"] },
  ], 1);
  assert.deepEqual(report, {
    caseCount: 2, k: 1, mrr: 0.75, recallAtK: 0.5, precisionAtK: 0.5,
    falsePositiveRateAtK: 0.5, casesWithRelevantHit: 2, relevantHypotheses: 2,
    relevantHypothesesRetrievedAtK: 1, topKHypothesesEvaluated: 2, falsePositivesAtK: 1,
  });
});

test("recall accounts for multiple relevant hypotheses in one case", () => {
  const report = evaluateRanking([
    { caseId: "multi", rankedHypothesisIds: ["a", "noise", "b"], relevantHypothesisIds: ["a", "b"] },
  ], 2);
  assert.equal(report.recallAtK, 0.5);
  assert.equal(report.precisionAtK, 0.5);
  assert.equal(report.falsePositiveRateAtK, 0.5);
});

test("rejects malformed, duplicate, and empty-label cases", () => {
  assert.throws(() => evaluateRanking([]), /at least one case/);
  assert.throws(() => evaluateRanking([{ caseId: "x", rankedHypothesisIds: [], relevantHypothesisIds: ["h"] }]), /rankedHypothesisIds/);
  assert.throws(() => evaluateRanking([{ caseId: "x", rankedHypothesisIds: ["h"], relevantHypothesisIds: [] }]), /must not be empty/);
  assert.throws(() => evaluateRanking([
    { caseId: "x", rankedHypothesisIds: ["h"], relevantHypothesisIds: ["h"] },
    { caseId: "x", rankedHypothesisIds: ["h"], relevantHypothesisIds: ["h"] },
  ]), /Duplicate caseId/);
});

test("metric output is deterministic", () => {
  const cases = [
    { caseId: "a", rankedHypothesisIds: ["a", "b"], relevantHypothesisIds: ["b"] },
    { caseId: "b", rankedHypothesisIds: ["x", "y"], relevantHypothesisIds: ["x"] },
  ];
  assert.deepEqual(evaluateRanking(cases, 2), evaluateRanking(cases, 2));
});
