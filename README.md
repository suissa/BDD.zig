<div align="center">
<h1>🔥BDD Gherkin.zig</h1>
</div>


A minimal BDD/Gherkin framework for Zig that turns `.feature` specifications into executable, compile-time-validated test scenarios.

`BDD-Gherkin.zig` uses Zig's `@embedFile` and `comptime` evaluation to parse a Gherkin feature file during compilation and transform it into executable steps that run against a Zig struct.

The result is a small bridge between a human-readable specification and executable Zig code:

```text
.feature file
     │
     ▼
 @embedFile
     │
     ▼
 Gherkin parser
     │
     ▼
 comptime AST / steps
     │
     ▼
 semantic step compilation
     │
     ▼
 Zig struct execution
     │
     ▼
 assertions / errors
```

The implementation currently lives in a single Zig source file and provides both the parser and executor. The parser and semantic compilation are performed at `comptime`, while the resulting steps are executed against a concrete Zig context at runtime. The implementation explicitly models `Feature`, `Rule`, `Scenario`, and `Step`, as well as semantic step actions such as `SetFields`, `CallAction`, `ExpectField`, and `ExpectError`.

## What is BDD?

Behavior-Driven Development (BDD) is a software development approach in which system behavior is described from the perspective of observable behavior rather than implementation details.

Instead of starting with:

```zig
expect(account.saldo).toBe(70);
```

BDD starts with a behavioral specification:

```gherkin
Given saldo = 100
When transferir(30)
Then saldo == 70
```

The important distinction is that the specification describes what the system should do.

BDD therefore creates a common language between:

* business requirements;
* developers;
* testers;
* executable specifications.

A BDD scenario normally follows the structure:

```text
Given  → initial context
When   → action
Then   → expected result
```

For example:

```gherkin
Feature: Bank account

Scenario: Transfer money

Given saldo = 100
When transferir(30)
Then saldo == 70
```

The scenario can be read as documentation, but it can also be executed as a test.

That second property is fundamental to this project.

## What is Gherkin?

Gherkin is the language commonly used to express BDD specifications.

A Gherkin document uses keywords such as:

```gherkin
Feature
Rule
Background
Scenario
Given
When
Then
And
But
```

The syntax is intentionally close to natural language.

For example:

```gherkin
Feature: Bank account

Background:
  Given saldo = 100
  And limite = 50

Scenario: Transfer within the balance

  When transferir(30)
  Then saldo == 70
```

Traditional Gherkin tooling usually parses this specification and maps each step to a separately registered step definition.

`BDD-Gherkin.zig` takes a different approach.

Instead of requiring a large external step-definition system, it maps a restricted executable subset of Gherkin directly to members and methods of a Zig struct.

## The Zig approach

The central idea is:

```text
Gherkin
   ↓
semantic representation
   ↓
Zig type
   ↓
execution
```

A Zig context can contain state:

```zig
const ContaBancaria = struct {
    saldo: i32 = 0,
    limite: i32 = 0,
    audit: i32 = 0,

    pub fn init() ContaBancaria {
        return .{};
    }

    pub fn transferir(self: *ContaBancaria, valor: i32) !void {
        if (valor <= 0) return error.ValorInvalido;
        if (valor > self.saldo + self.limite)
            return error.SaldoInsuficiente;

        self.saldo -= valor;
        self.audit += 1;
    }

    pub fn depositar(self: *ContaBancaria, valor: i32) !void {
        if (valor <= 0) return error.ValorInvalido;

        self.saldo += valor;
        self.audit += 1;
    }
};
```

The Gherkin specification can then operate over that type:

```gherkin
Feature: Bank account

Scenario: Transfer money

Given saldo = 100
When transferir(30)
Then saldo == 70
```

The framework resolves:

```text
saldo
  ↓
ContaBancaria.saldo

transferir
  ↓
ContaBancaria.transferir()

saldo == 70
  ↓
assert ContaBancaria.saldo == 70
```

This makes the `.feature` file an executable specification of the behavior of the Zig type.

## Compile-time parsing

The feature file is embedded directly into the Zig binary:

```zig
const feature_text = @embedFile("testes.feature");
```

The parser is then invoked during compilation:

```zig
const compiled_steps = comptime parseFeature(feature_text);
```

This is an important architectural property.

The `.feature` file is not parsed for the first time when the test starts executing. Its structure is processed by Zig's compile-time evaluator.

Conceptually:

```text
testes.feature
      │
      │ @embedFile
      ▼
compile time
      │
      ├── lexical recognition
      ├── keyword recognition
      ├── structure validation
      ├── semantic step parsing
      └── scenario expansion
      │
      ▼
compiled representation
      │
      ▼
runtime execution
```

The parser uses compile-time errors for invalid Gherkin structures. For example, invalid placement of primary keywords or malformed `Examples` tables can produce a `@compileError` with the corresponding feature-file line number.

This means some specification errors become compilation errors rather than runtime test failures.

## Supported Gherkin keywords

The current implementation supports:

```text
Feature
Rule
Background
Scenario
Example
Scenario Outline
Scenario Template
Examples
Scenarios
Given
When
Then
And
But
*
```

The aliases are intentionally supported:

```text
Example            → Scenario
Scenario Template  → Scenario Outline
Scenarios          → Examples
```

The parser therefore accepts:

```gherkin
Example: Transfer money
```

as well as:

```gherkin
Scenario: Transfer money
```

Likewise:

```gherkin
Scenario Template: Transfer money
```

is equivalent to:

```gherkin
Scenario Outline: Transfer money
```

and:

```gherkin
Scenarios:
```

is treated as:

```gherkin
Examples:
```

## Feature

A feature is the top-level specification.

Exactly one `Feature` is supported per file.

Example:

```gherkin
Feature: Bank account
```

The `Feature` must be the first primary keyword in the file.

A second `Feature` produces a compile-time parsing error.

The feature itself is represented internally as a `Feature` node.

## Rule

`Rule` creates a logical scope inside the feature.

Example:

```gherkin
Feature: Bank account

Rule: Transfers

Scenario: Transfer money
  Given saldo = 100
  When transferir(30)
  Then saldo == 70
```

Each rule has its own local `Background`.

When a new `Rule` is encountered, the local rule background is reset.

The execution order becomes:

```text
Feature Background
        ↓
Rule Background
        ↓
Scenario
```

For scenarios outside a rule:

```text
Feature Background
        ↓
Scenario
```

## Background

A `Background` defines steps shared by scenarios.

Feature-level background:

```gherkin
Feature: Bank account

Background:
  Given saldo = 100
  And limite = 50

Scenario: Transfer money
  When transferir(30)
  Then saldo == 70
```

The background is executed before every scenario.

A rule can also define a local background:

```gherkin
Feature: Bank account

Background:
  Given saldo = 100

Rule: Transfers

Background:
  And limite = 50

Scenario: Transfer money
  When transferir(30)
  Then saldo == 70
```

The resulting execution sequence is:

```text
Given saldo = 100
And limite = 50
When transferir(30)
Then saldo == 70
```

## Scenario and Example

A normal scenario executes once.

```gherkin
Scenario: Deposit money
  Given saldo = 100
  When depositar(50)
  Then saldo == 150
```

`Example` is supported as an alias:

```gherkin
Example: Deposit money
  Given saldo = 100
  When depositar(50)
  Then saldo == 150
```

Internally, both are represented as ordinary scenarios.

## Scenario Outline

A `Scenario Outline` describes a parameterized scenario.

Example:

```gherkin
Scenario Outline: Transfer money

  Given saldo = <saldo>
  When transferir(<valor>)
  Then saldo == <resultado>

Examples:
  | saldo | valor | resultado |
  | 100   | 30    | 70        |
  | 200   | 50    | 150       |
```

Each row generates a separate execution.

Conceptually:

```text
Scenario Outline
       │
       ├── Example row 1
       │      ↓
       │   Scenario instance
       │
       └── Example row 2
              ↓
           Scenario instance
```

Placeholders are written using:

```text
<name>
```

The parser replaces them with the corresponding value from the `Examples` header.

The same mechanism is applied to both scenario names and step text.

## Scenario Template

`Scenario Template` is supported as an alias for `Scenario Outline`.

```gherkin
Scenario Template: Transfer money

  Given saldo = <saldo>
  When transferir(<valor>)
  Then saldo == <resultado>

Scenarios:
  | saldo | valor | resultado |
  | 100   | 30    | 70        |
```

This is equivalent to using:

```gherkin
Scenario Outline
```

with:

```gherkin
Examples
```

## And, But and *

Gherkin allows `And`, `But`, and `*` to continue the semantic meaning of the previous step.

For example:

```gherkin
Given saldo = 100
And limite = 50
```

means:

```text
Given
Given
```

semantically.

Likewise:

```gherkin
When transferir(30)
And depositar(10)
```

means:

```text
When
When
```

and:

```gherkin
Then saldo == 80
And limite == 50
```

means:

```text
Then
Then
```

The implementation preserves both concepts:

```text
semantic_keyword
shown_keyword
```

Therefore:

```gherkin
And limite = 50
```

can retain `And` as the displayed keyword while internally behaving as `Given`.

The same mechanism applies to `But` and `*`.

Using `And`, `But`, or `*` without a previous `Given`, `When`, or `Then` is rejected during parsing.

## Executable bindings

The framework intentionally supports a small executable grammar instead of attempting to implement every possible Gherkin sentence.

This keeps the execution model deterministic.

### Given

Assignments are supported.

```gherkin
Given saldo = 100
```

Multiple fields can be assigned:

```gherkin
Given saldo = 100 and limite = 50
```

The implementation also accepts the equivalent field/value form:

```gherkin
Given saldo 100
```

The resulting semantic action is:

```text
SetFields
```

The executor then writes directly to the corresponding fields of the context.

Conceptually:

```text
Given saldo = 100
        │
        ▼
SetFields
        │
        ▼
ctx.saldo = 100
```

### When

Actions can be expressed using function-call syntax:

```gherkin
When transferir(30)
```

or whitespace syntax:

```gherkin
When transferir 30
```

The action name is resolved against the Zig context.

For example:

```gherkin
When depositar(10)
```

is resolved to:

```zig
ContaBancaria.depositar
```

and invoked against the current context.

The resulting semantic action is:

```text
CallAction
```

The implementation also supports the explicit form:

```gherkin
When for action transferir with args 30
```

This is useful when a specification needs to make the semantic role of the sentence explicit.

### Then

Field assertions can be expressed as:

```gherkin
Then saldo == 70
```

or:

```gherkin
Then saldo expect 70
```

Both represent:

```text
ExpectField
```

The executor obtains the field from the context and verifies the expected value.

Conceptually:

```text
Then saldo == 70
        │
        ▼
ExpectField
        │
        ▼
ctx.saldo == 70
```

The explicit form is also supported:

```gherkin
Then for field saldo == 70
```

## Error expectations

The framework can validate expected Zig errors.

For example:

```gherkin
When transferir(200)
Then error SaldoInsuficiente
```

or:

```gherkin
Then expect error ValorInvalido
```

These are represented as:

```text
ExpectError
```

The executor captures the error returned by the previous action and compares it with the expected error member of Zig's `anyerror` set.

If an error was expected but the previous action did not produce one, execution fails.

If the returned error differs from the expected error, the assertion fails.

This makes error behavior part of the executable specification.

## Documentation steps

Not every Gherkin sentence needs to be executable.

A step that does not match one of the supported executable forms becomes:

```text
Doc
```

For example:

```gherkin
Given the customer has an active account
When the customer transfers money
Then the transfer should be accepted
```

If those sentences do not match the supported binding grammar, they are preserved as documentation but do not modify the context.

This allows the feature file to remain readable without forcing every natural-language sentence to have an executable implementation.

The current executor therefore distinguishes between:

```text
Doc
SetFields
CallAction
ExpectField
ExpectError
```

rather than treating every Gherkin step as executable code.

## Internal semantic model

The implementation uses a small internal representation.

At the structural level:

```text
Feature
Rule
Scenario
Step
```

At the step level:

```text
Given
When
Then
```

are the semantic keywords.

The displayed keyword is stored separately, allowing:

```text
And
But
*
```

to remain visible while inheriting the semantics of the previous primary keyword.

Each executable step is classified into an action:

```text
Doc
SetFields
CallAction
ExpectField
ExpectError
```

This creates a separation between:

```text
Gherkin syntax
      ↓
semantic keyword
      ↓
executable action
```

That separation is important because the textual keyword does not necessarily determine the final executable behavior.

For example:

```gherkin
And saldo = 100
```

has:

```text
shown_keyword    = And
semantic_keyword = Given
action           = SetFields
```

## Runtime executor

Once the feature has been parsed and semantically compiled, `runBDD` executes the resulting representation.

The executor creates a new context:

```zig
var ctx = Contexto.init();
```

Each scenario starts with a fresh context:

```zig
ctx = Contexto.init();
```

This provides scenario isolation.

The executor then processes the compiled steps sequentially.

Conceptually:

```text
Scenario
   │
   ├── Background
   │
   ├── Given
   │
   ├── When
   │
   └── Then
```

When a `When` action invokes a Zig method and receives an error, the error is stored so that a subsequent `Then error ...` step can validate it.

## Reflection and Zig types

The executor uses Zig's compile-time reflection facilities to map names from the feature file to members of the context type.

For field assignments:

```text
saldo
```

is resolved against the context.

For actions:

```text
transferir
```

is resolved as a member of the context type and invoked with the current context and argument.

This allows the feature file to remain independent from explicit registration tables.

The mapping is effectively:

```text
Gherkin identifier
        │
        ▼
Zig declaration
```

For example:

```gherkin
When transferir(30)
```

maps to:

```zig
ctx.transferir(30)
```

without requiring a separate:

```zig
register("transferir", ...)
```

step-definition registry.

## Complete example

### Zig context

```zig
const ContaBancaria = struct {
    saldo: i32 = 0,
    limite: i32 = 0,
    audit: i32 = 0,

    pub fn init() ContaBancaria {
        return .{};
    }

    pub fn transferir(self: *ContaBancaria, valor: i32) !void {
        if (valor <= 0) return error.ValorInvalido;
        if (valor > self.saldo + self.limite)
            return error.SaldoInsuficiente;

        self.saldo -= valor;
        self.audit += 1;
    }

    pub fn depositar(self: *ContaBancaria, valor: i32) !void {
        if (valor <= 0) return error.ValorInvalido;

        self.saldo += valor;
        self.audit += 1;
    }

    pub fn definirLimite(self: *ContaBancaria, valor: i32) !void {
        if (valor < 0) return error.ValorInvalido;

        self.limite = valor;
        self.audit += 1;
    }
};
```
### Gherkin


```gherkin
Feature: Bank account

Background:
  Given saldo = 100
  And limite = 50

Scenario: Transfer within the available balance
  When transferir(30)
  Then saldo == 70

Scenario: Deposit money
  When depositar(20)
  Then saldo == 120

Scenario: Transfer exceeding the available balance
  When transferir(200)
  Then error SaldoInsuficiente

Scenario Outline: Different transfers
  When transferir(<valor>)
  Then saldo == <resultado>

Examples:
  | valor | resultado |
  | 10    | 90        |
  | 20    | 80        |
  | 30    | 70        |
```

### Loading the feature

```zig
pub fn main() !void {
    const feature_text = @embedFile("testes.feature");

    const compiled_steps =
        comptime parseFeature(feature_text);

    try runBDD(ContaBancaria, compiled_steps);
}
```

The same execution can be used inside a Zig test:

```zig
test "Execute BDD Gherkin specification at comptime" {
    const feature_text = @embedFile("testes.feature");

    const compiled_steps =
        comptime parseFeature(feature_text);

    try runBDD(ContaBancaria, compiled_steps);
}
```

## Running

Run the Zig test suite with:

```bash
zig test main.zig
```

Or run the executable:

```bash
zig build run
```

The `.feature` file must be available to the Zig source through `@embedFile`.

For example:

```text
project/
├── main.zig
└── testes.feature
```

## Validation model

There are two distinct validation phases.

### Compile-time validation

The parser validates the structure of the Gherkin specification while compiling.

Examples include:

```text
Feature must exist
Feature must be first
Only one Feature is supported
Rule must have a title
Scenario must have a title
Scenario Outline must have Examples
Examples must belong to a Scenario Outline
And/But/* must have a previous semantic keyword
Malformed Examples rows are rejected
Unknown placeholders are rejected
```

Invalid specifications can therefore fail compilation with an error such as:

```text
Gherkin parse error at line 42: ...
```

### Runtime validation

After compilation, executable steps validate the behavior of the Zig context.

Examples:

```text
field == expected value
expected error was produced
expected error was not produced
```

This produces a two-level model:

```text
            Gherkin specification
                    │
             compile-time
               validation
                    │
                    ▼
           executable scenario
                    │
              runtime test
                    │
                    ▼
             behavior validation
```

## Why compile Gherkin with Zig?

The main advantage of this implementation is that the specification itself participates in the Zig compilation process.

A conventional architecture might look like:

```text
.feature
   ↓
Gherkin parser
   ↓
runtime representation
   ↓
step registry
   ↓
runtime dispatch
```

This implementation instead moves much of that work into `comptime`:

```text
.feature
   ↓
@embedFile
   ↓
comptime parser
   ↓
comptime semantic compilation
   ↓
typed Zig execution
```

This provides several useful properties:

* the feature file is embedded directly into the program;
* syntax errors can become compile-time errors;
* scenario outlines can be expanded during compilation;
* semantic step information is represented statically;
* the executor can use Zig's compile-time reflection;
* no external runtime Gherkin interpreter is required.

The framework is therefore not simply a Gherkin parser. It is an executable specification layer built around Zig's compile-time capabilities.

## Current scope

This project intentionally implements a small executable subset of Gherkin.

Supported:

```text
Feature
Rule
Background
Scenario
Example
Scenario Outline
Scenario Template
Examples
Scenarios
Given
When
Then
And
But
*
```

Executable operations currently include:

```text
field assignment
method invocation with an integer argument
field equality assertions
expected error assertions
```

Other Gherkin constructs are treated as documentation rather than being executed.

The implementation should therefore be understood as a minimal BDD runner rather than a complete implementation of the Gherkin language specification.

## Design philosophy

The project follows a simple principle:

> A behavior specification should be readable as documentation and executable as validation.

Gherkin provides the behavioral language.

Zig provides:

```text
compile-time evaluation
type information
reflection
static validation
low runtime overhead
```

`BDD-Gherkin.zig` connects the two.

The resulting model is:

```text
Human-readable behavior
          │
          ▼
       Gherkin
          │
          ▼
    Semantic parser
          │
          ▼
       comptime
          │
          ▼
     Zig context
          │
          ▼
     Executable behavior
          │
          ▼
       Assertions
```

The important boundary is that Gherkin remains the specification language while Zig remains the implementation and execution environment.

## Status

This is a minimal working BDD/Gherkin executor for Zig.

The included validation feature exercises the supported keyword set, including:

```text
Example
Scenario Template
Scenarios
And
But
*
```

as well as ordinary scenarios, backgrounds, rules, scenario outlines, executable `Given`/`When`/`Then` steps, field assertions, and expected errors.

The current implementation demonstrates that a `.feature` file can be embedded, parsed and semantically compiled at `comptime`, then executed against a concrete Zig struct.
