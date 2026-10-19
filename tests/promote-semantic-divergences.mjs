import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "tests/semantic-divergences.json";
const outputPath = process.argv[3] ?? "tests/semantic-regressions.json";
const report = JSON.parse(await readFile(inputPath, "utf8"));
assert.equal(report.schemaVersion, 1, "unsupported divergence report schema");
assert.ok(Array.isArray(report.divergences), "divergence report must contain a divergences array");

let corpus;
try {
  corpus = JSON.parse(await readFile(outputPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  corpus = { schemaVersion: 1, description: "Promoted JavaScript semantic regression cases.", cases: [] };
}
assert.equal(corpus.schemaVersion, 1, "unsupported regression corpus schema");
assert.ok(Array.isArray(corpus.cases), "regression corpus must contain a cases array");

const byId = new Map(corpus.cases.map((entry) => [entry.caseId, entry]));
let added = 0;
let unchanged = 0;
for (const divergence of report.divergences) {
  assert.ok(divergence.caseId && divergence.rule && divergence.input && divergence.observed,
    "each divergence must include caseId, rule, input and observed outcome");
  const regression = {
    caseId: divergence.caseId,
    ruleId: divergence.ruleId,
    rule: divergence.rule,
    prediction: divergence.prediction,
    input: divergence.input,
    reproduction: divergence.reproduction,
    expected: divergence.observed,
    source: inputPath,
  };
  const existing = byId.get(regression.caseId);
  if (existing) {
    assert.deepEqual(
      { ruleId: existing.ruleId, rule: existing.rule, prediction: existing.prediction, input: existing.input, expected: existing.expected },
      { ruleId: regression.ruleId, rule: regression.rule, prediction: regression.prediction, input: regression.input, expected: regression.expected },
      `caseId ${regression.caseId} already exists with different contents; review it manually`,
    );
    unchanged += 1;
    continue;
  }
  byId.set(regression.caseId, regression);
  added += 1;
}

corpus.cases = [...byId.values()].sort((a, b) => a.caseId.localeCompare(b.caseId));
await writeFile(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);
console.log(`Promoted ${added} case(s); ${unchanged} already present; corpus has ${corpus.cases.length} case(s): ${outputPath}`);
