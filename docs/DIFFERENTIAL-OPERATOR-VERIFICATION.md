# Differential operator verification

The operator model is exported by Zig itself. CI serializes all 7 × 7 × 15 = 735 primitive/operator combinations to `tests/generated-operator-matrix.json`, then Node executes each pair against the JavaScript runtime.

For every generated operator case, the reference test checks the modeled result category or verifies a modeled `TypeError`.

Concrete value cases now have a single source of truth: `src/semantic_cases.zig`. The exporter `src/export_semantic_cases.zig` serializes those typed cases and expected values/errors to `tests/generated-semantic-cases.json`. The Node suite reads that generated manifest; the 29 scenarios are no longer duplicated in JavaScript. Partition names are resolved to concrete JavaScript values at execution time, and successful results are compared using `Object.is`, including a dedicated `NaN` check. Expected errors are checked by class.

Coverage includes numeric/invalid/empty strings, null and undefined coercion, zero and negative zero, NaN, infinity, BigInt division/remainder by zero, negative BigInt exponent, mixed BigInt/Number errors, Symbol conversion, logical operand selection, bitwise conversion, Boolean-to-Number coercion, lexical string comparison, and strict/loose equality (including null/undefined and BigInt type preservation).

This is focused differential regression coverage, not exhaustive ECMAScript conformance.

Run locally:
1. `zig build test`
2. `zig run src/export_operator_matrix.zig`
3. `node --test tests/operator-reference.test.mjs`
4. `zig run src/export_semantic_cases.zig`
5. `node --test tests/concrete-semantic-reference.test.mjs`
