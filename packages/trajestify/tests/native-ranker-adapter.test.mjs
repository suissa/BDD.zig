import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeRankerCandidate } from "../evaluation/build-native-ranker-candidate.mjs";
import { evaluateRankerCandidates } from "../evaluation/run-ranker-evaluation.mjs";
import { defineIntent, Given, When, Then, expectValue, runTrajectory } from "../dist/index.js";

async function makeArtifact(runId, trajectoryId) {
  const definition = defineIntent(trajectoryId, "Synthetic diagnostic", [
    Given("context", "Context is available", () => true),
    When("operation", "Operation executes", () => true),
    Then("invariant", "Invariant is respected", () => expectValue("expected", "observed")),
  ]);
  const artifact = await runTrajectory(definition, {}, { runId });
  artifact.trajectory.id = trajectoryId;
  return artifact;
}

test("native adapter produces evaluator-compatible predictions from real Trajestify artifacts", async () => {
  const incidents = [];
  const artifacts = [];
  const assignments = [];
  for (const [suffix, split] of [["train", "train"], ["calibration", "calibration"], ["holdout", "holdout"]]) {
    const runId = `run-${suffix}`;
    const trajectoryId = `trajectory-${suffix}`;
    const artifact = await makeArtifact(runId, trajectoryId);
    artifacts.push(artifact);
    assignments.push({ trajectoryId, split });
    const native = buildNativeRankerCandidate({
      incidents: [{ caseId: `case-${suffix}`, runId, trajectoryId }],
      artifacts: [artifact],
    });
    incidents.push({
      caseId: `case-${suffix}`,
      trajectoryId,
      runId,
      outcome: "diverged",
      rankedHypothesisIds: native.predictions[0].rankedHypothesisIds,
      confirmedRootCause: {
        hypothesisId: native.predictions[0].rankedHypothesisIds[0],
        eventId: artifact.firstDivergence.eventId,
        verification: "confirmed",
        evidenceIds: [artifact.firstDivergence.eventId],
      },
    });
  }

  const candidate = buildNativeRankerCandidate({ incidents, artifacts });
  assert.equal(candidate.rankerId, "trajestify-native");
  assert.equal(candidate.predictions.length, 3);
  assert.ok(candidate.predictions.every(item => item.rankedHypothesisIds.length > 0));

  const result = evaluateRankerCandidates({
    incidents,
    manifest: { assignments },
    rankers: [candidate],
    k: 3,
  });
  assert.equal(result.selectedRanker.rankerId, "trajestify-native");
  assert.equal(result.selectedRankerHoldoutMetrics.mrr, 1);
});

test("native adapter rejects missing, duplicate and mismatched artifacts", async () => {
  const artifact = await makeArtifact("run-a", "trajectory-a");
  const incident = { caseId: "case-a", runId: "run-a", trajectoryId: "trajectory-a" };
  assert.throws(() => buildNativeRankerCandidate({ incidents: [incident], artifacts: [] }), /must not be empty/);
  assert.throws(() => buildNativeRankerCandidate({ incidents: [incident], artifacts: [artifact, artifact] }), /Duplicate artifact runId/);
  assert.throws(() => buildNativeRankerCandidate({ incidents: [incident], artifacts: [{ ...artifact, trajectory: { id: "wrong" } }] }), /Trajectory mismatch/);
  assert.throws(() => buildNativeRankerCandidate({ incidents: [{ ...incident, runId: "missing" }], artifacts: [artifact] }), /Missing trajectory artifact/);
});

test("native adapter rejects non-divergent artifacts and duplicate incident IDs", async () => {
  const artifact = await makeArtifact("run-a", "trajectory-a");
  const incident = { caseId: "case-a", runId: "run-a", trajectoryId: "trajectory-a" };
  assert.throws(() => buildNativeRankerCandidate({
    incidents: [incident, incident], artifacts: [artifact],
  }), /Duplicate incident caseId/);
  assert.throws(() => buildNativeRankerCandidate({
    incidents: [incident], artifacts: [{ ...artifact, firstDivergence: null }],
  }), /no first divergence/);
});
