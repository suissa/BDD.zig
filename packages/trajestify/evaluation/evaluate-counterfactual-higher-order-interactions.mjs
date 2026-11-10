import { evaluateCounterfactualReplay } from "./evaluate-counterfactual-replay.mjs";
import { evaluateCounterfactualRobustness } from "./evaluate-counterfactual-robustness.mjs";

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

function canonicalSet(ids) {
  return [...ids].sort().join("\u0000");
}

/**
 * Evaluates explicitly replayed higher-order combinations against every
 * non-empty proper subset. A distinct outcome is descriptive, not causal.
 *
 * Input:
 * {
 *   experiments: [{ repetitionId, replays: [...] }],
 *   combinations: [{
 *     combinationId,
 *     interventionIds: [three or more component IDs],
 *     subsets: [{ interventionId, componentIds: [...] }]
 *   }]
 * }
 */
export function evaluateCounterfactualHigherOrderInteractions({ experiments, combinations }) {
  const robustness = evaluateCounterfactualRobustness({ experiments });
  if (!Array.isArray(combinations) || combinations.length === 0) {
    throw new Error("At least one higher-order combination is required");
  }

  const knownIds = new Set(robustness.interventions.map(item => item.interventionId));
  const combinationIds = new Set();
  const componentSets = new Set();
  const prepared = [];

  for (let index = 0; index < combinations.length; index += 1) {
    const combination = combinations[index];
    const prefix = `combinations[${index}]`;
    if (!combination || typeof combination.combinationId !== "string" || !combination.combinationId.trim()) {
      throw new Error(`${prefix}.combinationId is required`);
    }
    if (combinationIds.has(combination.combinationId)) {
      throw new Error(`Duplicate combinationId: ${combination.combinationId}`);
    }
    combinationIds.add(combination.combinationId);

    const components = combination.interventionIds;
    if (!Array.isArray(components) || components.length < 3 ||
        components.some(id => typeof id !== "string" || !id.trim()) ||
        new Set(components).size !== components.length) {
      throw new Error(`${prefix}.interventionIds must contain at least three distinct intervention IDs`);
    }
    if (!knownIds.has(combination.combinationId)) {
      throw new Error(`Unknown combined intervention: ${combination.combinationId}`);
    }
    for (const id of components) {
      if (!knownIds.has(id)) throw new Error(`Unknown component intervention: ${id}`);
    }
    if (components.includes(combination.combinationId)) {
      throw new Error(`${prefix}.combinationId cannot also be a component intervention`);
    }

    const componentKey = canonicalSet(components);
    if (componentSets.has(componentKey)) {
      throw new Error(`Duplicate higher-order component set: ${components.join(" + ")}`);
    }
    componentSets.add(componentKey);

    const expectedSubsetCount = (2 ** components.length) - 2;
    if (!Array.isArray(combination.subsets) || combination.subsets.length !== expectedSubsetCount) {
      throw new Error(`${prefix}.subsets must enumerate every non-empty proper subset (${expectedSubsetCount})`);
    }
    const subsetKeys = new Set();
    const subsets = combination.subsets.map((subset, subsetIndex) => {
      if (!subset || typeof subset.interventionId !== "string" || !subset.interventionId.trim()) {
        throw new Error(`${prefix}.subsets[${subsetIndex}].interventionId is required`);
      }
      if (!knownIds.has(subset.interventionId)) {
        throw new Error(`Unknown subset intervention: ${subset.interventionId}`);
      }
      if (subset.interventionId === combination.combinationId ||
          components.includes(subset.interventionId)) {
        throw new Error(`Subset intervention IDs must be distinct from the full combination and component IDs`);
      }
      if (!Array.isArray(subset.componentIds) || subset.componentIds.length === 0 ||
          subset.componentIds.length >= components.length ||
          subset.componentIds.some(id => !components.includes(id)) ||
          new Set(subset.componentIds).size !== subset.componentIds.length) {
        throw new Error(`${prefix}.subsets[${subsetIndex}].componentIds must describe a non-empty proper subset of the components`);
      }
      const key = canonicalSet(subset.componentIds);
      if (subsetKeys.has(key)) throw new Error(`Duplicate proper subset: ${subset.componentIds.join(" + ")}`);
      subsetKeys.add(key);
      return { interventionId: subset.interventionId, componentIds: [...subset.componentIds] };
    });

    for (let size = 1; size < components.length; size += 1) {
      const expectedAtSize = components.length < 31
        ? binomial(components.length, size)
        : Number.POSITIVE_INFINITY;
      const actualAtSize = subsets.filter(item => item.componentIds.length === size).length;
      if (actualAtSize !== expectedAtSize) {
        throw new Error(`${prefix}.subsets must include every proper subset of size ${size}`);
      }
    }
    prepared.push({ combinationId: combination.combinationId, interventionIds: [...components], subsets });
  }

  const observationsByCombination = new Map(prepared.map(item => [item.combinationId, []]));
  for (const experiment of experiments) {
    const report = evaluateCounterfactualReplay({ replays: experiment.replays });
    const outcomes = new Map(report.results.map(item => [item.intervention.id, item.outcome]));
    for (const combination of prepared) {
      const requiredIds = [
        combination.combinationId,
        ...combination.interventionIds,
        ...combination.subsets.map(item => item.interventionId),
      ];
      for (const id of requiredIds) {
        if (!outcomes.has(id)) {
          throw new Error(`Repetition ${experiment.repetitionId} is missing replay ${id} for ${combination.combinationId}`);
        }
      }
      const combinedOutcome = outcomes.get(combination.combinationId);
      const matchingSubsets = combination.subsets
        .filter(item => outcomes.get(item.interventionId) === combinedOutcome)
        .map(item => item.interventionId);
      observationsByCombination.get(combination.combinationId).push({
        repetitionId: experiment.repetitionId,
        combinedOutcome,
        matchingProperSubsetInterventionIds: matchingSubsets,
        distinctFromAllProperSubsets: matchingSubsets.length === 0,
        pattern: matchingSubsets.length === 0
          ? "distinct-from-all-proper-subsets"
          : "aligned-with-one-or-more-proper-subsets",
      });
    }
  }

  const interactions = prepared.map(combination => {
    const observations = observationsByCombination.get(combination.combinationId);
    const distinctCount = observations.filter(item => item.distinctFromAllProperSubsets).length;
    return {
      combinationId: combination.combinationId,
      interventionIds: combination.interventionIds,
      subsets: combination.subsets,
      repetitions: observations.length,
      distinctFromAllProperSubsetsCount: distinctCount,
      distinctFromAllProperSubsetsRate: distinctCount / observations.length,
      distinctFromAllProperSubsetsRateWilson95: wilsonInterval(distinctCount, observations.length),
      interactionSignal: distinctCount > 0
        ? "observed-higher-order-noncompositional-pattern"
        : "no-distinct-higher-order-outcome-observed",
      observations,
    };
  });

  return {
    schemaVersion: 1,
    method: "higher-order-counterfactual-intervention-interactions",
    causalClaim: false,
    repetitionCount: robustness.repetitionCount,
    baselineStability: robustness.baselineStability,
    interactions,
    limitations: [
      "A full-combination outcome distinct from every explicitly replayed proper subset is descriptive, not proof of a causal higher-order interaction.",
      "Every non-empty proper subset must be executed explicitly from the same repetition baseline; no outcomes are synthesized.",
      "The Wilson interval describes the observed frequency of distinct-from-all-subsets outcomes, not an interaction-effect interval.",
      "The number of required subset replays grows exponentially with the number of component interventions.",
      "External side effects, confounding and baseline instability can invalidate comparisons.",
    ],
  };
}

function binomial(n, k) {
  let result = 1;
  for (let index = 1; index <= Math.min(k, n - k); index += 1) {
    result = (result * (n - index + 1)) / index;
  }
  return Math.round(result);
}
