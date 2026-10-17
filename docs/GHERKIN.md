# Gherkin support

`BDD.zig` is a compile-time BDD runner for Zig. A `.feature` file is embedded with `@embedFile`, parsed by `comptime`, converted into semantic steps, and executed against a Zig context.

## Supported keywords

The current executable grammar recognizes:

- `Feature`
- `Rule`
- `Scenario`
- `Example` (alias of `Scenario`)
- `Background` at Feature and Rule scope
- `Scenario Outline`
- `Scenario Template` (alias of `Scenario Outline`)
- `Examples`
- `Scenarios` (alias of `Examples`)
- `Given`, `When`, `Then`
- `And`, `But`, `*` as semantic continuations

The parser supports one `Feature` per file and reports structural errors at compile time.

## Minimal example

```gherkin
Feature: Bank account

Scenario: Deposit money
  Given saldo = 100
  When depositar(50)
  Then saldo == 150
```

See [`examples/basic.feature`](../examples/basic.feature).

## Rule and Background

Feature-level background runs before every scenario. A Rule can add its own background, which runs after the Feature background.

```gherkin
Feature: Transfers

Background:
  Given saldo = 100

Rule: Normal transfers
  Background:
    Given limite = 50

  Scenario: Transfer
    When transferir(30)
    Then saldo == 70
```

See [`examples/rules-and-background.feature`](../examples/rules-and-background.feature).

## Scenario Outline

Rows in `Examples` create independent scenario executions. Placeholders use `<name>` and are replaced in scenario titles, step text, doc strings, and step data-table cells.

```gherkin
Scenario Outline: Transfer <valor>
  Given saldo = <saldo> and limite = <limite>
  When transferir(<valor>)
  Then saldo == <saldo_final>

Examples:
  | saldo | limite | valor | saldo_final |
  | 100   | 50     | 30    | 70          |
```

`Scenario Template` and `Scenarios` provide the corresponding aliases.

See [`examples/scenario-outline.feature`](../examples/scenario-outline.feature).

## Step semantics

`Given` assignments map to context fields. Both forms below are accepted:

```gherkin
Given saldo = 100
Given saldo 100
```

Two fields can be assigned in one step with `and`:

```gherkin
Given saldo = 100 and limite = 50
```

`When` resolves a method on the context:

```gherkin
When transferir(30)
When depositar 10
```

`Then` can assert a field with either syntax:

```gherkin
Then saldo == 70
Then saldo expect 70
```

Expected Zig errors are also executable assertions:

```gherkin
When transferir(200)
Then error SaldoInsuficiente
```

or:

```gherkin
Then expect error ValorInvalido
```

## And, But and asterisk

`And`, `But`, and `*` retain their displayed keyword but inherit the semantic keyword of the previous primary step.

```gherkin
Given saldo = 100
And limite = 50
But audit = 0

When depositar(10)
* transferir(5)

Then saldo == 105
And audit == 2
```

A continuation without a preceding `Given`, `When`, or `Then` is a compile-time error.

## Doc strings and data tables

A step can carry a doc string and a data table. The payload is available to a context action receiving `StepPayload`.

```gherkin
When registrar(1)
  """
  {
    "evento": "transferencia"
  }
  """
  | nome | valor |
  | Joao | 30    |
```

See [`examples/gherkin-complete.feature`](../examples/gherkin-complete.feature).

## Compile-time behavior

Parsing is performed by Zig's compile-time evaluator:

```zig
const feature_text = @embedFile("examples/basic.feature");
const compiled_steps = comptime parseFeature(feature_text);
try runBDD(ContaBancaria, compiled_steps);
```

Malformed structures such as a missing Feature, an invalid continuation, an Outline without Examples/Scenarios, an unknown placeholder, or mismatched Example columns are rejected during compilation.

## Examples and tests

The repository contains focused feature examples:

| File | Coverage |
|---|---|
| [`examples/basic.feature`](../examples/basic.feature) | Feature, Scenario, Given, When, Then, And |
| [`examples/rules-and-background.feature`](../examples/rules-and-background.feature) | Rule, Feature/Rule Background, Example, But |
| [`examples/scenario-outline.feature`](../examples/scenario-outline.feature) | Scenario Outline, Examples, Scenario Template, Scenarios |
| [`examples/gherkin-complete.feature`](../examples/gherkin-complete.feature) | aliases, `*`, errors, doc strings and tables |
| [`testes.feature`](../testes.feature) | complete executable regression specification |

Run the existing executable tests with:

```bash
zig build test
```

Run the demonstration with:

```bash
zig build run
```

The example `.feature` files are intentionally readable and can be used as regression fixtures when the parser evolves.

## Scope

This project does not attempt to implement every part of the full Cucumber/Gherkin ecosystem. It implements a deterministic executable subset designed around Zig types, compile-time validation, and direct method/field bindings.

The supported syntax should therefore be treated as the `BDD.zig` executable grammar, while the official Gherkin language remains the reference for the broader language semantics.
