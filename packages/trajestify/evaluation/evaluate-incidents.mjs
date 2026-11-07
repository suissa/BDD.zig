import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluateRanking } from "./evaluate-hypotheses.mjs";

function incidentToEvaluationCase(incident, index) {
  const prefix = `incident[${index}]`;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) throw new Error(`${prefix} must be an object`);
  for (const field of ["trajectoryId", "runId"]) {
    if (typeof incident[field] !== "string" || !incident[field].trim()) throw new Error(`${prefix}.${field} is required`);
  }
  if (!["diverged", "failed", "error"].includes(incident.outcome)) throw new Error(`${prefix}.outcome must be diverged, failed or error`);
  const root = incident.confirmedRootCause;
  if (!root || root.verification !== "confirmed" || typeof root.hypothesisId !== "string" || !root.hypothesisId.trim()) {
    throw new Error(`${prefix}.confirmedRootCause must contain a confirmed hypothesisId`);
  }
  if (!Array.isArray(root.evidenceIds) || root.evidenceIds.length === 0 || root.evidenceIds.some(id => typeof id !== "string" || !id.trim())) {
    throw new Error(`${prefix}.confirmedRootCause.evidenceIds must contain evidence references`);
  }
  if (typeof incident.caseId !== "string" || !incident.caseId.trim()) throw new Error(`${prefix}.caseId is required`);
  if (typeof root.eventId !== "string" || !root.eventId.trim()) throw new Error(`${prefix}.confirmedRootCause.eventId is required`);
  if (new Set(root.evidenceIds).size !== root.evidenceIds.length) throw new Error(`${prefix}.confirmedRootCause.evidenceIds must be unique`);
  if (!Array.isArray(incident.rankedHypothesisIds) || incident.rankedHypothesisIds.length === 0 || incident.rankedHypothesisIds.some(id => typeof id !== "string" || !id.trim())) {
    throw new Error(`${prefix}.rankedHypothesisIds must contain non-empty strings`);
  }
  if (new Set(incident.rankedHypothesisIds).size !== incident.rankedHypothesisIds.length) throw new Error(`${prefix}.rankedHypothesisIds must be unique`);
  return {
    caseId: incident.caseId,
    rankedHypothesisIds: incident.rankedHypothesisIds,
    relevantHypothesisIds: [root.hypothesisId],
  };
}

export function evaluateIncidentCorpus(incidents, k = 3) {
  if (!Array.isArray(incidents) || incidents.length === 0) throw new Error("Incident corpus must contain at least one incident");
  const cases = incidents.map(incidentToEvaluationCase);
  return evaluateRanking(cases, k);
}

export async function evaluateIncidentFile(filePath, k = 3) {
  const raw = await readFile(filePath, "utf8");
  const incidents = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid incident JSONL at line ${index + 1}: ${error.message}`); }
  });
  return evaluateIncidentCorpus(incidents, k);
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(arg => !arg.startsWith("--")) ?? new URL("./corpus.incidents.synthetic.jsonl", import.meta.url);
  const kArg = args.find(arg => arg.startsWith("--k="));
  const k = kArg ? Number(kArg.slice(4)) : 3;
  const includeDetails = args.includes("--details");
  const result = await evaluateIncidentFile(filePath, k);
  if (!includeDetails) delete result.caseResults;
  process.stdout.write(JSON.stringify(result, null, 2) + "\\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
