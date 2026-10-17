# Evidency Behavior

## Goal

An `Evidency Behavior` is a declarative test whose purpose is to produce evidence
that a system meets an observable operational property. The initial examples focus
on API performance and resilience. This is additive to the existing Gherkin runner. `src/edt.zig` parses the behavior/parameter/expectation subset and types common size, duration, and percentage values. `src/evidence.zig` contains an executable Zig workload/evidence engine with tests for all 11 categories. The parser is not yet connected to that engine, so `.edt` files do not run as end-to-end tests.

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

## Current Zig implementation

`src/evidence.zig` provides `Kind`, `Config`, `Request`, `Response`, `Transport`,
`Evidence`, and `run`. The transport is injected, so the workload and assertions can
be tested without sending traffic to an arbitrary endpoint. The current test suite
uses a deterministic in-process API fixture and covers all 11 categories plus budget
and error-threshold failures.

Run it with:

```sh
zig build test
```

Important boundary: these are executable tests of the workload/evidence engine, not
live endpoint tests. The current fixture does not open sockets; `.edt` files are not
parsed; `duration`, ramp-up, request-rate scheduling, percentile histograms, process
resource sampling, and race detection are not implemented. The concurrency scenario
currently validates a bounded batch of independent requests, not true parallel
execution. A network-backed transport must be added before tests can target a real API.

For live tests, require an explicit allowlisted base URL, a short timeout, a hard
request/payload/concurrency budget, and an opt-in flag. Never default to production.
The native Zig BDD runner and Lightpanda Playwright adapter remain separate.


## Parser implementation status

The current parser keeps source-backed slices, supports up to 16 behavior declarations and 24 parameters per behavior, and rejects malformed assignments or missing expectations. Recognized typed suffixes include `B`, `KB`, `MB`, `Mb`, `ms`, `s`, `m`, `h`, and `%`. Unknown values are retained as text rather than guessed as quantities. Parser tests use a fixture within the Zig package boundary; integration with the example file and execution pipeline remains future work.
