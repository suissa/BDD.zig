import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { evaluateIncidentCorpus } from "./evaluate-incidents.mjs";
import { validateIncidentSplit } from "./split-incidents.mjs";

function parseJsonl(raw, label) {
  return raw.split(/\\r?\\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid ${label} JSONL at line ${index + 1}: ${error.message}`); }
  });
}

export function evaluateHoldoutBenchmark({ incidents, manifest, datasetVersion, rankerVersion, k = 3, corpusSha256 = null }) {
  if (typeof datasetVersion !== "string" || !datasetVersion.trim()) throw new Error("datasetVersion is required");
  if (typeof rankerVersion !== "string" || !rankerVersion.trim()) throw new Error("rankerVersion is required");
  if (!Number.isInteger(k) || k < 1) throw new Error("k must be a positive integer");
  const split = validateIncidentSplit(incidents, manifest);
  const holdout = incidents.filter(item => split.assignments[item.trajectoryId] === "holdout");
  if (holdout.length === 0) throw new Error("Holdout partition must not be empty");
  const evaluated = evaluateIncidentCorpus(holdout, k);
  const { caseResults, ...metrics } = evaluated;
  return {
    schemaVersion: 1,
    datasetVersion,
    rankerVersion,
    evaluatedSplit: "holdout",
    k,
    corpusSha256,
    split: { incidentCount: split.incidentCount, trajectoryCount: split.trajectoryCount, counts: split.counts },
    metrics,
  };
}

export function assertNoBenchmarkRegression(current, baseline) {
  if (!current || !baseline || current.schemaVersion !== 1 || baseline.schemaVersion !== 1) {
    throw new Error("Benchmark and baseline schemaVersion must both be 1");
  }
  if (current.datasetVersion !== baseline.datasetVersion) throw new Error("Dataset version mismatch; baseline refresh requires explicit review");
  if (current.evaluatedSplit !== "holdout" || baseline.evaluatedSplit !== "holdout") throw new Error("Regression gate accepts holdout metrics only");
  if (current.k !== baseline.k) throw new Error("Benchmark k does not match baseline k");
  const thresholds = baseline.maxRegression ?? {};
  const regressions = [];
  for (const metric of ["mrr", "recallAtK", "precisionAtK"]) {
    const actual = current.metrics?.[metric];
    const expected = baseline.metrics?.[metric];
    const allowedDrop = thresholds[metric] ?? 0;
    if (![actual, expected, allowedDrop].every(Number.isFinite) || allowedDrop < 0) {
      throw new Error(`Invalid benchmark metric or threshold: ${metric}`);
    }
    if (actual < expected - allowedDrop) regressions.push(`${metric}: ${actual} < ${expected} - ${allowedDrop}`);
  }
  if (regressions.length) throw new Error(`Benchmark regression detected: ${regressions.join("; ")}`);
  return { passed: true, comparedMetrics: ["mrr", "recallAtK", "precisionAtK"] };
}

export async function runBenchmarkFiles({ corpusPath, manifestPath, baselinePath, datasetVersion, rankerVersion, k = 3 }) {
  const [corpusRaw, manifestRaw, baselineRaw] = await Promise.all([
    readFile(corpusPath, "utf8"), readFile(manifestPath, "utf8"), readFile(baselinePath, "utf8"),
  ]);
  const incidents = parseJsonl(corpusRaw, "incident");
  const result = evaluateHoldoutBenchmark({
    incidents, manifest: JSON.parse(manifestRaw), datasetVersion, rankerVersion, k,
    corpusSha256: createHash("sha256").update(corpusRaw).digest("hex"),
  });
  const baseline = JSON.parse(baselineRaw);
  const gate = assertNoBenchmarkRegression(result, baseline);
  return { ...result, regressionGate: gate };
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const base = new URL("./", import.meta.url);
  const corpusPath = value("corpus") ?? new URL("./benchmark-fixture.synthetic.jsonl", base);
  const manifestPath = value("manifest") ?? new URL("./benchmark-split.synthetic.json", base);
  const baselinePath = value("baseline") ?? new URL("./benchmark-baseline.synthetic.json", base);
  const result = await runBenchmarkFiles({
    corpusPath, manifestPath, baselinePath,
    datasetVersion: value("dataset-version") ?? "synthetic-fixture-v1",
    rankerVersion: value("ranker-version") ?? "reference-ranker-v1",
    k: Number(value("k") ?? 2),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
