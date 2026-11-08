import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { rankRootCauseHypotheses } from "../dist/index.js";

function assertArtifact(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.runId !== "string" || !value.runId.trim() ||
      typeof value.trajectory?.id !== "string" || !value.trajectory.id.trim() ||
      !Array.isArray(value.steps) || !Array.isArray(value.diagnostics?.causalPath) ||
      !("firstDivergence" in value)) {
    throw new Error(`artifacts[${index}] is not a valid Trajestify trajectory artifact`);
  }
  return value;
}

export function buildNativeRankerCandidate({ incidents, artifacts, history = [], rankerId = "trajestify-native", version = "0.1.0" }) {
  if (!Array.isArray(incidents) || incidents.length === 0) throw new Error("Incident corpus must not be empty");
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error("Trajectory artifacts must not be empty");
  if (!Array.isArray(history)) throw new Error("History must be an array");
  if (typeof rankerId !== "string" || !rankerId.trim()) throw new Error("rankerId is required");
  if (typeof version !== "string" || !version.trim()) throw new Error("version is required");

  const byRunId = new Map();
  for (const [index, raw] of artifacts.entries()) {
    const artifact = assertArtifact(raw, index);
    if (byRunId.has(artifact.runId)) throw new Error(`Duplicate artifact runId: ${artifact.runId}`);
    byRunId.set(artifact.runId, artifact);
  }

  const seenCases = new Set();
  const predictions = incidents.map((incident, index) => {
    if (!incident || typeof incident.caseId !== "string" || !incident.caseId.trim() ||
        typeof incident.runId !== "string" || !incident.runId.trim() ||
        typeof incident.trajectoryId !== "string" || !incident.trajectoryId.trim()) {
      throw new Error(`incidents[${index}] requires caseId, runId and trajectoryId`);
    }
    if (seenCases.has(incident.caseId)) throw new Error(`Duplicate incident caseId: ${incident.caseId}`);
    seenCases.add(incident.caseId);
    const artifact = byRunId.get(incident.runId);
    if (!artifact) throw new Error(`Missing trajectory artifact for runId: ${incident.runId}`);
    if (artifact.trajectory.id !== incident.trajectoryId) {
      throw new Error(`Trajectory mismatch for runId ${incident.runId}: expected ${incident.trajectoryId}, received ${artifact.trajectory.id}`);
    }
    if (!artifact.firstDivergence) throw new Error(`Incident ${incident.caseId} has no first divergence in its trajectory artifact`);
    const ranked = rankRootCauseHypotheses(artifact, history);
    const rankedHypothesisIds = ranked.map(item => item.id);
    if (rankedHypothesisIds.length === 0) throw new Error(`Native ranker produced no hypotheses for incident: ${incident.caseId}`);
    return { caseId: incident.caseId, rankedHypothesisIds };
  });

  if (byRunId.size !== incidents.length) {
    const incidentRuns = new Set(incidents.map(item => item.runId));
    const extras = [...byRunId.keys()].filter(runId => !incidentRuns.has(runId));
    if (extras.length) throw new Error(`Unreferenced trajectory artifacts: ${extras.join(", ")}`);
  }
  return { rankerId, version, predictions };
}

function parseJsonl(raw, label) {
  return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid ${label} JSONL at line ${index + 1}: ${error.message}`); }
  });
}

export async function buildNativeRankerFiles({ corpusPath, artifactsPath, historyPath, outputPath, rankerId, version }) {
  const [corpusRaw, artifactsRaw, historyRaw] = await Promise.all([
    readFile(corpusPath, "utf8"),
    readFile(artifactsPath, "utf8"),
    historyPath ? readFile(historyPath, "utf8") : Promise.resolve(""),
  ]);
  const candidate = buildNativeRankerCandidate({
    incidents: parseJsonl(corpusRaw, "incident"),
    artifacts: parseJsonl(artifactsRaw, "trajectory artifact"),
    history: historyRaw ? parseJsonl(historyRaw, "history artifact") : [],
    rankerId,
    version,
  });
  const output = JSON.stringify({ schemaVersion: 1, rankers: [candidate] }, null, 2) + "\n";
  if (outputPath) await writeFile(outputPath, output, "utf8");
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const corpusPath = value("corpus");
  const artifactsPath = value("artifacts");
  if (!corpusPath || !artifactsPath) {
    throw new Error("Usage: node evaluation/build-native-ranker-candidate.mjs --corpus=<incidents.jsonl> --artifacts=<trajectories.jsonl> [--history=<history.jsonl>] [--output=<candidate.json>]");
  }
  const output = await buildNativeRankerFiles({
    corpusPath,
    artifactsPath,
    historyPath: value("history"),
    outputPath: value("output"),
    rankerId: value("ranker-id") ?? "trajestify-native",
    version: value("version") ?? "0.1.0",
  });
  if (!value("output")) process.stdout.write(output);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
