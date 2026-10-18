import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

function valueFor(type, partition) {
  if (partition === "nan") return NaN;
  if (partition === "positive_infinity") return Infinity;
  if (partition === "negative_zero") return -0;
  if (partition === "symbol_value") return Symbol("x");
  if (partition === "null_value" || type === "null") return null;
  if (partition === "undefined_value" || type === "undefined") return undefined;
  if (partition === "bigint_zero") return 0n;
  if (partition === "bigint_negative") return -1n;
  if (partition === "zero" || partition === "falsy") {
    if (type === "bigint") return 0n;
    if (type === "string") return "";
    if (type === "boolean") return false;
    return 0;
  }
  if (partition === "empty") return "";
  if (partition === "numeric_string") return "8";
  if (partition === "invalid_numeric_string") return "not-a-number";
  if (partition === "truthy") {
    if (type === "string") return "left";
    if (type === "boolean") return true;
    if (type === "bigint") return 1n;
    return 1;
  }
  if (partition === "negative") return type === "bigint" ? -1n : -1;
  if (type === "string") return "x";
  if (type === "number") return 1;
  if (type === "bigint") return 1n;
  if (type === "boolean") return true;
  if (type === "symbol") return Symbol("x");
  if (type === "null") return null;
  if (type === "undefined") return undefined;
  throw new Error(`Unknown primitive type: ${type}`);
}

function decodeExpected(encoded) {
  if (encoded === "NaN") return NaN;
  if (encoded === "Infinity") return Infinity;
  if (encoded === "-Infinity") return -Infinity;
  if (encoded === "-0") return -0;
  if (/^-?\d+n$/.test(encoded)) return BigInt(encoded.slice(0, -1));
  return JSON.parse(encoded);
}

function assertSameValue(actual, expected) {
  if (typeof expected === "number" && Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), "expected NaN");
    return;
  }
  assert.ok(Object.is(actual, expected), `expected ${String(expected)}, received ${String(actual)}`);
}

test("Zig-authored concrete semantic cases match ECMAScript runtime", async (t) => {
  const cases = JSON.parse(await readFile("tests/generated-semantic-cases.json", "utf8"));
  assert.equal(cases.length, 25, "the exported manifest must include every canonical Zig case");

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const operation = operations[scenario.operator];
      assert.equal(typeof operation, "function", `unknown operator: ${scenario.operator}`);
      const left = valueFor(scenario.left_type, scenario.left_partition);
      const right = valueFor(scenario.right_type, scenario.right_partition);
      if (scenario.expected_error) {
        const ErrorType = globalThis[scenario.expected_error];
        assert.equal(typeof ErrorType, "function", `unknown error type: ${scenario.expected_error}`);
        assert.throws(() => operation(left, right), ErrorType);
        return;
      }
      assertSameValue(operation(left, right), decodeExpected(scenario.expected));
    });
  }
});
