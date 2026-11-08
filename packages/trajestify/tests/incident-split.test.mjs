import test from "node:test";
import assert from "node:assert/strict";
import { validateIncidentSplit } from "../evaluation/split-incidents.mjs";

const incidents = [
  { caseId: "a", trajectoryId: "flow-a" },
  { caseId: "b", trajectoryId: "flow-a" },
  { caseId: "c", trajectoryId: "flow-b" },
  { caseId: "d", trajectoryId: "flow-c" },
];
const manifest = { assignments: [
  { trajectoryId: "flow-a", split: "train" },
  { trajectoryId: "flow-b", split: "calibration" },
  { trajectoryId: "flow-c", split: "holdout" },
] };

test("validates deterministic trajectory-level train/calibration/holdout assignment", () => {
  const result = validateIncidentSplit(incidents, manifest);
  assert.deepEqual(result.counts, { train: 2, calibration: 1, holdout: 1 });
  assert.equal(result.trajectoryCount, 3);
});

test("rejects missing, duplicate and unknown trajectory assignments", () => {
  assert.throws(() => validateIncidentSplit(incidents, { assignments: manifest.assignments.slice(0, 2) }), /Missing split assignment/);
  assert.throws(() => validateIncidentSplit(incidents, { assignments: [...manifest.assignments, manifest.assignments[0]] }), /Duplicate trajectory assignment/);
  assert.throws(() => validateIncidentSplit(incidents, { assignments: [...manifest.assignments, { trajectoryId: "ghost", split: "train" }] }), /unknown trajectory/);
});

test("rejects empty split and invalid split names", () => {
  assert.throws(() => validateIncidentSplit(incidents, { assignments: manifest.assignments.map(x => ({ ...x, split: "train" })) }), /Split "calibration" is empty/);
  assert.throws(() => validateIncidentSplit(incidents, { assignments: manifest.assignments.map(x => ({ ...x, split: "test" })) }), /must be train, calibration or holdout/);
});

test("rejects duplicate case ids and missing grouping identity", () => {
  assert.throws(() => validateIncidentSplit([incidents[0], incidents[0]], manifest), /Duplicate caseId/);
  assert.throws(() => validateIncidentSplit([{ caseId: "x" }], manifest), /trajectoryId is required/);
});

test("assigns all cases from one trajectory to exactly one split", () => {
  assert.throws(() => validateIncidentSplit([{ caseId: "x", trajectoryId: "flow-a" }], {
    assignments: [{ trajectoryId: "flow-a", split: "train" }],
  }), /Split "calibration" is empty/);
});
