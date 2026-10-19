import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, And, expectValue, runTrajectory, inferRootCauseHypotheses, rankRootCauseHypotheses } from "../dist/index.js";

test("records a complete successful trajectory", async () => {
  const context = { stock: 10, sale: false, financial: false, delivery: false };
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sale", "Create Sales order", c => { c.sale = true; return c.sale; }),
    And("when", "financial", "Record Financial transaction", c => { c.financial = true; return c.financial; }),
    Then("stock", "Stock is 8", c => { c.stock = 8; return c.stock === 8; }),
    And("then", "delivery", "Delivery is scheduled", c => { c.delivery = true; return c.delivery; }),
  ]);
  const artifact = await runTrajectory(intent, context, { runId: "buy-ok" });
  assert.equal(artifact.intent.status, "passed");
  assert.equal(artifact.steps.length, 5);
  assert.equal(artifact.firstDivergence, null);
  assert.equal(artifact.steps[4].clauseId, "delivery");
});

test("stock divergence is pinpointed and downstream trajectory is retained", async () => {
  const context = { stock: 10, sale: false, financial: false, delivery: false };
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", c => { c.sale = true; return true; }),
    And("when", "financial", "Record transaction", c => { c.financial = true; return true; }),
    Then("stock", "Stock is 8", c => { c.stock = 9; return expectValue(8, c.stock); }),
    And("then", "delivery", "Schedule delivery", c => { c.delivery = true; return true; }),
  ]);
  const artifact = await runTrajectory(intent, context, { runId: "buy-stock-divergence" });
  assert.equal(artifact.intent.status, "diverged");
  assert.equal(artifact.firstDivergence?.sequence, 4);
  assert.match(artifact.firstDivergence?.message ?? "", /Stock is 8/);
  assert.equal(artifact.steps.length, 5);
  assert.equal(artifact.steps[3].status, "diverged");
  assert.equal(artifact.steps[3].expected, 8);
  assert.equal(artifact.steps[3].observed, 9);
  assert.equal(artifact.firstDivergence?.expected, 8);
  assert.equal(artifact.firstDivergence?.observed, 9);
  assert.equal(artifact.steps[4].clauseId, "delivery");
  assert.equal(artifact.summary.diverged, 1);
});

test("includes a candidate root cause and ordered causal path for divergence", async () => {
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    And("when", "financial", "Record transaction", () => true),
    Then("stock", "Stock is 8", () => expectValue(8, 9)),
  ]);
  const artifact = await runTrajectory(intent, {}, { runId: "causal-diagnostic" });
  assert.deepEqual(artifact.diagnostics.rootCause, {
    eventId: "causal-diagnostic:evt:4",
    clauseId: "stock",
    confidence: "candidate",
    basis: "first_divergence",
  });
  assert.deepEqual(artifact.diagnostics.causalPath.map(node => node.clauseId), [
    "customer", "sales", "financial", "stock",
  ]);
  assert.equal(artifact.diagnostics.causalPath.at(-1)?.eventId, artifact.firstDivergence?.eventId);
});

test("returns empty causal diagnostics when trajectory has no divergence", async () => {
  const intent = defineIntent("healthy", "Healthy", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    Then("stock", "Stock is 8", () => true),
  ]);
  const artifact = await runTrajectory(intent, {}, { runId: "causal-clean" });
  assert.deepEqual(artifact.diagnostics, { rootCause: null, causalPath: [] });
});


test("derives evidence-linked hypotheses without claiming proven causality", async () => {
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    Then("stock", "Stock is 8", () => expectValue(8, 9)),
  ]);
  const artifact = await runTrajectory(intent, {}, { runId: "hypothesis-evidence" });
  const hypotheses = inferRootCauseHypotheses(artifact);
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0].rule, "assertion_mismatch");
  assert.equal(hypotheses[0].eventId, artifact.firstDivergence?.eventId);
  assert.deepEqual(hypotheses[0].evidenceEventIds, [artifact.firstDivergence?.eventId]);
  assert.equal(hypotheses[0].confidence, "medium");
  assert.match(hypotheses[0].rationale, /observed value/i);
});

test("does not infer root cause hypotheses for a passing trajectory", async () => {
  const intent = defineIntent("healthy", "Healthy", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    Then("stock", "Stock is 8", () => true),
  ]);
  const artifact = await runTrajectory(intent, {}, { runId: "hypothesis-clean" });
  assert.deepEqual(inferRootCauseHypotheses(artifact), []);
});


test("uses only earlier runs of the same trajectory as historical evidence", async () => {
  const makeIntent = () => defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    Then("stock", "Stock is 8", () => expectValue(8, 9)),
  ]);
  const previous = await runTrajectory(makeIntent(), {}, { runId: "history-old" });
  previous.startedAt = "2026-10-17T10:00:00.000Z";
  previous.finishedAt = "2026-10-17T10:00:01.000Z";
  const current = await runTrajectory(makeIntent(), {}, { runId: "history-current" });
  current.startedAt = "2026-10-19T10:00:00.000Z";
  current.finishedAt = "2026-10-19T10:00:01.000Z";
  const hypotheses = inferRootCauseHypotheses(current, [previous]);
  const recurring = hypotheses.find(h => h.rule === "historical_recurrence");
  assert.ok(recurring);
  assert.equal(recurring.clauseId, "stock");
  assert.equal(recurring.confidence, "low");
  assert.deepEqual(recurring.evidenceEventIds, [
    current.firstDivergence.eventId,
    previous.firstDivergence.eventId,
  ]);

  const future = structuredClone(previous);
  future.runId = "history-future";
  future.finishedAt = "2026-10-20T10:00:01.000Z";
  assert.equal(inferRootCauseHypotheses(current, [future]).some(h => h.rule === "historical_recurrence"), false);
  const otherTrajectory = structuredClone(previous);
  otherTrajectory.trajectory.id = "unrelated";
  assert.equal(inferRootCauseHypotheses(current, [otherTrajectory]).some(h => h.rule === "historical_recurrence"), false);
});


test("ranks root cause hypotheses with reproducible scores and visible factors", async () => {
  const intent = defineIntent("buy_product", "Buy product", [
    Given("customer", "Customer is active", () => true),
    When("sales", "Persist sale", () => true),
    Then("stock", "Stock is 8", () => expectValue(8, 9)),
  ]);
  const previous = await runTrajectory(intent, {}, { runId: "rank-history" });
  previous.startedAt = "2026-10-17T10:00:00.000Z";
  previous.finishedAt = "2026-10-17T10:00:01.000Z";
  const current = await runTrajectory(intent, {}, { runId: "rank-current" });
  current.startedAt = "2026-10-19T10:00:00.000Z";
  current.finishedAt = "2026-10-19T10:00:01.000Z";

  const ranked = rankRootCauseHypotheses(current, [previous]);
  assert.ok(ranked.length >= 2);
  assert.deepEqual(ranked, rankRootCauseHypotheses(current, [previous]));
  assert.ok(ranked.every(item => Number.isInteger(item.score) && item.score >= 0 && item.score <= 100));
  assert.ok(ranked.every(item => item.scoreFactors && Number.isInteger(item.scoreFactors.rulePrior)));
  assert.equal(ranked[0].rule, "assertion_mismatch");
  assert.ok(ranked[0].score > ranked.find(item => item.rule === "historical_recurrence").score);
});
