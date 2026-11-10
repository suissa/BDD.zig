import { evaluateCounterfactualReplay } from "./evaluate-counterfactual-replay.mjs";
import { evaluateCounterfactualRobustness } from "./evaluate-counterfactual-robustness.mjs";

const PATTERNS = [
  "aligned-with-both-single-interventions",
  "aligned-with-first-single-intervention",
  "aligned-with-second-single-intervention",
  "distinct-from-both-single-interventions",
];

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

/**
 * Compares an explicitly replayed two-intervention combination with each
 * component replay in the same repetition. A distinct combined outcome is a
 * non-compositional observation, not proof of an interaction or causality.
 *
 * Input:
 * {
 *   experiments: [{ repetitionId, replays: [...] }],
 *   combinations: [{ combinationId, interventionIds: [firstId, secondId] }]
 * }
 */
export function evaluateCounterfactualInteractions({ experiments, combinations }) {
  const robustness = evaluateCounterfactualRobustness({ experiments });
  if (!Array.isArray(combinations) || combinations.length === 0) {
    throw new Error("At least one two-intervention combination is required");
  }

  const combinationIds = new Set();
  const interventionSets = new Set();
  const observedByCombination = new Map(
    combinations.map(combination => [combination?.combinationId, []]),
  );

  for (let index = 0; index < combinations.length; index += 1) {
    const combination = combinations[index];
    const prefix = `combinations[${index}]`;
    if (!combination || typeof combination.combinationId !== "string" ||
        !combination.combinationId.trim()) {
      throw new Error(`${prefix}.combinationId is required`);
    }
    if (combinationIds.has(combination.combinationId)) {
      throw new Error(`Duplicate combinationId: ${combination.combinationId}`);
    }
    combinationIds.add(combination.combinationId);
    if (!Array.isArray(combination.interventionIds) ||
        combination.interventionIds.length !== 2 ||
        combination.interventionIds.some(id => typeof id !== "string" || !id.trim()) ||
        combination.interventionIds[0] === combination.interventionIds[1]) {
      throw new Error(`${prefix}.interventionIds must contain two distinct intervention IDs`);
    }
    const key = [...combination.interventionIds].sort().join("\u0000");
    if (interventionSets.has(key)) {
      throw new Error(`Duplicate intervention pair: ${combination.interventionIds.join(" + ")}`);
    }
    interventionSets.add(key);
  }

  const knownIds = new Set(robustness.interventions.map(item => item.interventionId));
  for (const combination of combinations) {
    if (!knownIds.has(combination.combinationId)) {
      throw new Error(`Unknown combined intervention: ${combination.combinationId}`);
    }
    for (const id of combination.interventionIds) {
      if (!knownIds.has(id)) throw new Error(`Unknown component intervention: ${id}`);
    }
  }

  for (const experiment of experiments) {
    const replayReport = evaluateCounterfactualReplay({ replays: experiment.replays });
    const outcomes = new Map(replayReport.results.map(result => [
      result.intervention.id,
      result.outcome,
    ]));
    for (const combination of combinations) {
      const [firstId, secondId] = combination.interventionIds;
      const firstOutcome = outcomes.get(firstId);
      const secondOutcome = outcomes.get(secondId);
      const combinedOutcome = outcomes.get(combination.combinationId);
      if (firstOutcome === undefined || secondOutcome === undefined || combinedOutcome === undefined) {
        throw new Error(`Repetition ${experiment.repetitionId} is missing a component or combined replay for ${combination.combinationId}`);
      }
      const pattern = combinedOutcome === firstOutcome && combinedOutcome === secondOutcome
        ? PATTERNS[0]
        : combinedOutcome === firstOutcome
          ? PATTERNS[1]
          : combinedOutcome === secondOutcome
            ? PATTERNS[2]
            : PATTERNS[3];
      observedByCombination.get(combination.combinationId).push({
        repetitionId: experiment.repetitionId,
        firstInterventionId: firstId,
        secondInterventionId: secondId,
        firstOutcome,
        secondOutcome,
        combinedOutcome,
        pattern,
        distinctFromBoth: pattern === PATTERNS[3],
      });
    }
  }

  const interactions = combinations.map(combination => {
    const observations = observedByCombination.get(combination.combinationId);
    const patternCounts = Object.fromEntries(PATTERNS.map(pattern => [
      pattern,
      observations.filter(item => item.pattern === pattern).length,
    ]));
    const distinctCount = patternCounts[PATTERNS[3]];
    const distinctRate = distinctCount / observations.length;
    return {
      combinationId: combination.combinationId,
      interventionIds: [...combination.interventionIds],
      repetitions: observations.length,
      patternCounts,
      distinctFromBothRate: distinctRate,
      distinctFromBothRateWilson95: wilsonInterval(distinctCount, observations.length),
      interactionSignal: distinctCount > 0
        ? "observed-noncompositional-pattern"
        : "no-distinct-combined-outcome-observed",
      observations,
    };
  });

  return {
    schemaVersion: 1,
    method: "paired-counterfactual-intervention-interaction",
    causalClaim: false,
    repetitionCount: robustness.repetitionCount,
    baselineStability: robustness.baselineStability,
    interventions: robustness.interventions,
    interactions,
    limitations: [
      "A distinct combined outcome is a descriptive non-compositional pattern, not proof of a causal interaction.",
      "The evaluator compares observed categorical outcomes and does not assume numeric additivity.",
      "The combined intervention must be executed explicitly from the same repetition baseline; component outcomes are not synthetically combined.",
      "The Wilson interval describes the observed frequency of distinct-from-both outcomes, not an interaction-effect interval.",
      "External side effects, confounding and baseline instability can invalidate comparisons.",
    ],
  };
}
