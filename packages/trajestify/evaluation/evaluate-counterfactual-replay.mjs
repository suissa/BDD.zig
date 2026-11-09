import { pathToFileURL } from "node:url";
import { rankRootCauseHypotheses } from "../dist/index.js";

function assertArtifact(artifact, label) {
  if (!artifact || typeof artifact.runId !== "string" || !artifact.runId.trim() ||
      typeof artifact.trajectory?.id !== "string" || !artifact.trajectory.id.trim() ||
      !Array.isArray(artifact.steps) || !artifact.intent?.status ||
      !Object.hasOwn(artifact, "firstDivergence")) {
    throw new Error(`${label} must be a Trajestify trajectory artifact`);
  }
  if (!["passed", "diverged", "failed"].includes(artifact.intent.status)) {
    throw new Error(`${label}.intent.status is invalid`);
  }
}

function rankOf(ranked, hypothesisId) {
  if (!hypothesisId) return null;
  const index = ranked.findIndex(item => item.id === hypothesisId);
  return index < 0 ? null : index + 1;
}

function divergenceClause(artifact) {
  if (!artifact.firstDivergence) return null;
  return artifact.steps.find(step => step.eventId === artifact.firstDivergence.eventId)?.clauseId ?? null;
}

/**
 * Compares an observed replay with a controlled counterfactual execution.
 * A resolved divergence is an observed outcome, not proof that the intervention
 * caused the resolution. The evaluator never uses labels to generate rankings.
 */
export function evaluateCounterfactualReplay({ replays }) {
  if (!Array.isArray(replays) || replays.length === 0) {
    throw new Error("At least one replay pair is required");
  }
  const replayIds = new Set();
  const results = replays.map((replay, index) => {
    const prefix = `replays[${index}]`;
    if (!replay || typeof replay.replayId !== "string" || !replay.replayId.trim()) {
      throw new Error(`${prefix}.replayId is required`);
    }
    if (replayIds.has(replay.replayId)) throw new Error(`Duplicate replayId: ${replay.replayId}`);
    replayIds.add(replay.replayId);
    assertArtifact(replay.baseline, `${prefix}.baseline`);
    assertArtifact(replay.counterfactual, `${prefix}.counterfactual`);
    if (replay.baseline.runId === replay.counterfactual.runId) {
      throw new Error(`${prefix} baseline and counterfactual must have distinct runIds`);
    }
    if (replay.baseline.trajectory.id !== replay.counterfactual.trajectory.id) {
      throw new Error(`${prefix} artifacts must belong to the same trajectory`);
    }
    if (!replay.baseline.firstDivergence) {
      throw new Error(`${prefix}.baseline must contain a divergence to replay`);
    }
    const intervention = replay.intervention;
    if (!intervention || typeof intervention.id !== "string" || !intervention.id.trim() ||
        typeof intervention.targetClauseId !== "string" || !intervention.targetClauseId.trim() ||
        typeof intervention.description !== "string" || !intervention.description.trim()) {
      throw new Error(`${prefix}.intervention requires id, targetClauseId and description`);
    }
    const baselineTarget = replay.baseline.steps.find(step => step.clauseId === intervention.targetClauseId);
    const counterfactualTarget = replay.counterfactual.steps.find(step => step.clauseId === intervention.targetClauseId);
    if (!baselineTarget || !counterfactualTarget) {
      throw new Error(`${prefix}.intervention targetClauseId must exist in both artifacts`);
    }

    // Both rankings are produced from their own artifact without ground-truth labels.
    const baselineRanking = rankRootCauseHypotheses(replay.baseline);
    const counterfactualRanking = rankRootCauseHypotheses(replay.counterfactual);
    const baselineDivergenceClauseId = divergenceClause(replay.baseline);
    const counterfactualDivergenceClauseId = divergenceClause(replay.counterfactual);
    const outcome = !replay.counterfactual.firstDivergence
      ? "resolved"
      : counterfactualDivergenceClauseId === baselineDivergenceClauseId
        ? "persists"
        : "shifted";
    const targetHypothesisId = replay.confirmedHypothesisId ?? null;
    return {
      replayId: replay.replayId,
      trajectoryId: replay.baseline.trajectory.id,
      intervention: {
        id: intervention.id,
        targetClauseId: intervention.targetClauseId,
        description: intervention.description,
      },
      baseline: {
        runId: replay.baseline.runId,
        status: replay.baseline.intent.status,
        divergenceClauseId: baselineDivergenceClauseId,
        targetStepStatus: baselineTarget.status,
        rankedHypothesisIds: baselineRanking.map(item => item.id),
        targetHypothesisRank: rankOf(baselineRanking, targetHypothesisId),
      },
      counterfactual: {
        runId: replay.counterfactual.runId,
        status: replay.counterfactual.intent.status,
        divergenceClauseId: counterfactualDivergenceClauseId,
        targetStepStatus: counterfactualTarget.status,
        rankedHypothesisIds: counterfactualRanking.map(item => item.id),
        targetHypothesisRank: rankOf(counterfactualRanking, targetHypothesisId),
      },
      outcome,
      targetHypothesisRankDelta: targetHypothesisId &&
        rankOf(baselineRanking, targetHypothesisId) !== null &&
        rankOf(counterfactualRanking, targetHypothesisId) !== null
          ? rankOf(counterfactualRanking, targetHypothesisId) - rankOf(baselineRanking, targetHypothesisId)
          : null,
      interpretation: "Observed replay comparison only; it does not establish that the intervention caused the outcome.",
    };
  });
  const counts = { resolved: 0, persists: 0, shifted: 0 };
  for (const result of results) counts[result.outcome] += 1;
  return {
    schemaVersion: 1,
    method: "paired-trajectory-counterfactual-replay",
    causalClaim: false,
    replayCount: results.length,
    outcomeCounts: counts,
    results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const inputArg = args.find(arg => arg.startsWith("--input="))?.slice(8);
  if (!inputArg) throw new Error("Usage: node evaluation/evaluate-counterfactual-replay.mjs --input=<replays.json>");
  const { readFile } = await import("node:fs/promises");
  const input = JSON.parse(await readFile(inputArg, "utf8"));
  const result = evaluateCounterfactualReplay(input);
  process.stdout.write(JSON.stringify(result, null, 2) + "\\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
