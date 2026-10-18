import test from "node:test";
import assert from "node:assert/strict";

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

const scenarios = [
  { name: "numeric string subtraction", op: "subtract", left: "8", right: 3, expected: 5 },
  { name: "invalid numeric string produces NaN", op: "subtract", left: "not-a-number", right: 1, expected: NaN },
  { name: "empty string converts to zero", op: "multiply", left: "", right: 7, expected: 0 },
  { name: "null converts to zero in addition", op: "add", left: null, right: 1, expected: 1 },
  { name: "undefined produces NaN in addition", op: "add", left: undefined, right: 1, expected: NaN },
  { name: "number division by positive zero", op: "divide", left: 1, right: 0, expected: Infinity },
  { name: "zero divided by zero", op: "divide", left: 0, right: 0, expected: NaN },
  { name: "negative zero is preserved", op: "multiply", left: -0, right: 1, expected: -0 },
  { name: "NaN relational comparison is false", op: "less_than", left: NaN, right: 1, expected: false },
  { name: "NaN loose equality is false", op: "loose_equal", left: NaN, right: NaN, expected: false },
  { name: "positive infinity remains infinity", op: "multiply", left: Infinity, right: 2, expected: Infinity },
  { name: "BigInt division by zero throws RangeError", op: "divide", left: 8n, right: 0n, error: RangeError },
  { name: "BigInt remainder by zero throws RangeError", op: "remainder", left: 8n, right: 0n, error: RangeError },
  { name: "negative BigInt exponent throws RangeError", op: "exponent", left: 2n, right: -1n, error: RangeError },
  { name: "mixed BigInt and Number arithmetic throws TypeError", op: "subtract", left: 2n, right: 1, error: TypeError },
  { name: "Symbol numeric conversion throws TypeError", op: "multiply", left: Symbol("x"), right: 2, error: TypeError },
  { name: "string plus BigInt concatenates", op: "add", left: "value=", right: 2n, expected: "value=2" },
  { name: "logical AND returns falsy left operand", op: "logical_and", left: 0, right: "right", expected: 0 },
  { name: "logical OR returns truthy left operand", op: "logical_or", left: "left", right: "right", expected: "left" },
  { name: "logical OR returns right operand for falsy left", op: "logical_or", left: "", right: 9, expected: 9 },
  { name: "bitwise AND converts Number operands", op: "bitwise_and", left: 6, right: 3, expected: 2 },
  { name: "strict equality does not coerce", op: "strict_equal", left: "2", right: 2, expected: false },
  { name: "loose equality coerces numeric string", op: "loose_equal", left: "2", right: 2, expected: true },
];

function assertSameValue(actual, expected) {
  if (typeof expected === "number" && Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), "expected NaN");
    return;
  }
  assert.ok(Object.is(actual, expected), `expected ${String(expected)}, received ${String(actual)}`);
}

test("concrete value partitions match ECMAScript runtime results", async (t) => {
  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const operation = operations[scenario.op];
      assert.equal(typeof operation, "function", `unknown operator: ${scenario.op}`);
      if (scenario.error) {
        assert.throws(() => operation(scenario.left, scenario.right), scenario.error);
        return;
      }
      assertSameValue(operation(scenario.left, scenario.right), scenario.expected);
    });
  }
});
