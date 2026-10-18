# Operator Interaction 2flow

The operator layer expands the primitive interaction model into a deterministic rule space.

```text
7 TypeScript/ECMAScript primitive kinds
  x 7 primitive kinds
  x 15 binary operators
  = 735 classified operator/type-pair cases
```

## Operators covered

`+`, `-`, `*`, `/`, `%`, `**`, `===`, `==`, `<`, `<=`, `>`, `>=`, `&&`, `||`, and `&`.

The classifier produces a result category (`number`, `bigint`, `string`, `boolean`, `operand`, `number_or_nan`, or `type_error`) and an outcome. It captures core cross-cutting rules: addition can concatenate, arithmetic converts numeric primitives, Symbols fail numeric conversion, and mixed BigInt/Number arithmetic throws TypeError.

## 2flow

```text
PrimitivePair
  -> Operator
  -> TypeInteractionRule
  -> ResultKind + Outcome + Rationale
  -> Value-class generation
  -> Executable behavior
  -> Evidence
```

This is a rule classifier, not an interpreter and not a substitute for the ECMAScript specification. A rule may describe a result category that depends on concrete values: for example, division by zero, invalid numeric strings, BigInt division by zero, negative BigInt exponentiation, and NaN comparisons. Those cases must be generated as value-level scenarios in the next stage.

Strict equality always returns a boolean and does not coerce operands. Loose equality also returns a boolean but follows abstract equality semantics. Logical operators return one of their operands rather than a boolean. These differences are deliberately represented as separate result kinds.

## Validation

The tests enumerate every primitive pair and operator and assert that the classifier returns a rule. Focused tests cover string concatenation, BigInt/Number incompatibility, Symbol failures, strict equality, and logical operand-return behavior.

## Known next step

Add concrete value partitions per primitive pair: ordinary values, boundary values, invalid numeric strings, `NaN`, infinities, signed zero, BigInt zero, and negative BigInt exponents. Then execute generated expressions in a JavaScript reference runtime and compare the observed result/exception with this model. Until that differential layer exists, rules are classified expectations, not fully verified ECMAScript conformance claims.
