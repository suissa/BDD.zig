# BDD regression tests

The executable regression suite is currently hosted by `main.zig`, because the parser and runner are intentionally local to the demonstration executable.

The test suite includes the repository's original `testes.feature` plus the focused fixtures under `examples/`.

Coverage:

- `examples/basic.feature`: Feature, Scenario, Given, When, Then and And.
- `examples/rules-and-background.feature`: Rule, Feature Background, Rule Background, Example and But.
- `examples/scenario-outline.feature`: Scenario Outline, Examples, Scenario Template and Scenarios.
- `examples/gherkin-complete.feature`: aliases, asterisk continuation, expected errors, Doc String and Data Table payloads.

The tests are compile-time parser tests as well as runtime execution tests: each fixture is loaded with `@embedFile`, passed through `comptime parseFeature`, and executed by `runBDD`.

Run all tests:

```bash
zig build test
```

Run only the demonstration executable:

```bash
zig build run
```

When the parser is extended, add a focused `.feature` fixture under `examples/` and a corresponding `test` block in `main.zig`. Keep the fixture small enough that a failure clearly identifies the Gherkin construct being tested.
