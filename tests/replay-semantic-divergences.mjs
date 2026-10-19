import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reportPath = process.argv[2] ?? "tests/semantic-divergences.json";

const operations = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  remainder: (a, b) => a % b,
  exponent: (a, b) => a ** b,
  strict_equal: (a, b) => a === b,
  loose_equal: (a, b) => a == b,
  less_than: (a, b) => a < b,
  less_equal: (a, b) => a <= b,
  greater_than: (a, b) => a > b,
  greater_equal: (a, b) => a >= b,
  logical_and: (a, b) => a && b,
  logical_or: (a, b) => a || b,
  bitwise_and: (a, b) => a & b,
};

const valuePartitions = {
  string: ["", "0", "2", "not-a-number"],
  number: [0, -0, 2, NaN, Infinity, -Infinity],
  bigint: [0n, 1n, -1n, 2n],
  boolean: [false, true],
  symbol: [Symbol("partition-a"), Symbol("partition-b")],
  null: [null],
  undefined: [undefined],
};

function describeValue(value) {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (Object.is(value, -0)) return "-0";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
  }
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (value === undefined) return "undefined";
  return JSON.stringify(value) ?? String(value);
}

const report = JSON.parse(await readFile(reportPath, "utf8"));
assert.equal(report.schemaVersion, 1, "unsupported divergence report schema");
assert.ok(Array.isArray(report.divergences), "report must contain divergences");

for (const entry of report.divergences) {
  const leftValues = valuePartitions[entry.rule.left];
  const rightValues = valuePartitions[entry.rule.right];
  assert.ok(leftValues && entry.input.leftPartitionIndex < leftValues.length, `${entry.caseId}: left partition cannot be resolved`);
  assert.ok(rightValues && entry.input.rightPartitionIndex < rightValues.length, `${entry.caseId}: right partition cannot be resolved`);
  const left = leftValues[entry.input.leftPartitionIndex];
  const right = rightValues[entry.input.rightPartitionIndex];

  let observed;
  try {
    const value = operations[entry.rule.operator](left, right);
    observed = { kind: "value", value: describeValue(value), valueType: typeof value };
  } catch (error) {
    observed = { kind: "error", name: error?.name ?? "Error", message: error?.message ?? String(error) };
  }

  assert.deepEqual(observed, entry.observed, `${entry.caseId}: runtime result no longer reproduces the recorded outcome`);
  console.log(`REPRODUCED ${entry.caseId}: ${entry.reproduction.expression}`);
}

console.log(`Replayed ${report.divergences.length} semantic divergence case(s) from ${reportPath}.`);
