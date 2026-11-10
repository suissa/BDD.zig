import { evaluateCounterfactualRobustness } from "./evaluate-counterfactual-robustness.mjs";

const OUTCOMES = ["resolved", "persists", "shifted"];

function validateThreshold(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("sensitivityThreshold must be a finite number between 0 and 1");
  }
}

/**
 * Compares repeated counterfactual robustness reports across controlled context
 * conditions. Sensitivity is descriptive: it does not identify causal effects.
 *
 * Input:
 * {
 *   conditions: [
 *     { conditionId, label?, experiments: [{ repetitionId, replays: [...] }] }
 *   ],
 *   sensitivityThreshold?: number // maximum allowed resolution-rate spread
 * }
 */
export function evaluateCounterfactualSensitivity({
  conditions,
  sensitivityThreshold = 0.2,
}) {
  validateThreshold(sensitivityThreshold);
  if (!Array.isArray(conditions) || conditions.length < 2) {
    throw new Error("At least two context conditions are required");
  }

  const conditionIds = new Set();
  const globalRunIds = new Set();
  let expectedInterventions = null;
  let expectedMetadata = null;
  const reports = [];

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    const prefix = `conditions[${index}]`;
    if (!condition || typeof condition.conditionId !== "string" || !condition.conditionId.trim()) {
      throw new Error(`${prefix}.conditionId is required`);
    }
    if (conditionIds.has(condition.conditionId)) {
      throw new Error(`Duplicate conditionId: ${condition.conditionId}`);
    }
    conditionIds.add(condition.conditionId);
    if (condition.label !== undefined &&
        (typeof condition.label !== "string" || !condition.label.trim())) {
      throw new Error(`${prefix}.label must be a non-empty string when provided`);
    }

    if (!Array.isArray(condition.experiments) || condition.experiments.length === 0 ||
        !Array.isArray(condition.experiments[0]?.replays)) {
      throw new Error(`${prefix}.experiments must contain at least one valid repetition`);
    }
    // A repetition deliberately shares one baseline across its interventions.
    // Register that baseline once, then register each counterfactual run separately.
    for (const experiment of condition.experiments) {
      const baselineRunId = experiment.replays[0]?.baseline.runId;
      if (globalRunIds.has(baselineRunId)) {
        throw new Error(`Run ID reused across context conditions: ${baselineRunId}`);
      }
      globalRunIds.add(baselineRunId);
      for (const replay of experiment.replays) {
        const counterfactualRunId = replay.counterfactual.runId;
        if (globalRunIds.has(counterfactualRunId)) {
          throw new Error(`Run ID reused across context conditions: ${counterfactualRunId}`);
        }
        globalRunIds.add(counterfactualRunId);
      }
    }

    const ids = condition.experiments[0].replays.map(replay => replay.intervention.id).sort();
    if (expectedInterventions === null) {
      expectedInterventions = ids;
      expectedMetadata = new Map();
      for (const replay of condition.experiments[0].replays) {
        expectedMetadata.set(replay.intervention.id, JSON.stringify({
          targetClauseId: replay.intervention.targetClauseId,
          description: replay.intervention.description,
        }));
      }
    } else if (ids.length !== expectedInterventions.length ||
      ids.some((id, idIndex) => id !== expectedInterventions[idIndex])) {
      throw new Error("Every context condition must contain the same intervention set");
    }

    for (const experiment of condition.experiments) {
      for (const replay of experiment.replays) {
        const expected = expectedMetadata.get(replay.intervention.id);
        const actual = JSON.stringify({
          targetClauseId: replay.intervention.targetClauseId,
          description: replay.intervention.description,
        });
        if (expected !== actual) {
          throw new Error(`Intervention metadata changed between context conditions: ${replay.intervention.id}`);
        }
      }
    }

    const report = evaluateCounterfactualRobustness({ experiments: condition.experiments });

    reports.push({
      conditionId: condition.conditionId,
      label: condition.label ?? condition.conditionId,
      report,
    });
  }

  const interventions = expectedInterventions.map(interventionId => {
    const byCondition = reports.map(({ conditionId, label, report }) => {
      const item = report.interventions.find(entry => entry.interventionId === interventionId);
      const total = item.repetitions;
      return {
        conditionId,
        label,
        repetitions: total,
        outcomeCounts: item.outcomeCounts,
        outcomeRates: Object.fromEntries(OUTCOMES.map(outcome => [
          outcome, item.outcomeCounts[outcome] / total,
        ])),
        resolvedRate: item.resolvedRate,
        dominantOutcome: item.dominantOutcome,
      };
    });
    const rates = byCondition.map(item => item.resolvedRate);
    const resolutionRateSpread = Math.max(...rates) - Math.min(...rates);
    let maximumDistributionDistance = 0;
    for (let left = 0; left < byCondition.length; left += 1) {
      for (let right = left + 1; right < byCondition.length; right += 1) {
        const distance = OUTCOMES.reduce((sum, outcome) =>
          sum + Math.abs(byCondition[left].outcomeRates[outcome] -
            byCondition[right].outcomeRates[outcome]), 0) / 2;
        maximumDistributionDistance = Math.max(maximumDistributionDistance, distance);
      }
    }
    const dominantOutcomes = new Set(byCondition.map(item => item.dominantOutcome));
    const sensitive = resolutionRateSpread > sensitivityThreshold ||
      dominantOutcomes.size > 1;
    return {
      interventionId,
      contextConditionCount: byCondition.length,
      resolutionRateSpread,
      maximumOutcomeDistributionDistance: maximumDistributionDistance,
      dominantOutcomeChangesAcrossConditions: dominantOutcomes.size > 1,
      sensitive,
      classification: sensitive ? "context-sensitive" : "stable-across-tested-contexts",
      byCondition,
    };
  });

  return {
    schemaVersion: 1,
    method: "cross-context-counterfactual-sensitivity",
    causalClaim: false,
    sensitivityThreshold,
    conditionCount: reports.length,
    conditions: reports.map(({ conditionId, label, report }) => ({
      conditionId,
      label,
      repetitionCount: report.repetitionCount,
      baselineStability: report.baselineStability,
    })),
    interventions,
    limitations: [
      "Sensitivity describes differences observed across supplied context conditions; it does not establish causation.",
      "A stable classification applies only to the tested contexts, fixtures and repetitions.",
      "The resolution-rate threshold is an explicit descriptive policy, not a statistical significance test.",
      "Context conditions should be controlled and documented; unmeasured differences can confound comparisons.",
    ],
  };
}
