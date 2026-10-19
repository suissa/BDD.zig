import { defineIntent, type Clause, type IntentDefinition, type SourceLocation } from "./index.js";
import type { TrajestifyDocument } from "./parser.js";

export type StepBinding<C> = (context: C) => unknown | Promise<unknown>;
export type StepBindings<C> = Readonly<Record<string, StepBinding<C>>>;

export class TrajestifyBindingError extends Error {
  constructor(readonly stepId: string, readonly expression: string) {
    super(`No step binding registered for "${stepId}" (expression: "${expression}")`);
    this.name = "TrajestifyBindingError";
  }
}

/**
 * Language-neutral semantic IR produced after parsing. Expressions remain data:
 * adapters must bind each step explicitly; arbitrary DSL text is never evaluated.
 */
export interface TrajectoryIR {
  schemaVersion: 1;
  name: string;
  intentId: string;
  actor?: string;
  trajectoryId: string;
  clauses: Array<{
    id: string;
    kind: "given" | "when" | "then";
    expression: string;
    source: SourceLocation;
  }>;
  invariants: string[];
  trace: "full" | "minimal";
  onDivergence: "continue" | "stop";
  evidence: TrajestifyDocument["evidence"];
}

export function compileToIR(document: TrajestifyDocument): TrajectoryIR {
  return {
    schemaVersion: 1,
    name: document.name,
    intentId: document.intent.id,
    ...(document.actor ? { actor: document.actor } : {}),
    trajectoryId: document.trajectory.id,
    clauses: document.clauses.map(clause => ({
      id: clause.id,
      kind: clause.kind,
      expression: clause.expression,
      source: clause.source,
    })),
    invariants: [...document.invariants],
    trace: document.trace,
    onDivergence: document.onDivergence,
    evidence: [...document.evidence],
  };
}

/**
 * Connects parsed DSL/IR to an executable adapter through explicit bindings.
 * Bindings can use a stable clause id (preferred) or the exact DSL expression.
 */
export function bindTrajectory<C>(
  ir: TrajectoryIR,
  bindings: StepBindings<C>,
): IntentDefinition<C> {
  const clauses: Clause<C>[] = ir.clauses.map(clause => {
    const execute = bindings[clause.id] ?? bindings[clause.expression];
    if (!execute) throw new TrajestifyBindingError(clause.id, clause.expression);
    return { id: clause.id, kind: clause.kind, text: clause.expression, execute, source: clause.source };
  });

  // Invariants are explicit runtime assertions, not silently ignored metadata.
  ir.invariants.forEach((expression, index) => {
    const id = `invariant-${index + 1}`;
    const execute = bindings[id] ?? bindings[expression];
    if (!execute) throw new TrajestifyBindingError(id, expression);
    clauses.push({ id, kind: "invariant", text: expression, execute });
  });

  return defineIntent(ir.intentId, ir.name, clauses, {
    onDivergence: ir.onDivergence,
    trace: ir.trace,
    evidence: ir.evidence,
  });
}
