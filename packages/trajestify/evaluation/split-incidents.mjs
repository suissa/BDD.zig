import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SPLITS = new Set(["train", "calibration", "holdout"]);

export function validateIncidentSplit(incidents, manifest) {
  if (!Array.isArray(incidents) || incidents.length === 0) throw new Error("Incident corpus must contain at least one incident");
  if (!manifest || !Array.isArray(manifest.assignments) || manifest.assignments.length === 0) {
    throw new Error("Split manifest must contain assignments");
  }

  const trajectorySplits = new Map();
  const caseIds = new Set();
  for (const [index, incident] of incidents.entries()) {
    if (!incident || typeof incident !== "object" || !incident.trajectoryId?.trim()) {
      throw new Error(`incident[${index}].trajectoryId is required for leakage-safe grouping`);
    }
    if (typeof incident.caseId !== "string" || !incident.caseId.trim()) throw new Error(`incident[${index}].caseId is required`);
    if (caseIds.has(incident.caseId)) throw new Error(`Duplicate caseId: ${incident.caseId}`);
    caseIds.add(incident.caseId);
    const split = trajectorySplits.get(incident.trajectoryId);
    if (split && split !== manifest.assignments.find(x => x.trajectoryId === incident.trajectoryId)?.split) {
      throw new Error(`Trajectory leakage: ${incident.trajectoryId} is assigned to multiple splits`);
    }
  }

  const assignments = new Map();
  for (const [index, item] of manifest.assignments.entries()) {
    if (!item || typeof item.trajectoryId !== "string" || !item.trajectoryId.trim()) throw new Error(`assignments[${index}].trajectoryId is required`);
    if (!SPLITS.has(item.split)) throw new Error(`assignments[${index}].split must be train, calibration or holdout`);
    if (assignments.has(item.trajectoryId)) throw new Error(`Duplicate trajectory assignment: ${item.trajectoryId}`);
    assignments.set(item.trajectoryId, item.split);
  }

  const observed = new Set(incidents.map(x => x.trajectoryId));
  for (const trajectoryId of observed) {
    if (!assignments.has(trajectoryId) || !SPLITS.has(assignments.get(trajectoryId))) {
      throw new Error(`Missing split assignment for trajectory: ${trajectoryId}`);
    }
  }
  for (const trajectoryId of assignments.keys()) {
    if (!observed.has(trajectoryId)) throw new Error(`Manifest references unknown trajectory: ${trajectoryId}`);
  }

  const counts = { train: 0, calibration: 0, holdout: 0 };
  for (const incident of incidents) counts[assignments.get(incident.trajectoryId)]++;
  for (const split of SPLITS) {
    if (!incidents.some(x => assignments.get(x.trajectoryId) === split)) throw new Error(`Split "${split}" is empty`);
  }
  return { incidentCount: incidents.length, trajectoryCount: observed.size, counts, assignments: Object.fromEntries(assignments) };
}

export async function validateIncidentSplitFiles(corpusPath, manifestPath) {
  const [corpusText, manifestText] = await Promise.all([readFile(corpusPath, "utf8"), readFile(manifestPath, "utf8")]);
  const incidents = corpusText.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL at line ${i + 1}: ${error.message}`); }
  });
  return validateIncidentSplit(incidents, JSON.parse(manifestText));
}

async function main() {
  const [corpusPath, manifestPath] = process.argv.slice(2);
  if (!corpusPath || !manifestPath) throw new Error("Usage: node split-incidents.mjs <corpus.jsonl> <manifest.json>");
  process.stdout.write(JSON.stringify(await validateIncidentSplitFiles(corpusPath, manifestPath), null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
