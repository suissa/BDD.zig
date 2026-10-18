# Differential operator verification

The operator model is exported by Zig itself. CI serializes all 7 × 7 × 15 = 735 primitive/operator combinations to `tests/generated-operator-matrix.json`, then Node executes each pair against the JavaScript runtime.

For every generated case, the reference test checks the modeled result category (string, number/NaN, BigInt, boolean, or operand) or verifies a modeled TypeError. The expected matrix comes from `classify` in Zig, not from a second hand-maintained classification table.

The generated matrix uses one representative value per primitive kind. A second suite, `tests/concrete-semantic-reference.test.mjs`, checks value partitions against the actual JavaScript runtime and compares concrete results with `Object.is` (with an explicit NaN check). It includes numeric and invalid strings, empty strings, null/undefined coercion, zero and negative zero, NaN, infinities, BigInt zero division/remainder, negative BigInt exponent, mixed BigInt/Number errors, Symbol conversion, logical operand identity, and equality coercion.

These are focused differential regression tests, not exhaustive ECMAScript conformance. The concrete suite currently contains 23 hand-authored boundary scenarios; the next improvement is to derive scenario definitions from the Zig semantic-case source so the expected cases have a single source of truth.

Run locally:
1. `zig build test`
2. `zig run src/export_operator_matrix.zig`
3. `node --test tests/operator-reference.test.mjs`
4. `node --test tests/concrete-semantic-reference.test.mjs`
