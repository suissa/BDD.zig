import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TrajectoryArtifact } from "./index.js";

export interface TrajectoryHistoryStore {
  append(artifact: TrajectoryArtifact): Promise<void>;
  list(options?: { trajectoryId?: string; before?: string; limit?: number }): Promise<TrajectoryArtifact[]>;
}

/**
 * Append-only JSON Lines history for diagnostic artifacts.
 * Corrupt records fail closed with their line number; they are never silently skipped.
 */
export class JsonlTrajectoryHistoryStore implements TrajectoryHistoryStore {
  constructor(readonly filePath: string) {}

  async append(artifact: TrajectoryArtifact): Promise<void> {
    assertArtifactIdentity(artifact);
    const existing = await this.list();
    if (existing.some(item => item.runId === artifact.runId)) {
      throw new Error(`Trajectory history already contains runId "${artifact.runId}"`);
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(artifact)}\n`, { encoding: "utf8", flag: "a" });
  }

  async list(options: { trajectoryId?: string; before?: string; limit?: number } = {}): Promise<TrajectoryArtifact[]> {
    if (options.before !== undefined && !Number.isFinite(Date.parse(options.before))) {
      throw new Error("History option 'before' must be a valid timestamp");
    }
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
      throw new Error("History option 'limit' must be a non-negative integer");
    }
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const records: TrajectoryArtifact[] = [];
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === "") continue;
      let artifact: unknown;
      try {
        artifact = JSON.parse(line);
      } catch {
        throw new Error(`Invalid trajectory history JSON at line ${i + 1}`);
      }
      if (!isArtifact(artifact)) throw new Error(`Invalid trajectory history artifact at line ${i + 1}`);
      records.push(artifact);
    }
    const filtered = records
      .filter(item => options.trajectoryId === undefined || item.trajectory.id === options.trajectoryId)
      .filter(item => options.before === undefined || Date.parse(item.finishedAt) <= Date.parse(options.before))
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    if (options.limit === 0) return [];
    return options.limit === undefined ? filtered : filtered.slice(-options.limit);
  }
}

function assertArtifactIdentity(artifact: TrajectoryArtifact): void {
  if (!isArtifact(artifact)) throw new Error("Cannot store an invalid trajectory artifact");
  if (!Number.isFinite(Date.parse(artifact.startedAt)) || !Number.isFinite(Date.parse(artifact.finishedAt))) {
    throw new Error("Trajectory artifact must contain valid startedAt and finishedAt timestamps");
  }
  if (Date.parse(artifact.finishedAt) < Date.parse(artifact.startedAt)) {
    throw new Error("Trajectory artifact finishedAt precedes startedAt");
  }
}

function isArtifact(value: unknown): value is TrajectoryArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrajectoryArtifact>;
  return candidate.schemaVersion === 1 &&
    typeof candidate.runId === "string" && candidate.runId.length > 0 &&
    typeof candidate.startedAt === "string" && typeof candidate.finishedAt === "string" &&
    typeof candidate.trajectory?.id === "string" &&
    Array.isArray(candidate.steps) &&
    candidate.summary !== undefined &&
    candidate.diagnostics !== undefined;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
