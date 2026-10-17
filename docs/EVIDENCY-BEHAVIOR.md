# Evidency Behavior

## Goal

An `Evidency Behavior` is a declarative test whose purpose is to produce evidence
that a system meets an observable operational property. The initial examples focus
on API performance and resilience. This is an additive proposal; it does not change
the existing Gherkin runner or claim that the current EDT parser executes this syntax.

## Canonical shape

```text
Evidency Behavior: Stress API

  Background:
    configs

  Given payload = X
  And increase_data = 10Mb
  And increase_time = 10s
  And duration = 2m
  I Expect isLive
```

- `Background: configs` resolves a named environment/profile containing the target
  URL, authentication, headers, TLS options, timeout, and safe test limits.
- `Given` declares the initial payload or principal test input.
- `And` declares typed workload parameters. Durations and sizes must be parsed as
  units, not untyped strings.
- `I Expect` states the evidence predicate that must hold after or during the run.
- `X` is a fixture placeholder, not a real payload. It must resolve from a local
  fixture or a secret-safe reference before execution.

## API evidence types

| Type | Primary purpose | Required evidence |
|---|---|---|
| Stress | Push beyond normal load to locate failure limits | Error rate, latency, saturation, and whether the service remains responsive |
| Load | Validate expected traffic | Throughput, latency percentiles, error rate |
| Spike | Validate abrupt traffic changes | Degradation and recovery time |
| Soak | Detect degradation under sustained traffic | Memory/resource trend, error rate, latency drift |
| Capacity | Find the sustainable operating limit | Maximum sustainable throughput/users under SLO thresholds |
| Volume | Validate large request/data volume | Completion rate, processing correctness, resource usage |
| Endurance | Check prolonged operation | Leaks, resource growth, and error/latency drift |
| Availability | Verify an availability SLO | Successful checks divided by total checks over a defined window |
| Resilience | Verify behavior during a fault | Fault containment, degraded behavior, recovery time |
| Recovery | Verify restoration after failure/restart | Time to readiness and correctness after recovery |
| Concurrency | Detect races and concurrent request failures | Correctness, conflicts, duplicate effects, and error rate |

## Semantics and safety

1. Every behavior is an isolated test and produces a structured evidence record.
2. `Background` must resolve to a named, validated configuration. The test runner must
   not infer production credentials or silently target a production service.
3. Load, stress, spike, soak, volume, and endurance tests can cause real load. Require
   an explicit target allowlist and configured ceilings for rate, duration, payload,
   concurrency, and total requests.
4. A run must stop when its hard safety limits are reached. The limit itself is not a
   pass/fail SLO; it is a guardrail.
5. `isLive` alone is too weak for most performance tests. The evidence should include
   latency percentiles, throughput, error rate, and resource metrics; each test should
   assert thresholds appropriate to its purpose.
6. Percentage values must be represented as ratios with explicit units. The runner must
   define how availability and error rates are calculated, including the observation
   window and treatment of timeouts.
7. A test must not claim `resourceLeak = false` or `noRaceConditions` without an
   observation strategy and sufficient evidence. These are predicates to verify, not
   facts implied by a successful HTTP response.
8. Evidence records should include test ID, target alias, start/end time, workload
   parameters, sample count, outcome, threshold violations, and a reproducible
   configuration fingerprint. Do not log secrets or sensitive payloads.

## Execution model

```text
EDT source
   -> parse typed parameters and predicates
   -> resolve Background profile
   -> validate target allowlist and safety budgets
   -> execute workload
   -> collect measurements
   -> evaluate I Expect predicates
   -> emit evidence + diagnostics
```

## Initial implementation boundary

The files in `examples/evidence-api.edt` are specifications and test fixtures for the
proposed DSL, not executable tests yet. Implementing this feature requires parser/AST
nodes for `Evidency Behavior`, `Background`, typed quantities, and `I Expect`, plus
an executor adapter for the selected load-generation engine. The native Zig BDD runner
and Lightpanda Playwright adapter remain separate until this DSL has a defined runtime.
