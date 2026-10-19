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
  dependsOn?: string[];
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
export interface TrajectoryArtifact {
  schemaVersion: 1;
  runId: string;
  intent: { id: string; title: string; status: "passed" | "diverged" | "failed" };
  trajectory: { id: string; status: "passed" | "diverged" | "failed" };
  startedAt: string;
  finishedAt: string;
  steps: StepEvent[];
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
    let errorEvidence: StepEvent["error"];
    if (stopped) {
      status = "blocked";
    } else {
      try {
        observed = await clause.execute(context);
        // A clause may return false to report an assertion mismatch; throw only for execution errors.
        if (observed === false && clause.kind === "then") status = "diverged";
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
      observed,
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
        observed,
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
    summary,
  };
}

export function assertTrajectoryPassed(artifact: TrajectoryArtifact): void {
  if (artifact.intent.status !== "passed") {
    throw new Error(`Trajectory ${artifact.runId} ${artifact.intent.status}; first divergence: ${artifact.firstDivergence?.message ?? "none"}`);
  }
}
