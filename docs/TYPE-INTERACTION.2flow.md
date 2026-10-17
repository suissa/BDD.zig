# Type Interaction 2flow

This layer formalizes the semantic gap between a primitive type and its use as another type.

```text
Primitive A
  -> Relation
  -> Operation
  -> Primitive B
  -> Outcome
  -> Evidence
```

Relations are intentionally distinct:

- `assign`: static assignability.
- `coerce`: implicit language conversion performed by an operation.
- `convert`: explicit conversion such as `Number(value)`.
- `cast`: a type assertion/cast without assuming runtime conversion.
- `compare`: equality or ordering interaction.
- `operate`: arithmetic, concatenation, logical or other operator interaction.
- `call`: interaction as a callable value.

The matrix must not invent semantics. ECMAScript defines abstract conversion operations such as `ToPrimitive`, `ToBoolean`, `ToNumeric` and `ToNumber`; the matrix records the relevant result as executable test data. For example, `ToNumber(Symbol)` throws `TypeError`, `ToNumber(undefined)` returns `NaN`, and `ToNumber(null)` returns `+0`.

## AST.2flow enrichment

```text
TS Primitive
    |
    v
TypeInteractionRule
    |
    +-- source
    +-- relation
    +-- target
    +-- operation
    +-- outcome
    +-- result
    |
    v
SemanticProperty
    |
    +-- variants
    +-- constraints
    +-- laws
    +-- behaviors
    |
    v
Generated BDD cases
```

The current implementation deliberately starts with representative conversion rules. The next expansion should add operation-specific coercion rules (`+`, `-`, `*`, `/`, comparisons, logical operators) and then derive valid/invalid/boundary values from those rules.
