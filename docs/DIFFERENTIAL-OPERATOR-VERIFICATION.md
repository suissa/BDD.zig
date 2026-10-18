# Differential operator verification

The operator model is exported by Zig itself. CI serializes all 7 × 7 × 15 = 735 primitive/operator combinations to `tests/generated-operator-matrix.json`, then Node executes each pair against the JavaScript runtime.

For every generated case, the reference test checks the modeled result category (string, number/NaN, BigInt, boolean, or operand) or verifies a modeled TypeError. The expected matrix comes from `classify` in Zig, not from a second hand-maintained classification table.

The representative value for each primitive is stable: string `"2"`, number `2`, BigInt `2n`, boolean `true`, Symbol, `null`, and `undefined`. Value-sensitive edge cases such as NaN, negative zero, BigInt division by zero, and negative BigInt exponent remain in the dedicated regression tests.

This is differential coverage over one representative per primitive kind, not exhaustive ECMAScript conformance. Expand value partitions next and compare normalized concrete values as well as result categories.

Run locally:
1. `zig build test`
2. `zig run src/export_operator_matrix.zig`
3. `node --test tests/operator-reference.test.mjs`
