# AST.2flow — Semantic Atomic Property

The semantic layer starts from TypeScript primitive types and enriches each primitive into a first-class property definition.

```text
TypeScript AST
  -> Primitive extraction
  -> Type interaction matrix
  -> Semantic Atomic Property
  -> Variants
  -> Constraints
  -> Laws
  -> Invalid states
  -> Validation behaviors
  -> Evidence behaviors
  -> Executable tests
```

## Primitive universe

The initial canonical universe is:

`string | number | bigint | boolean | symbol | null | undefined`

Each primitive is represented independently in the AST. A domain property can then specialize one primitive without being owned by an entity.

Example:

```text
Property: CPF
  Primitive: string
  Variants: valid, empty, malformed, boundary, invalid
  Constraints:
    length = 11
  Laws:
    digitsOnly = true
  Behaviors:
    validate
    normalize
```

## Type interaction gap

A property is not defined only by its declared primitive. Its behavior when consumed as another type is also part of its semantic contract.

The AST therefore records interactions using:

`assign | coerce | convert | cast | compare | operate | call`

and classifies outcomes as:

`allowed | compile_error | runtime_value | runtime_error | nan | type_error`

The distinction between coercion, conversion and cast is intentional. They are different operations and must not be collapsed into one `cast` concept.

## Current matrix

The first executable matrix contains representative interactions for `string`, `number`, and `boolean`, including string-to-number coercion. The remaining primitive definitions are present and ready for expansion.

This is deliberately incremental: the AST is the contract surface; the `.2flow` is the transformation graph that expands it. We should not generate a huge Cartesian matrix until each relation has an explicit TypeScript semantic rule and executable evidence.

## Test generation

The intended next layer is deterministic generation:

```text
Primitive
  x
Variant
  x
Constraint
  x
Interaction
  x
Operation
  -> Behavior cases
  -> valid / invalid cases
  -> expected outcome
  -> evidence
```

This makes a property independently testable before it is attached to `Person`, `Customer`, `Invoice`, or another entity.
