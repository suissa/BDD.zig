# Entity-Driven Testing (EDT)

## Purpose

Entity-Driven Testing is a second specification style for BDD.zig. It complements Gherkin instead of replacing it.

- Use Gherkin for business workflows and narrative scenarios.
- Use EDT to specify domain entities, properties, and their observable behaviors in focused, composable layers.

The specification should be readable documentation and eventually executable by the same Zig test runner.

## Canonical syntax (Layer 1)

```text
Entity: Person

  Property: CPF

    Behavior: validate
      Input cpf = 04864713901
      Run validate(cpf)
      Expect isTruth

    Behavior: reject invalid CPF
      Input cpf = 04864713900
      Run validate(cpf)
      Expect isFalsy
```

### Keywords

| Keyword | Meaning |
|---|---|
| `Entity` | Domain type or aggregate being specified. |
| `Property` | Domain property or aspect whose behaviors are grouped together. It need not map to a public struct field. |
| `Behavior` | One independently executable example of expected behavior. |
| `Input` | Named input value available to the behavior. |
| `Run` | Invokes an operation with the declared inputs. |
| `Expect` | Applies a matcher to the result of the most recent `Run`, unless a result is explicitly named. |

Indentation expresses containment: Entity contains Properties; Property contains Behaviors; Behavior contains Input declarations, one Run, and one or more Expect statements.

## Execution semantics

1. Each Behavior is an isolated test case.
2. Inputs are scoped to their Behavior and cannot leak into another Behavior.
3. Run resolves an operation against the Zig type bound to the Entity and invokes it using the named inputs.
4. Expect checks the Run result; it must not silently call the operation again.
5. A missing input, unknown operation, duplicate input, invalid nesting, or unsupported matcher is a specification error.
6. The parser should report the source file and line for syntax/semantic errors.
7. Failed expectations should identify Entity, Property, Behavior, matcher, actual value when printable, and expected value when applicable.
8. Parsing and structural/semantic validation should happen at comptime where Zig permits it. Operation execution remains subject to the function's Zig semantics and the test runner.

### Important CPF example note

The CPF values above are illustrative fixtures. The first value must not be treated as a verified valid CPF merely because it is used in an example. The implementation tests should use independently verified valid and invalid fixtures, and avoid logging real personal data.

## Layered roadmap

### Layer 1 — Structure and boolean results

Support `Entity`, `Property`, `Behavior`, `Input`, `Run`, and `Expect`, initially with `isTruth` and `isFalsy`.

Acceptance criteria:
- Parse a document containing multiple entities, properties, and behaviors.
- Validate indentation/nesting and required statements.
- Resolve each Run to a Zig operation.
- Execute each Behavior as an independent test.
- Return clear compile-time diagnostics for malformed specifications.
- Add unit tests for successful parsing, malformed nesting, unknown operations, missing inputs, and boolean matcher outcomes.

### Layer 2 — Equality and scalar matchers

Add `equals`, `notEquals`, `isZero`, `isPositive`, `isNegative`, `greaterThan`, `greaterOrEqual`, `lessThan`, and `lessOrEqual`, with type-safe comparisons.

### Layer 3 — Optional values, errors, and collections

Add matchers such as `isNull`, `isNotNull`, `isError`, `hasErrorName`, `contains`, `isEmpty`, and `hasLength` only where they are meaningful for the Zig type being tested.

### Layer 4 — State and behavior composition

Introduce explicit setup/state and multi-operation behaviors only after Layer 1 semantics are stable. Keep each behavior isolated by default; sharing state must be explicit.

### Layer 5 — Evidence and diagnostics

Expose structured results for each behavior, source locations, matcher details, and traceability back to the specification.

## Matcher design rules

- Matchers are a named, documented catalog, not arbitrary executable text.
- A matcher receives the value produced by Run and returns a pass/fail result or a typed diagnostic.
- Matchers must respect Zig types; do not coerce unrelated types silently.
- Keep matcher names stable and allow the catalog to grow without changing the grammar of existing specifications.
- Prefer explicit names over implicit truthiness. `isTruth` and `isFalsy` should define precisely which result types they accept.

## Compatibility

EDT is additive. Existing `.feature` Gherkin files and their execution path must continue to work unchanged. Initially, `.edt` should be documented as a proposed specification format until parser and executor support are implemented and tested.

## Initial scope decision

The first implementation should deliver only Layer 1. Avoid implementing every matcher or state-composition feature before the parser, name resolution, result semantics, and diagnostics have tests.
