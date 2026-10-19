import test from "node:test";
import assert from "node:assert/strict";
import {
  defineIntent, Given, When, Then, expectValue, runTrajectory, rankRootCauseHypotheses,
} from "../dist/index.js";

const makeFailingIntent = () => defineIntent("inventory_reconcile", "Reconcile inventory", [
  Given("session", "Session is active", () => true),
  When("reserve", "Reserve inventory", () => true),
  Then("stock", "Stock matches reservation", () => expectValue(8, 9)),
]);

async function runAt(runId, startedAt, finishedAt, intent = makeFailingIntent()) {
  const artifact = await runTrajectory(intent, {}, { runId });
  artifact.startedAt = startedAt;
  artifact.finishedAt = finishedAt;
  return artifact;
}

const currentStart = "2026-10-19T10:00:00.000Z";
const currentFinish = "2026-10-19T10:00:01.000Z";

test("calibration: direct divergence evidence outranks isolated recurrence", async () => {
  const previous = await runAt("cal-old", "2026-10-17T10:00:00.000Z", "2026-10-17T10:00:01.000Z");
  const current = await runAt("cal-current", currentStart, currentFinish);
  const ranked = rankRootCauseHypotheses(current, [previous]);
  const direct = ranked.find(item => item.rule === "assertion_mismatch");
  const recurrence = ranked.find(item => item.rule === "historical_recurrence");

  assert.ok(direct);
  assert.ok(recurrence);
  assert.ok(direct.score > recurrence.score, `direct=${direct.score}, recurrence=${recurrence.score}`);
});

test("calibration: repeated eligible recurrence increases recurrence support", async () => {
  const previousA = await runAt("cal-old-a", "2026-10-16T10:00:00.000Z", "2026-10-16T10:00:01.000Z");
  const previousB = await runAt("cal-old-b", "2026-10-17T10:00:00.000Z", "2026-10-17T10:00:01.000Z");
  const current = await runAt("cal-current-repeat", currentStart, currentFinish);

  const oneRun = rankRootCauseHypotheses(current, [previousA])
    .find(item => item.rule === "historical_recurrence");
  const twoRuns = rankRootCauseHypotheses(current, [previousA, previousB])
    .find(item => item.rule === "historical_recurrence");

  assert.ok(oneRun);
  assert.ok(twoRuns);
  assert.ok(twoRuns.score > oneRun.score, `one=${oneRun.score}, two=${twoRuns.score}`);
});

test("calibration: future and unrelated trajectories cannot inflate recurrence score", async () => {
  const previous = await runAt("cal-eligible", "2026-10-17T10:00:00.000Z", "2026-10-17T10:00:01.000Z");
  const future = await runAt("cal-future", "2026-10-20T10:00:00.000Z", "2026-10-20T10:00:01.000Z");
  const unrelated = await runAt("cal-unrelated", "2026-10-18T10:00:00.000Z", "2026-10-18T10:00:01.000Z");
  unrelated.trajectory.id = "another-trajectory";
  const current = await runAt("cal-current-filter", currentStart, currentFinish);

  const baseline = rankRootCauseHypotheses(current, [previous])
    .find(item => item.rule === "historical_recurrence");
  const contaminatedHistory = rankRootCauseHypotheses(current, [previous, future, unrelated])
    .find(item => item.rule === "historical_recurrence");

  assert.ok(baseline);
  assert.ok(contaminatedHistory);
  assert.equal(contaminatedHistory.score, baseline.score);
  assert.deepEqual(contaminatedHistory.scoreFactors, baseline.scoreFactors);
});

test("calibration: ranking uses stable tie-breaking independent of history input order", async () => {
  const first = await runAt("cal-tie-a", "2026-10-16T10:00:00.000Z", "2026-10-16T10:00:01.000Z");
  const second = await runAt("cal-tie-b", "2026-10-17T10:00:00.000Z", "2026-10-17T10:00:01.000Z");
  const current = await runAt("cal-current-tie", currentStart, currentFinish);
  const forward = rankRootCauseHypotheses(current, [first, second]);
  const reverse = rankRootCauseHypotheses(current, [second, first]);

  assert.deepEqual(
    forward.map(({ id, score, scoreFactors }) => ({ id, score, scoreFactors })),
    reverse.map(({ id, score, scoreFactors }) => ({ id, score, scoreFactors })),
  );
});
