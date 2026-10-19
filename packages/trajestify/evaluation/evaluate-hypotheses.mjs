import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function assertCase(item, index) {
  const prefix = `case[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${prefix} must be an object`);
  if (typeof item.caseId !== "string" || !item.caseId.trim()) throw new Error(`${prefix}.caseId must be a non-empty string`);
  for (const field of ["rankedHypothesisIds", "relevantHypothesisIds"]) {
    if (!Array.isArray(item[field]) || item[field].some(id => typeof id !== "string" || !id.trim())) {
      throw new Error(`${prefix}.${field} must be an array of non-empty strings`);
    }
    if (new Set(item[field]).size !== item[field].length) throw new Error(`${prefix}.${field} contains duplicates`);
  }
  if (item.relevantHypothesisIds.length === 0) throw new Error(`${prefix}.relevantHypothesisIds must not be empty`);
  if (item.rankedHypothesisIds.length === 0) throw new Error(`${prefix}.rankedHypothesisIds must not be empty`);
  return item;
}

export function evaluateRanking(cases, k = 3) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("Evaluation corpus must contain at least one case");
  if (!Number.isInteger(k) || k < 1) throw new Error("k must be a positive integer");
  const ids = new Set();
  const checked = cases.map((item, index) => {
    const current = assertCase(item, index);
    if (ids.has(current.caseId)) throw new Error(`Duplicate caseId: ${current.caseId}`);
    ids.add(current.caseId);
    return current;
  });

  let reciprocalRankSum = 0;
  let relevantRetrieved = 0;
  let relevantTotal = 0;
  let topKCount = 0;
  let falsePositiveCount = 0;
  let casesWithHit = 0;

  for (const item of checked) {
    const relevant = new Set(item.relevantHypothesisIds);
    const cutoff = item.rankedHypothesisIds.slice(0, k);
    const firstRelevantRank = item.rankedHypothesisIds.findIndex(id => relevant.has(id));
    if (firstRelevantRank >= 0) {
      reciprocalRankSum += 1 / (firstRelevantRank + 1);
      casesWithHit++;
    }
    relevantTotal += relevant.size;
    relevantRetrieved += cutoff.filter(id => relevant.has(id)).length;
    topKCount += cutoff.length;
    falsePositiveCount += cutoff.filter(id => !relevant.has(id)).length;
  }

  return {
    caseCount: checked.length,
    k,
    mrr: Number((reciprocalRankSum / checked.length).toFixed(6)),
    recallAtK: Number((relevantRetrieved / relevantTotal).toFixed(6)),
    precisionAtK: topKCount ? Number((relevantRetrieved / topKCount).toFixed(6)) : 0,
    falsePositiveRateAtK: topKCount ? Number((falsePositiveCount / topKCount).toFixed(6)) : 0,
    casesWithRelevantHit: casesWithHit,
    relevantHypotheses: relevantTotal,
    relevantHypothesesRetrievedAtK: relevantRetrieved,
    topKHypothesesEvaluated: topKCount,
    falsePositivesAtK: falsePositiveCount,
  };
}

export async function evaluateFile(filePath, k = 3) {
  const raw = await readFile(filePath, "utf8");
  const cases = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
  });
  return evaluateRanking(cases, k);
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(arg => !arg.startsWith("--")) ?? new URL("./corpus.synthetic.jsonl", import.meta.url);
  const kArg = args.find(arg => arg.startsWith("--k="));
  const k = kArg ? Number(kArg.slice(4)) : 3;
  const result = await evaluateFile(filePath, k);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
