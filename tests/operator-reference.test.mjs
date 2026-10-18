import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

function assertMatchesModel(entry, actual) {
  switch (entry.result) {
    case "string": assert.equal(typeof actual, "string"); break;
    case "boolean": assert.equal(typeof actual, "boolean"); break;
    case "bigint": assert.equal(typeof actual, "bigint"); break;
    case "number_or_nan":
    case "number": assert.equal(typeof actual, "number"); break;
    case "operand": {
      const left = primitiveValues[entry.left];
      const right = primitiveValues[entry.right];
      const expectedOperand = entry.operator === "logical_and" ? (left ? right : left) : (left ? left : right);
      assert.ok(Object.is(actual, expectedOperand), "logical operator returns selected operand");
      break;
    }
    default: assert.fail(`Unexpected successful result category: ${entry.result}`);
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
