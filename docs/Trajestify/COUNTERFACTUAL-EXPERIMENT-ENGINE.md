# Counterfactual experiment engine

The experiment engine runs a single baseline trajectory and evaluates multiple declared interventions against independent clones of the same initial context.

## API

`runCounterfactualExperiment(definition, initialContext, interventions, options)` returns:

- `experimentId` and `baseline`: one shared baseline artifact.
- `replays`: one evaluator-compatible pair per intervention, each with a unique replay ID and counterfactual run ID.
- `causalClaim: false`: an explicit marker that the experiment does not establish causality.

Provide `counterfactualRunIds` as a map from each intervention ID to a unique run ID. IDs, targets, descriptions and run IDs are validated before any trajectory or intervention executes. Interventions run sequentially, each on a fresh clone of the original context; one intervention cannot contaminate another.

## Evaluation

Pass the returned `replays` array directly to `evaluateCounterfactualReplay({ replays })`. The evaluator reports resolved, persistent and shifted divergences per intervention and aggregate counts. These are descriptive observations, not causal estimates or statistical confidence.

## Isolation and safety

The engine clones in-memory state using `structuredClone` by default. Supply `cloneContext` for classes, functions, handles or other custom state. It cannot roll back database writes, network requests, messages, filesystem changes or other side effects performed by clause handlers or interventions. Use deterministic fixtures, mocks or a disposable environment. A shared baseline reduces redundant execution but does not control for nondeterminism between sequential counterfactual runs; repeat experiments and capture external state when that matters.
