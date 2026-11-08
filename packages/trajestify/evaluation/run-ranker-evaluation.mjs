import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluateRanking } from "./evaluate-hypotheses.mjs";
import { validateIncidentSplit } from "./split-incidents.mjs";

function assertCandidate(candidate, index, caseIds) {
  const prefix = `rankers[${index}]`;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`${prefix} must be an object`);
  for (const field of ["rankerId", "version"]) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) throw new Error(`${prefix}.${field} is required`);
  }
  if (!Array.isArray(candidate.predictions) || candidate.predictions.length !== caseIds.size) {
    throw new Error(`${prefix}.predictions must contain exactly one prediction per incident`);
  }
  const seen = new Set();
  for (const [predictionIndex, prediction] of candidate.predictions.entries()) {
    if (!prediction || typeof prediction.caseId !== "string" || !caseIds.has(prediction.caseId)) {
      throw new Error(`${prefix}.predictions[${predictionIndex}] references an unknown caseId`);
    }
    if (seen.has(prediction.caseId)) throw new Error(`${prefix} has duplicate prediction for caseId: ${prediction.caseId}`);
    seen.add(prediction.caseId);
    if (!Array.isArray(prediction.rankedHypothesisIds) || prediction.rankedHypothesisIds.length === 0 ||
        prediction.rankedHypothesisIds.some(id => typeof id !== "string" || !id.trim()) ||
        new Set(prediction.rankedHypothesisIds).size !== prediction.rankedHypothesisIds.length) {
      throw new Error(`${prefix} prediction for ${prediction.caseId} must contain unique ranked hypothesis IDs`);
    }
  }
  return candidate;
}

function metricsFor(incidents, predictionsByCase, k) {
  const cases = incidents.map(incident => ({
    caseId: incident.caseId,
    rankedHypothesisIds: predictionsByCase.get(incident.caseId).rankedHypothesisIds,
    relevantHypothesisIds: [incident.confirmedRootCause.hypothesisId],
  }));
  const { caseResults, ...metrics } = evaluateRanking(cases, k);
  return metrics;
}

function compareCalibration(a, b) {
  for (const metric of ["mrr", "recallAtK", "precisionAtK"]) {
    if (a.calibrationMetrics[metric] !== b.calibrationMetrics[metric]) {
      return b.calibrationMetrics[metric] - a.calibrationMetrics[metric];
    }
  }
  return a.rankerId.localeCompare(b.rankerId) || a.version.localeCompare(b.version);
}

export function evaluateRankerCandidates({ incidents, manifest, rankers, k = 3 }) {
  if (!Number.isInteger(k) || k < 1) throw new Error("k must be a positive integer");
  if (!Array.isArray(rankers) || rankers.length === 0) throw new Error("At least one ranker candidate is required");
  const split = validateIncidentSplit(incidents, manifest);
  const caseIds = new Set(incidents.map(item => item.caseId));
  const calibration = incidents.filter(item => split.assignments[item.trajectoryId] === "calibration");
  const holdout = incidents.filter(item => split.assignments[item.trajectoryId] === "holdout");
  if (calibration.length === 0 || holdout.length === 0) throw new Error("Calibration and holdout partitions must both be non-empty");

  const rankerIds = new Set();
  const evaluated = rankers.map((candidate, index) => {
    const checked = assertCandidate(candidate, index, caseIds);
    if (rankerIds.has(checked.rankerId)) throw new Error(`Duplicate rankerId: ${checked.rankerId}`);
    rankerIds.add(checked.rankerId);
    const predictionsByCase = new Map(checked.predictions.map(item => [item.caseId, item]));
    return {
      rankerId: checked.rankerId,
      version: checked.version,
      predictionsByCase,
      calibrationMetrics: metricsFor(calibration, predictionsByCase, k),
    };
  });

  evaluated.sort(compareCalibration);
  const winner = evaluated[0];
  const holdoutMetrics = metricsFor(holdout, winner.predictionsByCase, k);
  return {
    schemaVersion: 1,
    selectionSplit: "calibration",
    evaluationSplit: "holdout",
    k,
    split: { incidentCount: split.incidentCount, trajectoryCount: split.trajectoryCount, counts: split.counts },
    selectedRanker: { rankerId: winner.rankerId, version: winner.version, selectedBy: "calibration" },
    candidates: evaluated.map(({ rankerId, version, calibrationMetrics }) => ({ rankerId, version, calibrationMetrics })),
    selectedRankerHoldoutMetrics: holdoutMetrics,
    holdoutEvaluatedCandidateCount: 1,
  };
}

export async function evaluateRankerFiles({ corpusPath, manifestPath, candidatesPath, k = 3 }) {
  const [corpusRaw, manifestRaw, candidatesRaw] = await Promise.all([
    readFile(corpusPath, "utf8"), readFile(manifestPath, "utf8"), readFile(candidatesPath, "utf8"),
  ]);
  const incidents = corpusRaw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid incident JSONL at line ${index + 1}: ${error.message}`); }
  });
  const result = evaluateRankerCandidates({
    incidents,
    manifest: JSON.parse(manifestRaw),
    rankers: JSON.parse(candidatesRaw).rankers,
    k,
  });
  return { ...result, corpusSha256: (await import("node:crypto")).createHash("sha256").update(corpusRaw).digest("hex") };
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const base = new URL("./", import.meta.url);
  const result = await evaluateRankerFiles({
    corpusPath: value("corpus") ?? new URL("./benchmark-fixture.synthetic.jsonl", base),
    manifestPath: value("manifest") ?? new URL("./benchmark-split.synthetic.json", base),
    candidatesPath: value("candidates") ?? new URL("./ranker-candidates.synthetic.json", base),
    k: Number(value("k") ?? 2),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
