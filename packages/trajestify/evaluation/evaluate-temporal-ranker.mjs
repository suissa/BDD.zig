import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { rankRootCauseHypotheses } from "../dist/index.js";

function validTime(value, label) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} must be a valid timestamp`);
  return time;
}

function assertIncident(incident, index) {
  if (!incident || typeof incident.caseId !== "string" || !incident.caseId.trim() ||
      typeof incident.runId !== "string" || !incident.runId.trim() ||
      typeof incident.trajectoryId !== "string" || !incident.trajectoryId.trim() ||
      typeof incident.confirmedRootCause?.hypothesisId !== "string" ||
      !incident.confirmedRootCause.hypothesisId.trim()) {
    throw new Error(`incidents[${index}] requires caseId, runId, trajectoryId and confirmedRootCause.hypothesisId`);
  }
}

function assertArtifact(artifact, index) {
  if (!artifact || typeof artifact.runId !== "string" || !artifact.runId.trim() ||
      typeof artifact.trajectory?.id !== "string" || !artifact.trajectory.id.trim() ||
      !Array.isArray(artifact.steps) || !artifact.firstDivergence) {
    throw new Error(`artifacts[${index}] is not a divergent Trajestify trajectory artifact`);
  }
  validTime(artifact.startedAt, `artifacts[${index}].startedAt`);
  validTime(artifact.finishedAt, `artifacts[${index}].finishedAt`);
}

function reciprocalRank(position) { return position === null ? 0 : 1 / position; }

export function evaluateTemporalRanker({ incidents, artifacts }) {
  if (!Array.isArray(incidents) || incidents.length === 0) throw new Error("Incident corpus must not be empty");
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error("Trajectory artifacts must not be empty");
  const incidentByRun = new Map();
  incidents.forEach((incident, index) => {
    assertIncident(incident, index);
    if (incidentByRun.has(incident.runId)) throw new Error(`Duplicate incident runId: ${incident.runId}`);
    incidentByRun.set(incident.runId, incident);
  });
  const artifactByRun = new Map();
  artifacts.forEach((artifact, index) => {
    assertArtifact(artifact, index);
    if (artifactByRun.has(artifact.runId)) throw new Error(`Duplicate artifact runId: ${artifact.runId}`);
    artifactByRun.set(artifact.runId, artifact);
  });
  if (incidentByRun.size !== artifactByRun.size ||
      [...incidentByRun.keys()].some(runId => !artifactByRun.has(runId)) ||
      [...artifactByRun.keys()].some(runId => !incidentByRun.has(runId))) {
    throw new Error("Incident corpus and artifacts must match exactly by runId");
  }

  const byTrajectory = new Map();
  for (const artifact of artifacts) {
    const incident = incidentByRun.get(artifact.runId);
    if (artifact.trajectory.id !== incident.trajectoryId) {
      throw new Error(`Trajectory mismatch for runId ${artifact.runId}`);
    }
    const start = validTime(artifact.startedAt, `artifact ${artifact.runId}.startedAt`);
    const list = byTrajectory.get(incident.trajectoryId) ?? [];
    list.push({ artifact, incident, start });
    byTrajectory.set(incident.trajectoryId, list);
  }

  const trajectoryResults = [];
  for (const [trajectoryId, entries] of byTrajectory) {
    entries.sort((a, b) => a.start - b.start || a.artifact.runId.localeCompare(b.artifact.runId));
    const seenRunIds = new Set();
    const history = [];
    const observations = [];
    for (const entry of entries) {
      if (seenRunIds.has(entry.artifact.runId)) throw new Error(`Duplicate run in temporal sequence: ${entry.artifact.runId}`);
      seenRunIds.add(entry.artifact.runId);
      const ranked = rankRootCauseHypotheses(entry.artifact, history);
      const rootCauseId = entry.incident.confirmedRootCause.hypothesisId;
      const position = ranked.findIndex(item => item.id === rootCauseId);
      const rank = position < 0 ? null : position + 1;
      observations.push({
        caseId: entry.incident.caseId,
        runId: entry.artifact.runId,
        timestamp: entry.artifact.startedAt,
        hypothesisId: rootCauseId,
        rank,
        reciprocalRank: reciprocalRank(rank),
        topHypothesisId: ranked[0]?.id ?? null,
        top1Correct: ranked[0]?.id === rootCauseId,
        historyCount: history.length,
      });
      history.push(entry.artifact);
    }
    const rankValues = observations.map(item => item.rank).filter(Number.isInteger);
    const rankChanges = observations.slice(1).filter((item, index) => item.rank !== observations[index].rank).length;
    trajectoryResults.push({
      trajectoryId,
      observationCount: observations.length,
      top1Accuracy: observations.filter(item => item.top1Correct).length / observations.length,
      mrr: observations.reduce((sum, item) => sum + item.reciprocalRank, 0) / observations.length,
      meanRank: rankValues.length ? rankValues.reduce((sum, rank) => sum + rank, 0) / rankValues.length : null,
      rankCoverage: rankValues.length / observations.length,
      rankChangeRate: observations.length > 1 ? rankChanges / (observations.length - 1) : 0,
      observations,
    });
  }

  const total = trajectoryResults.reduce((sum, item) => sum + item.observationCount, 0);
  const all = trajectoryResults.flatMap(item => item.observations);
  return {
    schemaVersion: 1,
    method: "chronological-prefix-history",
    historyPolicy: "same-trajectory, strictly earlier artifact starts only",
    trajectoryCount: trajectoryResults.length,
    incidentCount: total,
    top1Accuracy: all.filter(item => item.top1Correct).length / total,
    mrr: all.reduce((sum, item) => sum + item.reciprocalRank, 0) / total,
    rankCoverage: all.filter(item => item.rank !== null).length / total,
    trajectoryResults,
  };
}

function parseJsonl(raw, label) {
  return raw.split(/\\r?\\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid ${label} JSONL at line ${index + 1}: ${error.message}`); }
  });
}

export async function evaluateTemporalRankerFiles({ corpusPath, artifactsPath }) {
  const [corpus, artifacts] = await Promise.all([readFile(corpusPath, "utf8"), readFile(artifactsPath, "utf8")]);
  return evaluateTemporalRanker({ incidents: parseJsonl(corpus, "incident"), artifacts: parseJsonl(artifacts, "artifact") });
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value("corpus") || !value("artifacts")) throw new Error("Usage: node evaluation/evaluate-temporal-ranker.mjs --corpus=<incidents.jsonl> --artifacts=<trajectories.jsonl>");
  const result = await evaluateTemporalRankerFiles({ corpusPath: value("corpus"), artifactsPath: value("artifacts") });
  process.stdout.write(JSON.stringify(result, null, 2) + "\\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
