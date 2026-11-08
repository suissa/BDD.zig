import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateHoldoutBenchmark, assertNoBenchmarkRegression } from "../evaluation/run-incident-benchmark.mjs";

const incidents = (await readFile(new URL("../evaluation/benchmark-fixture.synthetic.jsonl", import.meta.url), "utf8"))
  .trim().split(/\r?\n/).map(line => JSON.parse(line));
const manifest = JSON.parse(await readFile(new URL("../evaluation/benchmark-split.synthetic.json", import.meta.url), "utf8"));
const baseline = JSON.parse(await readFile(new URL("../evaluation/benchmark-baseline.synthetic.json", import.meta.url), "utf8"));

test("evaluates only holdout incidents and emits reproducible benchmark metadata", () => {
  const result = evaluateHoldoutBenchmark({ incidents, manifest, datasetVersion: "synthetic-fixture-v1", rankerVersion: "test-ranker", k: 2, corpusSha256: "abc" });
  assert.equal(result.evaluatedSplit, "holdout");
  assert.equal(result.metrics.caseCount, 1);
  assert.equal(result.metrics.mrr, 0.5);
  assert.equal(result.metrics.recallAtK, 1);
  assert.equal(result.metrics.precisionAtK, 0.5);
  assert.deepEqual(result.split.counts, { train: 1, calibration: 1, holdout: 1 });
  assert.equal(result.corpusSha256, "abc");
  assert.equal("caseResults" in result.metrics, false);
});

test("regression gate accepts metrics within tolerance", () => {
  const current = evaluateHoldoutBenchmark({ incidents, manifest, datasetVersion: "synthetic-fixture-v1", rankerVersion: "test-ranker", k: 2 });
  assert.equal(assertNoBenchmarkRegression(current, baseline).passed, true);
});

test("regression gate blocks metric drops beyond tolerance", () => {
  const current = evaluateHoldoutBenchmark({ incidents, manifest, datasetVersion: "synthetic-fixture-v1", rankerVersion: "test-ranker", k: 2 });
  current.metrics.mrr = 0.4;
  assert.throws(() => assertNoBenchmarkRegression(current, baseline), /Benchmark regression detected/);
});

test("regression gate rejects dataset, split and k mismatches", () => {
  const current = evaluateHoldoutBenchmark({ incidents, manifest, datasetVersion: "synthetic-fixture-v1", rankerVersion: "test-ranker", k: 2 });
  assert.throws(() => assertNoBenchmarkRegression({ ...current, datasetVersion: "other" }, baseline), /Dataset version mismatch/);
  assert.throws(() => assertNoBenchmarkRegression({ ...current, evaluatedSplit: "train" }, baseline), /holdout metrics only/);
  assert.throws(() => assertNoBenchmarkRegression({ ...current, k: 3 }, baseline), /does not match baseline/);
});

test("benchmark rejects missing holdout and incomplete trajectory assignments", () => {
  assert.throws(() => evaluateHoldoutBenchmark({
    incidents, manifest: { assignments: manifest.assignments.filter(x => x.split !== "holdout") },
    datasetVersion: "synthetic-fixture-v1", rankerVersion: "test-ranker", k: 2,
  }), /Missing split assignment|Split "holdout" is empty/);
});
