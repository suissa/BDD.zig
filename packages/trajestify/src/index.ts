export type ClauseKind = "given" | "when" | "then" | "invariant";
export type StepStatus = "passed" | "failed" | "diverged" | "blocked" | "skipped" | "error";
export type DivergencePolicy = "continue" | "stop";
export type EvidenceKind = "inputs" | "outputs" | "state" | "errors" | "causal_links" | "timing" | "logs" | "attachments";

export interface SourceLocation { file?: string; line: number; column: number }
export interface IntentDefinition<C> {
  id: string;
  title: string;
  clauses: Clause<C>[];
  onDivergence: DivergencePolicy;
  trace: "full" | "minimal";
  evidence: EvidenceKind[];
}
export interface Clause<C> {
  id: string;
  kind: ClauseKind;
  text: string;
  execute: (context: C) => unknown | Promise<unknown>;
  source?: SourceLocation;
  expected?: unknown;
  dependsOn?: string[];
}
export interface AssertionObservation { readonly __trajestifyAssertion: true; readonly expected: unknown; readonly observed: unknown; readonly passed: boolean; }
export function expectValue(expected: unknown, observed: unknown): AssertionObservation {
  return { __trajestifyAssertion: true, expected, observed, passed: Object.is(expected, observed) };
}

export interface StepEvent {
  eventId: string;
  sequence: number;
  clauseId: string;
  kind: ClauseKind | "system";
  status: StepStatus;
  expected?: unknown;
  observed?: unknown;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  causedBy: string[];
  source?: SourceLocation;
  error?: { name: string; message: string };
}
export interface CausalPathNode { eventId: string; clauseId: string }
export interface TrajectoryDiagnostics {
  /** Candidate only: the first observed divergence is not proof of the underlying defect. */
  rootCause: null | { eventId: string; clauseId: string; confidence: "candidate"; basis: "first_divergence" };
  /** Ordered from the earliest reachable cause to the first divergent event. */
  causalPath: CausalPathNode[];
}

export interface TrajectoryArtifact {
  schemaVersion: 1;
  runId: string;
  intent: { id: string; title: string; status: "passed" | "diverged" | "failed" };
  trajectory: { id: string; status: "passed" | "diverged" | "failed" };
  startedAt: string;
  finishedAt: string;
  steps: StepEvent[];
  diagnostics: TrajectoryDiagnostics;
  firstDivergence: null | {
    eventId: string;
    sequence: number;
    category: "assertion_mismatch" | "execution_error";
    expected?: unknown;
    observed?: unknown;
    message: string;
  };
  summary: { passed: number; failed: number; diverged: number; blocked: number; skipped: number };
}

export function defineIntent<C>(
  id: string,
  title: string,
  clauses: Clause<C>[],
  options: { onDivergence?: DivergencePolicy; trace?: "full" | "minimal"; evidence?: EvidenceKind[] } = {},
): IntentDefinition<C> {
  if (!id.trim()) throw new Error("Intent id cannot be empty");
  if (!clauses.some(c => c.kind === "given")) throw new Error("Intent requires at least one Given clause");
  if (!clauses.some(c => c.kind === "when")) throw new Error("Intent requires at least one When clause");
  if (!clauses.some(c => c.kind === "then")) throw new Error("Intent requires at least one Then clause");
  const ids = new Set<string>();
  for (const clause of clauses) {
    if (ids.has(clause.id)) throw new Error(`Duplicate clause id: ${clause.id}`);
    ids.add(clause.id);
  }
  return {
    id,
    title,
    clauses,
    onDivergence: options.onDivergence ?? "continue",
    trace: options.trace ?? "full",
    evidence: options.evidence ?? ["inputs", "outputs", "state", "errors", "causal_links"],
  };
}

export function Given<C>(id: string, text: string, execute: Clause<C>["execute"], source?: SourceLocation): Clause<C> {
  return { id, kind: "given", text, execute, source };
}
export function When<C>(id: string, text: string, execute: Clause<C>["execute"], source?: SourceLocation): Clause<C> {
  return { id, kind: "when", text, execute, source };
}
export function Then<C>(id: string, text: string, execute: Clause<C>["execute"], source?: SourceLocation): Clause<C> {
  return { id, kind: "then", text, execute, source };
}
export function And<C>(kind: Exclude<ClauseKind, "invariant">, id: string, text: string, execute: Clause<C>["execute"], source?: SourceLocation): Clause<C> {
  return { id, kind, text, execute, source };
}

function safeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

export async function runTrajectory<C>(
  definition: IntentDefinition<C>,
  context: C,
  options: { runId?: string; now?: () => Date } = {},
): Promise<TrajectoryArtifact> {
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? `traj-${Date.now().toString(36)}`;
  const started = now();
  const steps: StepEvent[] = [];
  let firstDivergence: TrajectoryArtifact["firstDivergence"] = null;
  let stopped = false;

  for (const clause of definition.clauses) {
    const start = now();
    let status: StepStatus = "passed";
    let observed: unknown;
    let expected: unknown;
    let errorEvidence: StepEvent["error"];
    if (stopped) {
      status = "blocked";
    } else {
      try {
        const result = await clause.execute(context);
        if (typeof result === "object" && result !== null && "__trajestifyAssertion" in result && result.__trajestifyAssertion === true) {
          const assertion = result as AssertionObservation;
          expected = assertion.expected;
          observed = assertion.observed;
          if (!assertion.passed && (clause.kind === "then" || clause.kind === "invariant")) status = "diverged";
        } else {
          observed = result;
          // Returning false from Then is supported as a minimal assertion, but expectValue preserves diagnostic values.
          if (observed === false && (clause.kind === "then" || clause.kind === "invariant")) status = "diverged";
        }
      } catch (error) {
        status = "failed";
        errorEvidence = safeError(error);
      }
    }
    const finish = now();
    const eventId = `${runId}:evt:${steps.length + 1}`;
    const event: StepEvent = {
      eventId,
      sequence: steps.length + 1,
      clauseId: clause.id,
      kind: clause.kind,
      status,
      ...(expected !== undefined ? { expected } : clause.expected !== undefined ? { expected: clause.expected } : {}),
      ...(observed !== undefined ? { observed } : {}),
      startedAt: start.toISOString(),
      finishedAt: finish.toISOString(),
      durationMs: Math.max(0, finish.getTime() - start.getTime()),
      causedBy: steps.length ? [steps[steps.length - 1]!.eventId] : [],
      ...(clause.source ? { source: clause.source } : {}),
      ...(errorEvidence ? { error: errorEvidence } : {}),
    };
    steps.push(event);
    if ((status === "diverged" || status === "failed") && firstDivergence === null) {
      firstDivergence = {
        eventId,
        sequence: event.sequence,
        category: status === "diverged" ? "assertion_mismatch" : "execution_error",
        ...(expected !== undefined ? { expected } : {}),
        ...(observed !== undefined ? { observed } : {}),
        message: status === "diverged" ? `Expectation diverged: ${clause.text}` : errorEvidence?.message ?? "Step execution failed",
      };
      if (definition.onDivergence === "stop") stopped = true;
    }
  }

  const summary = {
    passed: steps.filter(s => s.status === "passed").length,
    failed: steps.filter(s => s.status === "failed" || s.status === "error").length,
    diverged: steps.filter(s => s.status === "diverged").length,
    blocked: steps.filter(s => s.status === "blocked").length,
    skipped: steps.filter(s => s.status === "skipped").length,
  };
  const status = summary.failed > 0 ? "failed" : summary.diverged > 0 ? "diverged" : "passed";
  const finished = now();
  return {
    schemaVersion: 1,
    runId,
    intent: { id: definition.id, title: definition.title, status },
    trajectory: { id: definition.id, status },
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    steps,
    firstDivergence,
    diagnostics: buildDiagnostics(steps, firstDivergence),
    summary,
  };
}

function buildDiagnostics(steps: StepEvent[], firstDivergence: TrajectoryArtifact["firstDivergence"]): TrajectoryDiagnostics {
  if (!firstDivergence) return { rootCause: null, causalPath: [] };

  const byId = new Map(steps.map(step => [step.eventId, step]));
  const reversePath: CausalPathNode[] = [];
  const visited = new Set<string>();
  let current: StepEvent | undefined = byId.get(firstDivergence.eventId);

  while (current && !visited.has(current.eventId)) {
    visited.add(current.eventId);
    reversePath.push({ eventId: current.eventId, clauseId: current.clauseId });
    // The artifact validator rejects unknown/future links; runtime diagnostics remain defensive.
    current = current.causedBy.map(id => byId.get(id)).find((step): step is StepEvent => Boolean(step));
  }

  reversePath.reverse();
  const divergentStep = byId.get(firstDivergence.eventId);
  return {
    rootCause: divergentStep
      ? { eventId: divergentStep.eventId, clauseId: divergentStep.clauseId, confidence: "candidate", basis: "first_divergence" }
      : null,
    causalPath: reversePath,
  };
}

export type RootCauseHypothesisRule = "assertion_mismatch" | "execution_error" | "upstream_state_candidate" | "historical_recurrence";
export interface RootCauseHypothesis {
  id: string;
  rule: RootCauseHypothesisRule;
  eventId: string;
  clauseId: string;
  confidence: "low" | "medium";
  rationale: string;
  evidenceEventIds: string[];
}

/**
 * Derives explainable hypotheses from one artifact. These are leads for investigation,
 * not proof of causality; no historical or external evidence is inferred.
 */
export function inferRootCauseHypotheses(artifact: TrajectoryArtifact, history: readonly TrajectoryArtifact[] = []): RootCauseHypothesis[] {
  const divergence = artifact.firstDivergence;
  if (!divergence) return [];
  const step = artifact.steps.find(candidate => candidate.eventId === divergence.eventId);
  if (!step) return [];

  const evidenceEventIds = [step.eventId];
  const hypotheses: RootCauseHypothesis[] = [];
  if (divergence.category === "assertion_mismatch") {
    hypotheses.push({
      id: `hypothesis:${step.clauseId}:assertion-mismatch`,
      rule: "assertion_mismatch",
      eventId: step.eventId,
      clauseId: step.clauseId,
      confidence: "medium",
      rationale: "The observed value did not satisfy the recorded expectation.",
      evidenceEventIds: [...evidenceEventIds],
    });
  } else {
    hypotheses.push({
      id: `hypothesis:${step.clauseId}:execution-error`,
      rule: "execution_error",
      eventId: step.eventId,
      clauseId: step.clauseId,
      confidence: "medium",
      rationale: step.error?.message ?? divergence.message,
      evidenceEventIds: [...evidenceEventIds],
    });
  }

  const causalPath = artifact.diagnostics.causalPath;
  if (causalPath.length > 1) {
    const predecessor = causalPath[causalPath.length - 2]!;
    const predecessorStep = artifact.steps.find(candidate => candidate.eventId === predecessor.eventId);
    if (predecessorStep && predecessorStep.status !== "passed") {
      hypotheses.push({
        id: `hypothesis:${predecessorStep.clauseId}:upstream-state`,
        rule: "upstream_state_candidate",
        eventId: predecessorStep.eventId,
        clauseId: predecessorStep.clauseId,
        confidence: "low",
        rationale: "A non-passing event immediately precedes the first divergence on the recorded causal path.",
        evidenceEventIds: [predecessorStep.eventId, step.eventId],
      });
    }
  }
  const currentStartedAt = Date.parse(artifact.startedAt);
  const comparableHistory = history.filter(previous =>
    previous.trajectory.id === artifact.trajectory.id &&
    previous.runId !== artifact.runId &&
    Number.isFinite(Date.parse(previous.finishedAt)) &&
    Number.isFinite(currentStartedAt) &&
    Date.parse(previous.finishedAt) <= currentStartedAt
  );
  const recurring = comparableHistory.flatMap(previous => {
    const priorStep = previous.steps.find(candidate =>
      candidate.clauseId === step.clauseId &&
      (candidate.status === "diverged" || candidate.status === "failed" || candidate.status === "error")
    );
    return priorStep ? [{ artifact: previous, step: priorStep }] : [];
  });
  if (recurring.length > 0) {
    const evidenceEventIds = [step.eventId, ...recurring.map(item => item.step.eventId)];
    hypotheses.push({
      id: `hypothesis:${step.clauseId}:historical-recurrence`,
      rule: "historical_recurrence",
      eventId: step.eventId,
      clauseId: step.clauseId,
      confidence: recurring.length >= 2 ? "medium" : "low",
      rationale: `The same clause failed or diverged in ${recurring.length} of ${comparableHistory.length} eligible earlier run(s) of this trajectory.`,
      evidenceEventIds,
    });
  }
  return hypotheses;
}

export interface ScoredRootCauseHypothesis extends RootCauseHypothesis {
  score: number;
  scoreFactors: {
    rulePrior: number;
    causalProximity: number;
    recurrence: number;
    evidenceCoverage: number;
  };
}

/**
 * Ranks hypotheses with a deterministic 0..100 heuristic. Scores prioritize triage;
 * they are not probabilities and must not be interpreted as proof of causality.
 */
export function rankRootCauseHypotheses(
  artifact: TrajectoryArtifact,
  history: readonly TrajectoryArtifact[] = [],
): ScoredRootCauseHypothesis[] {
  const hypotheses = inferRootCauseHypotheses(artifact, history);
  const rulePrior: Record<RootCauseHypothesisRule, number> = {
    execution_error: 45,
    assertion_mismatch: 40,
    upstream_state_candidate: 30,
    historical_recurrence: 25,
  };
  const path = artifact.diagnostics.causalPath;
  const pathIndex = new Map(path.map((node, index) => [node.eventId, index]));
  const knownEvents = new Set(artifact.steps.map(step => step.eventId));
  const currentStartedAt = Date.parse(artifact.startedAt);
  const eligibleHistory = history.filter(previous =>
    previous.trajectory.id === artifact.trajectory.id &&
    previous.runId !== artifact.runId &&
    Number.isFinite(Date.parse(previous.finishedAt)) &&
    Number.isFinite(currentStartedAt) &&
    Date.parse(previous.finishedAt) <= currentStartedAt
  );
  return hypotheses.map(hypothesis => {
    const prior = rulePrior[hypothesis.rule];
    const index = pathIndex.get(hypothesis.eventId);
    const causalProximity = index === undefined || path.length === 0
      ? 0
      : Math.max(0, 20 - (path.length - 1 - index) * 5);
    let recurrence = 0;
    if (hypothesis.rule === "historical_recurrence") {
      const matches = eligibleHistory.filter(previous => previous.steps.some(candidate =>
        candidate.clauseId === hypothesis.clauseId &&
        (candidate.status === "diverged" || candidate.status === "failed" || candidate.status === "error")
      )).length;
      const rate = eligibleHistory.length === 0 ? 0 : matches / eligibleHistory.length;
      recurrence = Math.min(20, matches * 6) + Math.round(rate * 5);
    }
    const evidenceCoverage = hypothesis.evidenceEventIds.length === 0
      ? 0
      : Math.round(10 * hypothesis.evidenceEventIds.filter(id =>
          knownEvents.has(id) || eligibleHistory.some(previous => previous.steps.some(step => step.eventId === id))
        ).length / hypothesis.evidenceEventIds.length);
    const score = Math.max(0, Math.min(100, prior + causalProximity + recurrence + evidenceCoverage));
    return { ...hypothesis, score, scoreFactors: { rulePrior: prior, causalProximity, recurrence, evidenceCoverage } };
  }).sort((a, b) => b.score - a.score || a.clauseId.localeCompare(b.clauseId) || a.id.localeCompare(b.id));
}

export function assertTrajectoryPassed(artifact: TrajectoryArtifact): void {
  if (artifact.intent.status !== "passed") {
    throw new Error(`Trajectory ${artifact.runId} ${artifact.intent.status}; first divergence: ${artifact.firstDivergence?.message ?? "none"}`);
  }
}

export { parseTrajestify, TrajestifyParseError } from "./parser.js";
export type { TrajestifyDocument, DslClause, DslClauseKind } from "./parser.js";

export { JsonlTrajectoryHistoryStore } from "./history-store.js";
export type { TrajectoryHistoryStore } from "./history-store.js";

export { bindTrajectory, compileToIR, TrajestifyBindingError } from "./compiler.js";
export type { TrajectoryIR, StepBinding, StepBindings } from "./compiler.js";
