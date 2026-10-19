import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const corpusPath = process.argv[2] ?? "tests/semantic-regressions.json";
const matrixPath = "tests/generated-operator-matrix.json";
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

function assertPrediction(rule, left, right, observed, caseId) {
  if (rule.outcome === "type_error") {
    assert.equal(observed.kind, "error", `${caseId}: classifier predicts TypeError but runtime returned a value`);
    assert.equal(observed.name, "TypeError", `${caseId}: classifier predicts TypeError`);
    return;
  }
  if (observed.kind === "error") {
    assert.notEqual(observed.name, "TypeError", `${caseId}: classifier missed TypeError: ${observed.message}`);
    return; // Some errors depend on values, e.g. BigInt division by zero.
  }
  switch (rule.result) {
    case "string": assert.equal(observed.valueType, "string", `${caseId}: expected string`); break;
    case "boolean": assert.equal(observed.valueType, "boolean", `${caseId}: expected boolean`); break;
    case "bigint": assert.equal(observed.valueType, "bigint", `${caseId}: expected bigint`); break;
    case "number":
    case "number_or_nan": assert.equal(observed.valueType, "number", `${caseId}: expected number`); break;
    case "operand": {
      const expected = rule.operator === "logical_and" ? (left ? right : left) : (left ? left : right);
      assert.equal(observed.value, describeValue(expected), `${caseId}: logical operator returned the wrong operand`);
      assert.equal(observed.valueType, typeof expected, `${caseId}: logical operator returned the wrong operand type`);
      break;
    }
    default: assert.fail(`${caseId}: unknown predicted result category ${rule.result}`);
  }
}

function observe(entry, left, right) {
  try {
    const value = operations[entry.rule.operator](left, right);
    return { kind: "value", value: describeValue(value), valueType: typeof value };
  } catch (error) {
    return { kind: "error", name: error?.name ?? "Error", message: error?.message ?? String(error) };
  }
}

const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
const matrix = JSON.parse(await readFile(matrixPath, "utf8"));
const rulesById = new Map(matrix.map((rule) => [`${rule.left}:${rule.operator}:${rule.right}`, rule]));
assert.equal(corpus.schemaVersion, 1, "unsupported semantic regression corpus schema");
assert.ok(Array.isArray(corpus.cases), "semantic regression corpus must contain cases");

test(`promoted semantic regressions (${corpus.cases.length} case(s))`, async (t) => {
  const seen = new Set();
  for (const entry of corpus.cases) {
    await t.test(entry.caseId, () => {
      assert.ok(entry.caseId && !seen.has(entry.caseId), "caseId must be present and unique");
      seen.add(entry.caseId);
      assert.equal(typeof operations[entry.rule?.operator], "function", "unknown operator");
      const leftValues = valuePartitions[entry.rule.left];
      const rightValues = valuePartitions[entry.rule.right];
      assert.ok(leftValues && Number.isInteger(entry.input.leftPartitionIndex) &&
        entry.input.leftPartitionIndex >= 0 && entry.input.leftPartitionIndex < leftValues.length,
      `${entry.caseId}: invalid left partition index`);
      assert.ok(rightValues && Number.isInteger(entry.input.rightPartitionIndex) &&
        entry.input.rightPartitionIndex >= 0 && entry.input.rightPartitionIndex < rightValues.length,
      `${entry.caseId}: invalid right partition index`);
      const left = leftValues[entry.input.leftPartitionIndex];
      const right = rightValues[entry.input.rightPartitionIndex];
      const rule = rulesById.get(entry.ruleId);
      assert.ok(rule, `${entry.caseId}: rule ${entry.ruleId} is missing from Zig-generated matrix`);
      assert.deepEqual(
        { result: entry.prediction?.result, outcome: entry.prediction?.outcome },
        { result: rule.result, outcome: rule.outcome },
        `${entry.caseId}: promoted prediction no longer matches the Zig classifier`,
      );
      const actual = observe(entry, left, right);
      assert.deepEqual(actual, entry.expected, `${entry.caseId}: JavaScript outcome changed; ${entry.reproduction?.expression ?? ""}`);
      assertPrediction(rule, left, right, actual, entry.caseId);
    });
  }
});
