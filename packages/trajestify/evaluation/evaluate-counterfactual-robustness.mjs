import { evaluateCounterfactualReplay } from "./evaluate-counterfactual-replay.mjs";

function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (total === 0) return { lower: null, upper: null };
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) / total) + z2 / (4 * total * total)) / denominator;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function baselineSignature(artifact) {
  if (!artifact.firstDivergence) return "passed";
  const clauseId = artifact.steps.find(step => step.eventId === artifact.firstDivergence.eventId)?.clauseId ?? "unknown";
  return `${artifact.firstDivergence.category}:${clauseId}`;
}

/**
 * Summarizes repeated paired counterfactual observations. The Wilson interval
 * describes sampling uncertainty in the observed resolution frequency only;
 * it is not a causal-effect interval.
 *
 * Input: { experiments: [{ repetitionId, replays: [...] }] }
 */
export function evaluateCounterfactualRobustness({ experiments }) {
  if (!Array.isArray(experiments) || experiments.length < 2) {
    throw new Error("At least two independent repetitions are required for robustness evaluation");
  }
  const repetitionIds = new Set();
  const allRunIds = new Set();
  let expectedInterventions = null;
  const observationsByIntervention = new Map();
  const baselineSignatures = [];

  for (let index = 0; index < experiments.length; index += 1) {
    const experiment = experiments[index];
    if (!experiment || typeof experiment.repetitionId !== "string" || !experiment.repetitionId.trim()) {
      throw new Error(`experiments[${index}].repetitionId is required`);
    }
    if (repetitionIds.has(experiment.repetitionId)) {
      throw new Error(`Duplicate repetitionId: ${experiment.repetitionId}`);
    }
    repetitionIds.add(experiment.repetitionId);

    const evaluation = evaluateCounterfactualReplay({ replays: experiment.replays });
    if (allRunIds.has(firstReplay.baseline.runId)) {
      throw new Error(`Baseline run ID reused across repetitions: ${firstReplay.baseline.runId}`);
    }
    allRunIds.add(firstReplay.baseline.runId);
    const current = new Map();
    for (const replay of experiment.replays) {
      const { id, targetClauseId, description } = replay.intervention;
      if (current.has(id)) throw new Error(`Duplicate intervention in repetition ${experiment.repetitionId}: ${id}`);
      current.set(id, { targetClauseId, description });
      if (allRunIds.has(replay.counterfactual.runId)) {
        throw new Error(`Run ID reused across repetitions: ${replay.counterfactual.runId}`);
      }
      allRunIds.add(replay.counterfactual.runId);
      const result = evaluation.results.find(item => item.replayId === replay.replayId);
      observationsByIntervention.set(id, [
        ...(observationsByIntervention.get(id) ?? []),
        { repetitionId: experiment.repetitionId, outcome: result.outcome },
      ]);
    }
    const ids = [...current.keys()].sort();
    if (expectedInterventions === null) {
      expectedInterventions = ids;
    } else if (ids.length !== expectedInterventions.length ||
      ids.some((id, idIndex) => id !== expectedInterventions[idIndex])) {
      throw new Error("Every repetition must contain the same intervention set");
    }
    const firstReplay = experiment.replays[0];
    if (experiment.replays.some(replay => replay.baseline.runId !== firstReplay.baseline.runId)) {
      throw new Error("Each repetition must reuse one shared baseline across interventions");
    }
    const firstBaseline = experiment.replays[0].baseline;
    baselineSignatures.push({
      repetitionId: experiment.repetitionId,
      signature: baselineSignature(firstBaseline),
      runId: firstBaseline.runId,
    });
  }

  if (!expectedInterventions?.length) throw new Error("Each repetition must contain at least one intervention");

  // Ensure intervention target and description do not drift between repetitions.
  const metadata = new Map();
  for (const experiment of experiments) {
    for (const replay of experiment.replays) {
      const value = JSON.stringify({
        targetClauseId: replay.intervention.targetClauseId,
        description: replay.intervention.description,
      });
      const previous = metadata.get(replay.intervention.id);
      if (previous !== undefined && previous !== value) {
        throw new Error(`Intervention metadata changed between repetitions: ${replay.intervention.id}`);
      }
      metadata.set(replay.intervention.id, value);
    }
  }

  const interventions = expectedInterventions.map(id => {
    const observations = observationsByIntervention.get(id) ?? [];
    const counts = { resolved: 0, persists: 0, shifted: 0 };
    for (const observation of observations) counts[observation.outcome] += 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const resolvedRate = counts.resolved / observations.length;
    const interval = wilsonInterval(counts.resolved, observations.length);
    return {
      interventionId: id,
      repetitions: observations.length,
      outcomeCounts: counts,
      resolvedRate,
      resolvedRateWilson95: interval,
      outcomeConsistency: dominant[1] / observations.length,
      dominantOutcome: dominant[0],
      stableResolution: counts.resolved === observations.length,
      interpretation: "Repeated descriptive observations only; the interval is not a causal-effect estimate.",
    };
  });

  const signatureCounts = new Map();
  for (const item of baselineSignatures) signatureCounts.set(item.signature, (signatureCounts.get(item.signature) ?? 0) + 1);
  const baselineStable = signatureCounts.size === 1;
  return {
    schemaVersion: 1,
    method: "repeated-paired-counterfactual-robustness",
    causalClaim: false,
    repetitionCount: experiments.length,
    baselineStability: {
      stable: baselineStable,
      signatureCounts: Object.fromEntries([...signatureCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
      observations: baselineSignatures,
    },
    interventions,
    limitations: [
      "The Wilson interval summarizes the observed resolution frequency, not a causal effect.",
      "Repeated runs do not remove confounding or external side effects.",
      "Baseline instability indicates nondeterminism or changing conditions and weakens intervention comparisons.",
    ],
  };
}
