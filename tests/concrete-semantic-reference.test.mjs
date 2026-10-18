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
  if (partition === "numeric_string_two") return "2";
  if (partition === "numeric_two") return 2;
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

function assertModeledCategory(entry, actual) {
  const category = entry.modeled_result;
  if (category === "operand") {
    const left = valueFor(entry.left_type, entry.left_partition);
    const right = valueFor(entry.right_type, entry.right_partition);
    const expectedOperand = entry.operator === "logical_and"
      ? (left ? right : left)
      : (left ? left : right);
    assert.ok(Object.is(actual, expectedOperand), "classifier predicts operand selection");
    return;
  }
  if (category === "type_error") {
    assert.fail("classifier predicted TypeError but runtime returned a value");
  }
  const expectedType = ({
    string: "string",
    number: "number",
    number_or_nan: "number",
    bigint: "bigint",
    boolean: "boolean",
  })[category];
  assert.equal(typeof actual, expectedType,
    `classifier category ${category} disagrees with runtime type ${typeof actual}`);
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
  assert.equal(cases.length, 29, "the exported manifest must include every canonical Zig case");

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const operation = operations[scenario.operator];
      assert.equal(typeof operation, "function", `unknown operator: ${scenario.operator}`);
      const left = valueFor(scenario.left_type, scenario.left_partition);
      const right = valueFor(scenario.right_type, scenario.right_partition);
      if (scenario.expected_error) {
        if (scenario.expected_error === "TypeError") {
          assert.equal(scenario.modeled_outcome, "type_error",
            "classifier and runtime must agree on TypeError");
        } else {
          assert.notEqual(scenario.modeled_result, "type_error",
            "value-dependent errors must not be confused with modeled type errors");
        }
        const ErrorType = globalThis[scenario.expected_error];
        assert.equal(typeof ErrorType, "function", `unknown error type: ${scenario.expected_error}`);
        assert.throws(() => operation(left, right), ErrorType);
        return;
      }
      const actual = operation(left, right);
      assertModeledCategory(scenario, actual);
      assertSameValue(actual, decodeExpected(scenario.expected));
    });
  }
});
