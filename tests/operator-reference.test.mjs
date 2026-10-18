import test from "node:test";
import assert from "node:assert/strict";

test("concrete ECMAScript primitive value partitions", async (t) => {
  const cases = [
    ["string concatenation", () => "x" + 1, "x1"],
    ["invalid numeric string yields NaN", () => Number("nope") - 1, NaN],
    ["number division by zero yields Infinity", () => 1 / 0, Infinity],
    ["BigInt division by zero throws RangeError", () => 1n / 0n, RangeError],
    ["negative BigInt exponent throws RangeError", () => 2n ** -1n, RangeError],
    ["mixed BigInt addition throws TypeError", () => 1n + 1, TypeError],
    ["Symbol arithmetic throws TypeError", () => Symbol("x") * 2, TypeError],
    ["NaN relational comparison is false", () => NaN < 1, false],
    ["logical AND returns falsy operand", () => 0 && "right", 0],
    ["null numeric conversion yields zero", () => Number(null) + 1, 1],
    ["undefined numeric conversion yields NaN", () => Number(undefined) + 1, NaN],
    ["negative zero is preserved by multiplication", () => Object.is(-0 * 1, -0), true],
  ];

  for (const [name, expression, expected] of cases) {
    await t.test(name, () => {
      if (expected === TypeError || expected === RangeError) assert.throws(expression, expected);
      else if (Number.isNaN(expected)) assert.ok(Number.isNaN(expression()));
      else assert.deepStrictEqual(expression(), expected);
    });
  }
});
