# Concrete semantic cases

The primitive operator classifier describes a type-level rule space. This stage adds representative value partitions and executes them against the installed JavaScript runtime, so value-dependent behavior is not inferred from primitive types alone.

Partitions include ordinary values, empty and numeric strings, invalid numeric strings, zero, negative values, NaN, infinities, negative zero, positive and negative infinity, BigInt zero/negative values, truthy/falsy values, Symbol, null, and undefined.

Important distinctions:
- Number division by zero yields Infinity or NaN; BigInt division by zero throws RangeError.
- BigInt exponentiation with a negative exponent throws RangeError.
- Mixed BigInt/Number arithmetic and Symbol numeric operations throw TypeError.
- Logical AND and OR return operands, not normalized booleans.
- NaN makes relational comparisons false and is falsy for logical operators.
- Adding opposite infinities produces NaN; strict equality treats positive and negative zero as equal.
- Differential failures include the scenario name, operand partitions, operator, and classifier prediction to make regressions reproducible.
- A type-pair classifier is not a substitute for concrete execution. These cases are a representative regression corpus, not exhaustive ECMAScript conformance.

Run: zig build test and node --test tests/operator-reference.test.mjs

Reference: ECMAScript language expressions, https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html
