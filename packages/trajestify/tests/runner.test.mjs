import test from "node:test";
import assert from "node:assert/strict";
import { defineIntent, Given, When, Then, And, expectValue, runTrajectory } from "../dist/index.js";

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
