import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, expectValue, runTrajectory } from "../dist/index.js";
import { evaluateTemporalRanker } from "../evaluation/evaluate-temporal-ranker.mjs";

async function artifact(runId, start, finish) {
  const intent = defineIntent("checkout", "Checkout flow", [
    Given("context", "Context exists", () => true),
    When("charge", "Charge payment", () => true),
    Then("payment", "Payment reconciles", () => expectValue(10, 11)),
  ]);
  const result = await runTrajectory(intent, {}, { runId });
  result.startedAt = start;
  result.finishedAt = finish;
  return result;
}
const cause = "hypothesis:payment:assertion-mismatch";

test("temporal evaluation uses only chronological same-trajectory prefix history", async () => {
  const a = await artifact("run-a", "2026-10-01T10:00:00Z", "2026-10-01T10:00:01Z");
  const b = await artifact("run-b", "2026-10-02T10:00:00Z", "2026-10-02T10:00:01Z");
  const c = await artifact("run-c", "2026-10-03T10:00:00Z", "2026-10-03T10:00:01Z");
  const incidents = [a,b,c].map((item,index)=>({
    caseId:`case-${index}`,runId:item.runId,trajectoryId:item.trajectory.id,
    confirmedRootCause:{hypothesisId:cause},
  }));
  const result=evaluateTemporalRanker({incidents,artifacts:[c,a,b]});
  assert.equal(result.method,"chronological-prefix-history");
  assert.equal(result.incidentCount,3);
  assert.equal(result.trajectoryCount,1);
  assert.deepEqual(result.trajectoryResults[0].observations.map(x=>x.historyCount),[0,1,2]);
  assert.equal(result.mrr,1);
  assert.equal(result.top1Accuracy,1);
  assert.equal(result.rankCoverage,1);
});

test("temporal evaluator rejects unmatched runs, duplicate runs and trajectory mismatch", async()=>{
  const a=await artifact("run-a","2026-10-01T10:00:00Z","2026-10-01T10:00:01Z");
  const incident={caseId:"case-a",runId:"run-a",trajectoryId:a.trajectory.id,confirmedRootCause:{hypothesisId:cause}};
  assert.throws(()=>evaluateTemporalRanker({incidents:[incident],artifacts:[]}),/must not be empty/);
  assert.throws(()=>evaluateTemporalRanker({incidents:[incident],artifacts:[a,a]}),/Duplicate artifact runId/);
  assert.throws(()=>evaluateTemporalRanker({incidents:[incident],artifacts:[{...a,trajectory:{id:"other"}}]}),/Trajectory mismatch/);
  assert.throws(()=>evaluateTemporalRanker({incidents:[incident],artifacts:[a,{...a,runId:"extra"}]}),/match exactly/);
});

test("temporal evaluator rejects invalid timestamps and missing root-cause labels",async()=>{
 const a=await artifact("run-a","2026-10-01T10:00:00Z","2026-10-01T10:00:01Z");
 const incident={caseId:"case-a",runId:"run-a",trajectoryId:a.trajectory.id,confirmedRootCause:{hypothesisId:cause}};
 assert.throws(()=>evaluateTemporalRanker({incidents:[{...incident,confirmedRootCause:{}}],artifacts:[a]}),/confirmedRootCause/);
 assert.throws(()=>evaluateTemporalRanker({incidents:[incident],artifacts:[{...a,startedAt:"bad"}]}),/valid timestamp/);
});
