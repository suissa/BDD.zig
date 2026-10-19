import type { EvidenceKind, SourceLocation } from "./index.js";

export type DslClauseKind = "given" | "when" | "then";
export interface DslClause {
  id: string;
  kind: DslClauseKind;
  expression: string;
  source: SourceLocation;
}
export interface TrajestifyDocument {
  schemaVersion: 1;
  name: string;
  version: 1;
  intent: { id: string };
  actor?: string;
  trajectory: { id: string };
  clauses: DslClause[];
  invariants: string[];
  trace: "full" | "minimal";
  onDivergence: "continue" | "stop";
  evidence: EvidenceKind[];
}
export class TrajestifyParseError extends Error {
  constructor(message: string, readonly source: SourceLocation) {
    super(`${source.file ?? "<input>"}:${source.line}:${source.column}: ${message}`);
    this.name = "TrajestifyParseError";
  }
}
const evidenceKinds = new Set<EvidenceKind>(["inputs", "outputs", "state", "errors", "causal_links", "timing", "logs", "attachments"]);

export function parseTrajestify(source: string, file?: string): TrajestifyDocument {
  let name: string | undefined;
  let version: number | undefined;
  let intent: string | undefined;
  let actor: string | undefined;
  let trajectory: string | undefined;
  let trace: "full" | "minimal" = "full";
  let onDivergence: "continue" | "stop" = "continue";
  let evidence: EvidenceKind[] = ["inputs", "outputs", "state", "errors", "causal_links"];
  const clauses: DslClause[] = [];
  const invariants: string[] = [];
  let previousClause: DslClauseKind | undefined;
  const seen = new Set<string>();

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!;
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const location = { file, line: index + 1, column: raw.indexOf(line) + 1 };
    const colon = line.indexOf(":");
    if (colon < 0) throw new TrajestifyParseError("Expected a reserved keyword followed by ':'", location);
    const keyword = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!value) throw new TrajestifyParseError(`${keyword} value cannot be empty`, location);
    if (["Trajestify", "Version", "Intent", "Actor", "Trajectory"].includes(keyword)) {
      if (seen.has(keyword)) throw new TrajestifyParseError(`Duplicate ${keyword} declaration`, location);
      seen.add(keyword);
    }
    switch (keyword) {
      case "Trajestify": name = value; break;
      case "Version":
        if (value !== "1") throw new TrajestifyParseError("Only Version: 1 is supported", location);
        version = 1; break;
      case "Intent":
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) throw new TrajestifyParseError("Intent must be a stable identifier", location);
        intent = value; break;
      case "Actor": actor = value; break;
      case "Trajectory":
        if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value)) throw new TrajestifyParseError("Trajectory must be an identifier", location);
        trajectory = value; break;
      case "Given":
      case "When":
      case "Then": {
        const kind = keyword.toLowerCase() as DslClauseKind;
        const clause = { id: `clause-${clauses.length + 1}`, kind, expression: value, source: location };
        clauses.push(clause);
        previousClause = kind;
        break;
      }
      case "And":
        if (!previousClause) throw new TrajestifyParseError("And must follow Given, When, Then or And", location);
        clauses.push({ id: `clause-${clauses.length + 1}`, kind: previousClause, expression: value, source: location });
        break;
      case "Invariant": invariants.push(value); break;
      case "Trace":
        if (value !== "full" && value !== "minimal") throw new TrajestifyParseError("Trace must be full or minimal", location);
        trace = value; break;
      case "OnDivergence":
        if (value !== "continue" && value !== "stop") throw new TrajestifyParseError("OnDivergence must be continue or stop", location);
        onDivergence = value; break;
      case "Evidence": {
        const requested = value.split(",").map(part => part.trim()) as EvidenceKind[];
        const unknown = requested.find(kind => !evidenceKinds.has(kind));
        if (unknown) throw new TrajestifyParseError(`Unknown Evidence kind: ${unknown}`, location);
        evidence = [...new Set(requested)];
        break;
      }
      default: throw new TrajestifyParseError(`Unknown reserved keyword: ${keyword}`, location);
    }
  }
  const missing = [
    !name && "Trajestify",
    version === undefined && "Version",
    !intent && "Intent",
    !trajectory && "Trajectory",
    !clauses.some(c => c.kind === "given") && "Given",
    !clauses.some(c => c.kind === "when") && "When",
    !clauses.some(c => c.kind === "then") && "Then",
  ].filter(Boolean);
  if (missing.length) throw new TrajestifyParseError(`Missing required declaration(s): ${missing.join(", ")}`, { file, line: Math.max(1, lines.length), column: 1 });
  return {
    schemaVersion: 1,
    name: name!,
    version: 1,
    intent: { id: intent! },
    ...(actor ? { actor } : {}),
    trajectory: { id: trajectory! },
    clauses,
    invariants,
    trace,
    onDivergence,
    evidence,
  };
}
