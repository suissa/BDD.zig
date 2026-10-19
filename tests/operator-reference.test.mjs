import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";

const primitiveValues = {
  string: "2",
  number: 2,
  bigint: 2n,
  boolean: true,
  symbol: Symbol("x"),
  null: null,
  undefined: undefined,
};

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

function divergenceRecord(entry, left, right, context, error) {
  return {
    rule: { left: entry.left, operator: entry.operator, right: entry.right },
    prediction: { result: entry.result, outcome: entry.outcome },
    input: { left: describeValue(left), right: describeValue(right), context },
    divergence: error instanceof Error ? error.message : String(error),
  };
}

function assertValueOutcome(entry, left, right, context) {
  const operation = operations[entry.operator];
  let actual;
  let thrown;
  try {
    actual = operation(left, right);
  } catch (error) {
    thrown = error;
  }

  if (entry.outcome === "type_error") {
    assert.ok(thrown instanceof TypeError,
      `${context}: classifier predicted TypeError; received ${thrown?.constructor?.name ?? "a value"}`);
    return;
  }

  if (thrown) {
    assert.ok(!(thrown instanceof TypeError),
      `${context}: classifier did not predict TypeError but runtime threw TypeError: ${thrown.message}`);
    return; // RangeError is value-dependent (e.g. BigInt division by zero).
  }

  assertMatchesModel(entry, actual, context, left, right);
}

function assertMatchesModel(entry, actual, context = `${entry.left} ${entry.operator} ${entry.right}`, leftValue = primitiveValues[entry.left], rightValue = primitiveValues[entry.right]) {
  switch (entry.result) {
    case "string": assert.equal(typeof actual, "string", context); break;
    case "boolean": assert.equal(typeof actual, "boolean", context); break;
    case "bigint": assert.equal(typeof actual, "bigint", context); break;
    case "number_or_nan":
    case "number": assert.equal(typeof actual, "number", context); break;
    case "operand": {
      const expectedOperand = entry.operator === "logical_and" ? (leftValue ? rightValue : leftValue) : (leftValue ? leftValue : rightValue);
      assert.ok(Object.is(actual, expectedOperand), `${context}: logical operator must return selected operand`);
      break;
    }
    default: assert.fail(`${context}: unexpected successful result category: ${entry.result}`);
  }
}

test("Zig-generated 735-case matrix agrees with JavaScript runtime", async (t) => {
  const matrix = JSON.parse(await readFile("tests/generated-operator-matrix.json", "utf8"));
  assert.equal(matrix.length, 7 * 7 * 15);

  for (const entry of matrix) {
    await t.test(`${entry.left} ${entry.operator} ${entry.right}`, () => {
      const left = primitiveValues[entry.left];
      const right = primitiveValues[entry.right];
      const operation = operations[entry.operator];
      assert.equal(typeof operation, "function");

      if (entry.outcome === "type_error") {
        assert.throws(() => operation(left, right), TypeError);
        return;
      }

      let actual;
      assert.doesNotThrow(() => { actual = operation(left, right); });
      assertMatchesModel(entry, actual);
    });
  }
});

test("classifier remains consistent across concrete value partitions", async () => {
  const matrix = JSON.parse(await readFile("tests/generated-operator-matrix.json", "utf8"));
  const reportPath = "tests/semantic-divergences.json";
  await rm(reportPath, { force: true });
  let checked = 0;
  const divergences = [];

  for (const entry of matrix) {
    const leftValues = valuePartitions[entry.left];
    const rightValues = valuePartitions[entry.right];
    for (let leftIndex = 0; leftIndex < leftValues.length; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < rightValues.length; rightIndex += 1) {
        const left = leftValues[leftIndex];
        const right = rightValues[rightIndex];
        const context = `${entry.left}[${leftIndex}] ${entry.operator} ${entry.right}[${rightIndex}] (modeled=${entry.result}/${entry.outcome})`;
        try {
          assertValueOutcome(entry, left, right, context);
        } catch (error) {
          divergences.push(divergenceRecord(entry, left, right, context, error));
        }
        checked += 1;
      }
    }
  }

  assert.ok(checked >= matrix.length, `expected partition checks across all ${matrix.length} classifier rules; checked ${checked}`);
  console.log(`Validated ${checked} concrete operand combinations across ${matrix.length} classifier rules.`);

  if (divergences.length > 0) {
    const report = {
      schemaVersion: 1,
      generatedBy: "tests/operator-reference.test.mjs",
      checkedCombinations: checked,
      classifierRules: matrix.length,
      divergenceCount: divergences.length,
      divergences,
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\\n`);
    assert.fail(`${divergences.length} semantic divergences found; reproducible report written to ${reportPath}\\n${JSON.stringify(divergences.slice(0, 10), null, 2)}`);
  }
});
